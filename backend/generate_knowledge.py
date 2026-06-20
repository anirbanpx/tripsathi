"""
generate_knowledge.py — Batch-generate destination knowledge .md files via Cerebras.

Primary LLM: Cerebras (FALLBACK1_* env vars) — 1M token/day free tier.
Fallback LLM: Gemini (FALLBACK2_* env vars).

For each destination in data/destinations.json without a rag/knowledge/<dest>.md file,
calls the LLM with the format spec from rag/generate_knowledge_prompt.txt and writes output.

Run from backend/ directory:
    python generate_knowledge.py                         # all missing destinations
    python generate_knowledge.py --destination delhi     # single destination
    python generate_knowledge.py --dry-run               # list what would be generated
    python generate_knowledge.py --force                 # regenerate even if file exists
    python generate_knowledge.py --reindex               # run reindex.py after generation
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

# Force UTF-8 output on Windows (cp1252 can't encode ₹, ≥, →, etc.)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

KNOWLEDGE_DIR = Path(__file__).parent / "rag" / "knowledge"
DESTINATIONS_JSON = Path(__file__).parent / "data" / "destinations.json"
PROMPT_FILE = Path(__file__).parent / "rag" / "generate_knowledge_prompt.txt"

SLEEP_BETWEEN = 4.0   # seconds between calls — Cerebras rate-limit buffer
MAX_TOKENS = 4096     # Delhi/Mumbai need full budget; 600-900 words ≈ 900-1400 tokens
REQUIRED_SECTIONS = [
    "## Routing",
    "## General",
    "Best time",
    "Transport",
    "Medical",
]

# Human-readable names for destination slugs (passed to the LLM)
DEST_DISPLAY = {
    "kochi":       "Kochi (Kerala)",
    "alleppey":    "Alleppey / Alappuzha (Kerala)",
    "munnar":      "Munnar (Kerala)",
    "kovalam":     "Kovalam (Kerala)",
    "thekkady":    "Thekkady / Periyar (Kerala)",
    "varkala":     "Varkala (Kerala)",
    "wayanad":     "Wayanad (Kerala)",
    "kumarakom":   "Kumarakom (Kerala)",
    "panaji":      "Panaji / North Goa (Goa)",
    "jaipur":      "Jaipur (Rajasthan)",
    "jodhpur":     "Jodhpur (Rajasthan)",
    "pushkar":     "Pushkar (Rajasthan)",
    "ranthambore": "Ranthambore National Park (Rajasthan)",
    "mount_abu":   "Mount Abu (Rajasthan)",
    "delhi":       "Delhi / New Delhi",
    "agra":        "Agra (Uttar Pradesh)",
    "amritsar":    "Amritsar (Punjab)",
    "haridwar":    "Haridwar (Uttarakhand)",
    "khajuraho":   "Khajuraho (Madhya Pradesh)",
    "dharamsala":  "Dharamsala / McLeod Ganj (Himachal Pradesh)",
    "leh":         "Leh / Ladakh",
    "nainital":    "Nainital (Uttarakhand)",
    "mussoorie":   "Mussoorie (Uttarakhand)",
    "spiti":       "Spiti Valley (Himachal Pradesh)",
    "ooty":        "Ooty / Udhagamandalam (Tamil Nadu)",
    "kodaikanal":  "Kodaikanal (Tamil Nadu)",
    "mahabalipuram": "Mahabalipuram (Tamil Nadu)",
    "madurai":     "Madurai (Tamil Nadu)",
    "mumbai":      "Mumbai (Maharashtra)",
    "bangalore":   "Bangalore / Bengaluru (Karnataka)",
    "chennai":     "Chennai (Tamil Nadu)",
    "hyderabad":   "Hyderabad (Telangana)",
    "kolkata":     "Kolkata (West Bengal)",
    "bhubaneswar": "Bhubaneswar (Odisha)",
    "havelock":    "Havelock Island / Swaraj Dweep (Andaman & Nicobar)",
    "ahmedabad":   "Ahmedabad (Gujarat)",
    "kutch":       "Rann of Kutch (Gujarat)",
    "jim_corbett": "Jim Corbett National Park (Uttarakhand)",
    "kaziranga":   "Kaziranga National Park (Assam)",
}


# ── LLM client setup ─────────────────────────────────────────────────────────

def _available_providers() -> list[str]:
    providers = []
    if os.environ.get("FALLBACK1_LLM_API_KEY"):
        providers.append("cerebras")
    # Gemini uses a different auth scope — only add if GROQ_API_KEY missing
    if os.environ.get("GROQ_API_KEY"):
        providers.append("groq")
    elif os.environ.get("FALLBACK2_LLM_API_KEY"):
        providers.append("gemini")
    return providers


def _make_client(provider: str) -> tuple[OpenAI, str]:
    """Return (client, model) for the given provider name."""
    if provider == "cerebras":
        url   = os.environ.get("FALLBACK1_LLM_BASE_URL", "https://api.cerebras.ai/v1")
        key   = os.environ["FALLBACK1_LLM_API_KEY"]
        model = os.environ.get("FALLBACK1_LLM_MODEL", "gpt-oss-120b")
    elif provider == "groq":
        url   = "https://api.groq.com/openai/v1"
        key   = os.environ["GROQ_API_KEY"]
        model = "llama-3.3-70b-versatile"
    elif provider == "gemini":
        url   = os.environ.get("FALLBACK2_LLM_BASE_URL",
                               "https://generativelanguage.googleapis.com/v1beta/openai/")
        key   = os.environ["FALLBACK2_LLM_API_KEY"]
        model = os.environ.get("FALLBACK2_LLM_MODEL", "gemini-2.5-flash")
    else:
        raise ValueError(f"Unknown provider: {provider}")
    return OpenAI(base_url=url, api_key=key), model


# ── System prompt ─────────────────────────────────────────────────────────────

def _load_system_prompt() -> str:
    """Read generate_knowledge_prompt.txt, strip the destinations/usage sections."""
    raw = PROMPT_FILE.read_text(encoding="utf-8")
    # Keep everything before the destinations list
    cutoff = raw.find("## DESTINATIONS TO GENERATE")
    if cutoff != -1:
        raw = raw[:cutoff].rstrip()
    # Append the rule about not naming specific hotels
    raw += (
        "\n\n9. **Do NOT name specific hotels, guesthouses, or restaurants** — "
        "those are fetched live via Google Maps. Describe price ranges and area/type only.\n"
    )
    return raw


# ── Validation ────────────────────────────────────────────────────────────────

def _validate(text: str, dest_slug: str) -> list[str]:
    """Return list of missing required sections (empty = valid)."""
    missing = []
    for marker in REQUIRED_SECTIONS:
        if marker not in text:
            missing.append(marker)
    # Must start with a heading
    if not text.strip().startswith("#"):
        missing.append("<must start with # heading>")
    # Word count check
    words = len(text.split())
    if words < 400:
        missing.append(f"<too short: {words} words, need >= 400>")
    return missing


# ── Core generation ───────────────────────────────────────────────────────────

def generate_one(dest_slug: str, system_prompt: str, providers: list[str]) -> str | None:
    """Generate knowledge text for a destination. Returns markdown string or None."""
    display = DEST_DISPLAY.get(dest_slug, dest_slug.replace("_", " ").title())
    user_msg = (
        f"Generate the knowledge file for: {display}.\n\n"
        f"Output ONLY the raw markdown. No intro sentence, no commentary, no code fences. "
        f"Start the output directly with '# {display.split(' (')[0]} Travel Knowledge'."
    )

    for provider in providers:
        try:
            client, model = _make_client(provider)
            print(f"    [{provider}] calling {model}...", end=" ", flush=True)
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_msg},
                ],
                max_tokens=MAX_TOKENS,
                temperature=0.4,
            )
            text = resp.choices[0].message.content or ""
            text = text.strip()
            # Strip accidental code fences
            if text.startswith("```"):
                text = "\n".join(text.split("\n")[1:])
            if text.endswith("```"):
                text = "\n".join(text.split("\n")[:-1])
            text = text.strip()

            missing = _validate(text, dest_slug)
            if missing:
                print(f"INVALID — missing: {missing}")
                # Show tail of output to help diagnose
                tail = text[-300:].replace("\n", " | ")
                print(f"    ...tail: {tail}")
                continue  # try next provider

            words = len(text.split())
            print(f"ok ({words} words)")
            return text

        except Exception as e:
            print(f"ERROR: {e}")
            continue

    return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate missing destination knowledge .md files via Cerebras."
    )
    parser.add_argument("--destination", help="Single destination slug (e.g. delhi)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be generated without writing files")
    parser.add_argument("--force", action="store_true",
                        help="Regenerate even if .md file already exists")
    parser.add_argument("--reindex", action="store_true",
                        help="Run reindex.py after generation to push to Qdrant")
    args = parser.parse_args()

    providers = _available_providers()
    if not providers:
        print("ERROR: No LLM API keys found. Set FALLBACK1_LLM_API_KEY or FALLBACK2_LLM_API_KEY.")
        sys.exit(1)
    print(f"Providers available: {', '.join(providers)}")

    # Determine target destinations
    all_dests = list(json.loads(DESTINATIONS_JSON.read_text()).keys())

    if args.destination:
        if args.destination not in all_dests:
            print(f"WARNING: '{args.destination}' not in destinations.json — generating anyway.")
        targets = [args.destination]
    else:
        if args.force:
            targets = all_dests
        else:
            existing = {f.stem for f in KNOWLEDGE_DIR.glob("*.md")}
            targets = [d for d in all_dests if d not in existing]

    if not targets:
        print("All destinations already have knowledge files. Use --force to regenerate.")
        return

    print(f"\n{'DRY RUN — ' if args.dry_run else ''}Destinations to generate ({len(targets)}):")
    for d in targets:
        display = DEST_DISPLAY.get(d, d.replace("_", " ").title())
        status = "EXISTS" if (KNOWLEDGE_DIR / f"{d}.md").exists() else "MISSING"
        print(f"  {'[skip-exists]' if status == 'EXISTS' and not args.force else ''}  {d:20s}  {display}")

    if args.dry_run:
        return

    system_prompt = _load_system_prompt()
    generated, failed = [], []

    for i, dest_slug in enumerate(targets):
        out_path = KNOWLEDGE_DIR / f"{dest_slug}.md"
        display  = DEST_DISPLAY.get(dest_slug, dest_slug.replace("_", " ").title())
        print(f"\n[{i+1}/{len(targets)}] {dest_slug} ({display})")

        text = generate_one(dest_slug, system_prompt, providers)

        if text:
            out_path.write_text(text, encoding="utf-8")
            print(f"    → written: {out_path.name}")
            generated.append(dest_slug)
        else:
            print(f"    FAILED — skipping {dest_slug}")
            failed.append(dest_slug)

        if i < len(targets) - 1:
            time.sleep(SLEEP_BETWEEN)

    print(f"\n{'='*60}")
    print(f"Done. Generated: {len(generated)}  Failed: {len(failed)}")
    if generated:
        print(f"  Generated: {', '.join(generated)}")
    if failed:
        print(f"  Failed:    {', '.join(failed)}")
        print(f"  Re-run with --destination <slug> to retry individual ones.")

    if args.reindex and generated:
        print("\nRunning reindex.py...")
        result = subprocess.run(
            [sys.executable, str(Path(__file__).parent / "reindex.py")],
            cwd=Path(__file__).parent,
        )
        if result.returncode != 0:
            print("reindex.py exited with errors — check output above.")


if __name__ == "__main__":
    main()
