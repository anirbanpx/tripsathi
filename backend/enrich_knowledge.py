"""
enrich_knowledge.py — Regenerate destination knowledge files with web-grounded research.

For each destination, runs 5 Tavily/DDG searches, then calls an LLM (Cerebras → Groq → Gemini)
with the enhanced generate_knowledge_prompt.txt + research context to produce richer files
(15-20 attractions, 2025 pricing, Getting There / Hidden Gems / Practical Tips sections).

Run from backend/ directory:
    python enrich_knowledge.py --destination shimla --force   # test on one destination first
    python enrich_knowledge.py --force                        # regenerate all destinations
    python enrich_knowledge.py --dry-run                      # list targets without running
    python enrich_knowledge.py --force --reindex              # regenerate + push to Qdrant
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# Force UTF-8 output on Windows (cp1252 can't encode ₹, →, etc.)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

KNOWLEDGE_DIR = Path(__file__).parent / "rag" / "knowledge"
DESTINATIONS_JSON = Path(__file__).parent / "data" / "destinations.json"

SLEEP_BETWEEN = 5.0          # seconds between destinations (rate-limit buffer)
SEARCH_PAUSE = 1.0           # seconds between individual searches per destination
MAX_TOKENS = 6000
SEARCH_BUDGET_PER_QUERY = 1200  # chars kept per search block (5 × 1200 = 6000 chars total)

# All 8 required sections for the enriched format.
REQUIRED_SECTIONS = [
    "## Routing",
    "## General",
    "Best time",
    "Transport",
    "Medical",
    "## Getting There",
    "## Hidden Gems",
    "## Practical Tips",
]

MIN_WORDS = 800

SEARCH_TEMPLATES = [
    "{dest} India top tourist attractions complete guide 2025",
    "{dest} India entry fees ticket prices timings 2025",
    "{dest} India travel scams tourist traps warnings tips",
    "{dest} India hidden gems off beat lesser known places",
    "{dest} India how to reach train bus flight getting there",
]

# Borrow stable helpers from generate_knowledge.py (same directory).
import generate_knowledge as _gk

DEST_DISPLAY = _gk.DEST_DISPLAY
_make_client = _gk._make_client
_load_system_prompt = _gk._load_system_prompt


def _available_providers() -> list[str]:
    """True three-tier: Cerebras → Groq → Gemini (all configured providers)."""
    providers = []
    if os.environ.get("FALLBACK1_LLM_API_KEY"):
        providers.append("cerebras")
    if os.environ.get("GROQ_API_KEY"):
        providers.append("groq")
    if os.environ.get("FALLBACK2_LLM_API_KEY"):
        providers.append("gemini")
    return providers


def _validate(text: str) -> list[str]:
    """Return validation failures (empty list = valid output)."""
    failures = []
    if not text.strip().startswith("#"):
        failures.append("<must start with # heading>")
    for marker in REQUIRED_SECTIONS:
        if marker not in text:
            failures.append(f"missing section: {marker!r}")
    words = len(text.split())
    if words < MIN_WORDS:
        failures.append(f"<too short: {words} words, need >= {MIN_WORDS}>")
    return failures


def _research(dest_display_name: str) -> str:
    """Run 5 web searches; return per-query-truncated combined research text."""
    from tools import web_search  # deferred: avoids loading OTel tracer at import time

    # Use plain name — e.g. "Shimla" from "Shimla (Himachal Pradesh)"
    dest = dest_display_name.split(" (")[0].split(" /")[0].strip()

    blocks = []
    for template in SEARCH_TEMPLATES:
        query = template.format(dest=dest)
        print(f"    search: {query[:65]}...", flush=True)
        result = web_search(query)
        # Truncate per-block so all 5 themes reach the LLM context
        if len(result) > SEARCH_BUDGET_PER_QUERY:
            result = result[:SEARCH_BUDGET_PER_QUERY] + "...[truncated]"
        blocks.append(f"=== Query: {query} ===\n{result}")
        time.sleep(SEARCH_PAUSE)

    return "\n\n".join(blocks)


def enrich_one(dest_slug: str, system_prompt: str, providers: list[str]) -> str | None:
    """Research + generate enriched knowledge for one destination. Returns markdown or None."""
    display = DEST_DISPLAY.get(dest_slug, dest_slug.replace("_", " ").title())
    dest_title = display.split(" (")[0].split(" /")[0].strip()

    # Step 1: web research
    print(f"  Researching {dest_slug}...")
    research = _research(display)

    # Step 2: LLM generation with research context
    user_msg = (
        f"Generate the knowledge file for: {display}.\n\n"
        f"Use this recent web research to ensure accurate 2025 pricing, "
        f"complete attraction coverage (minimum 12 named attractions with full detail), "
        f"and verified practical details:\n\n"
        f"<research>\n{research}\n</research>\n\n"
        f"Output ONLY the raw markdown. No intro sentence, no commentary, no code fences. "
        f"Start the output directly with '# {dest_title} Travel Knowledge'."
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

            failures = _validate(text)
            if failures:
                print(f"INVALID — {failures}")
                print(f"    ...tail: {text[-300:].replace(chr(10), ' | ')}")
                continue

            words = len(text.split())
            print(f"ok ({words} words)")
            return text

        except Exception as e:
            print(f"ERROR: {e}")
            continue

    return None


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enrich destination knowledge files with web-grounded research."
    )
    parser.add_argument("--destination", help="Single destination slug (e.g. shimla)")
    parser.add_argument("--dry-run", action="store_true",
                        help="List targets without running searches or LLM calls")
    parser.add_argument("--force", action="store_true",
                        help="Overwrite existing .md files (required to enrich already-generated files)")
    parser.add_argument("--reindex", action="store_true",
                        help="Run reindex.py after generation to push updated chunks to Qdrant")
    args = parser.parse_args()

    providers = _available_providers()
    if not providers:
        print("ERROR: No LLM API keys found. Set FALLBACK1_LLM_API_KEY, GROQ_API_KEY, or FALLBACK2_LLM_API_KEY.")
        sys.exit(1)
    print(f"Providers: {', '.join(providers)}")

    all_dests = list(json.loads(DESTINATIONS_JSON.read_text()).keys())

    if args.destination:
        if args.destination not in all_dests:
            print(f"WARNING: '{args.destination}' not in destinations.json — running anyway.")
        targets = [args.destination]
    else:
        if args.force:
            targets = all_dests
        else:
            existing = {f.stem for f in KNOWLEDGE_DIR.glob("*.md")}
            targets = [d for d in all_dests if d not in existing]

    if not targets:
        print("No targets. All destination files exist — use --force to regenerate.")
        return

    print(f"\n{'DRY RUN — ' if args.dry_run else ''}Targets ({len(targets)}):")
    for d in targets:
        display = DEST_DISPLAY.get(d, d.replace("_", " ").title())
        exists = "EXISTS" if (KNOWLEDGE_DIR / f"{d}.md").exists() else "MISSING"
        print(f"  [{exists}]  {d:22s}  {display}")

    if args.dry_run:
        return

    system_prompt = _load_system_prompt()
    generated, failed = [], []

    for i, dest_slug in enumerate(targets):
        out_path = KNOWLEDGE_DIR / f"{dest_slug}.md"
        display  = DEST_DISPLAY.get(dest_slug, dest_slug.replace("_", " ").title())
        print(f"\n[{i+1}/{len(targets)}] {dest_slug} ({display})")

        text = enrich_one(dest_slug, system_prompt, providers)

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
        print(f"  Re-run with --destination <slug> --force to retry individual ones.")

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
