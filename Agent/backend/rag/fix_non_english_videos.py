"""
One-time fix: replace non-English videos and add language metadata to all entries.

Run from backend/:
    python rag/fix_non_english_videos.py [--days N]

  --days N   Look back N days for videos (default: 365)

Requires YOUTUBE_API_KEY env var.
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from pathlib import Path

import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

OUTPUT_FILE = Path(__file__).parent / "destination_videos.json"

NON_ENGLISH = {
    "Ajmer", "Aurangabad", "Bhubaneswar", "Delhi", "Diu",
    "Guwahati", "Haridwar", "Madurai",
    "Mahabaleshwar", "Pushkar",
}


def _parse_iso8601_duration(duration: str) -> int:
    match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
    if not match:
        return 0
    h, m, s = (int(x or 0) for x in match.groups())
    return h * 3600 + m * 60 + s


_NON_EN_KEYWORDS = [
    "in telugu", "in hindi", "in tamil", "in kannada", "in malayalam",
    "in bengali", "in marathi", "in odia", "in gujarati", "in punjabi",
    "telugu lo", "hindi mein", "tamil la",
]

# Unicode ranges for Indic scripts (Devanagari, Bengali, Telugu, Tamil, etc.)
_INDIC_RANGES = [(0x0900, 0x0D7F), (0x0A00, 0x0A7F)]


def _is_english_title(title: str) -> bool:
    lower = title.lower()
    if any(kw in lower for kw in _NON_EN_KEYWORDS):
        return False
    return not any(
        lo <= ord(ch) <= hi
        for ch in title
        for lo, hi in _INDIC_RANGES
    )


def fetch_english_video(destination: str, api_key: str, days: int = 365) -> dict | None:
    from datetime import datetime, timedelta, timezone
    published_after = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")

    search_resp = requests.get(
        "https://www.googleapis.com/youtube/v3/search",
        params={
            "part": "snippet",
            "q": f"{destination} India top places to visit travel guide",
            "type": "video",
            "videoCategoryId": "19",
            "videoDefinition": "high",
            "maxResults": 10,
            "publishedAfter": published_after,
            "relevanceLanguage": "en",
            "key": api_key,
        },
        timeout=15,
    )
    search_resp.raise_for_status()
    items = search_resp.json().get("items", [])
    video_ids = [item["id"]["videoId"] for item in items if item.get("id", {}).get("videoId")]
    if not video_ids:
        return None

    details_resp = requests.get(
        "https://www.googleapis.com/youtube/v3/videos",
        params={
            "part": "contentDetails,statistics,snippet",
            "id": ",".join(video_ids),
            "key": api_key,
        },
        timeout=15,
    )
    details_resp.raise_for_status()

    candidates = []
    for item in details_resp.json().get("items", []):
        snip = item.get("snippet", {})
        title = snip.get("title", "")

        if not _is_english_title(title):
            continue

        dur_s = _parse_iso8601_duration(item.get("contentDetails", {}).get("duration", "PT0S"))
        views = int(item.get("statistics", {}).get("viewCount", 0))
        if dur_s < 300 or views < 50_000:
            continue

        candidates.append({
            "video_id": item["id"],
            "title": title,
            "view_count": views,
            "duration_seconds": dur_s,
            "published_at": snip.get("publishedAt", "")[:10],
            "description": snip.get("description", "")[:300],
            "tags": snip.get("tags", [])[:10],
            "thumbnail_url": f"https://img.youtube.com/vi/{item['id']}/maxresdefault.jpg",
            "language": "en",
        })

    candidates.sort(key=lambda x: x["view_count"], reverse=True)
    return candidates[0] if candidates else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=365, help="Look-back window in days (default: 365)")
    args = parser.parse_args()

    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        logger.error("YOUTUBE_API_KEY not set")
        sys.exit(1)

    if not OUTPUT_FILE.exists():
        logger.error("destination_videos.json not found — run ingest_videos.py first")
        sys.exit(1)

    with open(OUTPUT_FILE, encoding="utf-8") as f:
        data: dict = json.load(f)

    # Only retry destinations still tagged non-en
    to_retry = sorted(dest for dest, entry in data.items() if entry.get("language") == "non-en")
    if not to_retry:
        logger.info("No non-en entries to retry.")
        return

    logger.info("Retrying %d non-en destinations with %d-day window: %s", len(to_retry), args.days, ", ".join(to_retry))

    errors = []
    for i, dest in enumerate(to_retry):
        logger.info("[%d/%d] Re-fetching %s (English, last %d days) ...", i + 1, len(to_retry), dest, args.days)
        try:
            video = fetch_english_video(dest, api_key, days=args.days)
            if video:
                data[dest] = video
                logger.info("  -> %s (%d views)", video["title"][:70], video["view_count"])
            else:
                logger.warning("  -> Still no qualifying English video for %s", dest)
                errors.append(dest)
        except Exception as e:
            logger.error("  -> Error for %s: %s", dest, e)
            errors.append(dest)

        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        if i < len(to_retry) - 1:
            time.sleep(1)

    logger.info("\nDone. %d/%d replaced.", len(to_retry) - len(errors), len(to_retry))
    if errors:
        logger.warning("Still non-en: %s", ", ".join(errors))


if __name__ == "__main__":
    main()
