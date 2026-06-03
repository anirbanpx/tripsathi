"""
build_catalog.py — Build D0: One-time LLM extraction script.

Reads each destination knowledge .md file from rag/knowledge/,
calls the LLM to extract structured item catalogs, optionally enriches
with Google Maps ratings, and writes JSON to data/items/{destination}.json.

Usage:
    python build_catalog.py                          # process all destinations
    python build_catalog.py --destination manali     # single destination
    python build_catalog.py --dry-run                # print counts, no file writes
"""

import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Allow imports from backend/ directory
sys.path.insert(0, str(Path(__file__).parent))

from nodes import _call_llm  # noqa: E402

# ---------------------------------------------------------------------------
# Optional Google Maps enrichment — silently unavailable if tools.py missing
# ---------------------------------------------------------------------------
try:
    from tools import execute_tool as _execute_tool  # type: ignore

    _TOOLS_AVAILABLE = True
except ImportError:
    _TOOLS_AVAILABLE = False


# ---------------------------------------------------------------------------
# Extraction prompt
# ---------------------------------------------------------------------------

EXTRACTION_SYSTEM = """
You are extracting structured travel items from a destination knowledge document.

For each distinct place, activity, hotel, restaurant, or experience mentioned, produce one item.
Include only items with enough detail to fill most fields.

Respond ONLY with a JSON array. Each element must match this schema exactly:
{ "name": str, "area": str, "type": "activity|hotel|restaurant|experience|viewpoint",
  "interest_tags": [str], "cost_inr": int|null, "cost_tier": "free|budget|mid|premium",
  "duration_hours": float|null, "time_of_day": "morning|afternoon|evening|night|any",
  "indoor_outdoor": "indoor|outdoor|both", "terrain": "flat|hilly|steep|mixed|water",
  "toddler_ok": bool, "child_min_age": int|null, "elderly_ok": bool, "mobility_ok": bool,
  "best_months": [str], "avoid_months": [str], "source_excerpt": str }

Rules:
- interest_tags: pick from [nature, heritage, food, adventure, photography, spiritual, wildlife, shopping, wellness, nightlife]
- best_months / avoid_months: use 3-letter lowercase e.g. ["oct", "nov"]
- cost_tier: free=₹0, budget=under ₹500pp, mid=₹500-2000pp, premium=over ₹2000pp
- source_excerpt: 1-2 sentences from the document describing this item
- If a field is genuinely unknown, use null/[]
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _slugify(s: str) -> str:
    """Convert a string to a lowercase slug suitable for use in an ID."""
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def _enrich_with_ratings(items: list, destination: str) -> None:
    """Try to fetch Google Maps ratings for each item. Silently skips on any error."""
    if not _TOOLS_AVAILABLE:
        return
    for item in items:
        try:
            result = _execute_tool("search_places", f"{item['name']} {destination}")
            if result and isinstance(result, list) and len(result) > 0:
                rating = result[0].get("rating")
                if rating is not None:
                    item["google_rating"] = float(rating)
        except Exception:
            pass  # silently skip — enrichment is best-effort


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Extract structured item catalogs from destination knowledge .md files."
    )
    parser.add_argument(
        "--destination",
        help="Single destination slug to process (e.g. manali). Omit to process all.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print item count only, don't write files.",
    )
    args = parser.parse_args()

    knowledge_dir = Path("rag/knowledge")
    output_dir = Path("data/items")
    output_dir.mkdir(parents=True, exist_ok=True)

    md_files = sorted(knowledge_dir.glob("*.md"))
    if args.destination:
        md_files = [f for f in md_files if f.stem == args.destination]

    if not md_files:
        print(
            f"No .md files found"
            + (f" for destination '{args.destination}'" if args.destination else "")
            + f" in {knowledge_dir.resolve()}"
        )
        sys.exit(1)

    total_items = 0

    for md_file in md_files:
        destination = md_file.stem
        content = md_file.read_text(encoding="utf-8")
        print(f"Extracting {destination}...", end=" ", flush=True)

        try:
            raw_items = _call_llm(
                EXTRACTION_SYSTEM,
                f"Destination: {destination}\n\nDocument:\n{content}",
                max_tokens=4096,
            )
        except Exception as e:
            print(f"FAILED: {e}")
            continue

        # LLM sometimes wraps result in {"items": [...]} or {"data": [...]}
        if isinstance(raw_items, dict):
            raw_items = raw_items.get("items", raw_items.get("data", []))

        if not isinstance(raw_items, list):
            print(f"FAILED: unexpected response type {type(raw_items).__name__}")
            continue

        items = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            item["id"] = f"{_slugify(destination)}_{_slugify(item.get('name', 'unknown'))}"
            item["destination"] = destination
            item.setdefault("google_rating", None)
            items.append(item)

        # Optional Google Maps enrichment
        if os.getenv("GOOGLE_MAPS_API_KEY"):
            _enrich_with_ratings(items, destination)

        total_items += len(items)

        if args.dry_run:
            print(f"{len(items)} items (dry run)")
        else:
            out_path = output_dir / f"{destination}.json"
            out_path.write_text(
                json.dumps(items, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            print(f"{len(items)} items → {out_path}")

    print(f"\nDone. {len(md_files)} destination(s) processed, {total_items} items total.")


if __name__ == "__main__":
    main()
