"""
One-time script to pre-ingest YouTube video metadata for all destinations.

Run from backend/:
    python rag/ingest_videos.py

Requires YOUTUBE_API_KEY env var. Output committed to rag/destination_videos.json.
Cost: 54 destinations × 101 API units ≈ 5,454 units (fits free daily quota in one run).
Re-run annually to refresh video freshness.
"""

import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DESTINATIONS = [
    "Agra", "Ahmedabad", "Ajmer", "Alleppey", "Amritsar",
    "Andaman Islands", "Aurangabad", "Bhopal", "Bhubaneswar", "Coorg",
    "Darjeeling", "Delhi", "Diu", "Goa", "Guwahati",
    "Hampi", "Haridwar", "Hyderabad", "Jaipur", "Jaisalmer",
    "Jodhpur", "Kanyakumari", "Kaziranga", "Khajuraho", "Kochi",
    "Kodaikanal", "Kolkata", "Kovalam", "Kullu Manali", "Leh Ladakh",
    "Lonavala", "Madurai", "Mahabaleshwar", "Manali", "Mahabalipuram",
    "Mcleod Ganj", "Munnar", "Mumbai", "Mussoorie", "Mysore",
    "Nainital", "Ooty", "Puri", "Pushkar", "Pondicherry",
    "Ranthambore", "Rishikesh", "Shimla", "Srinagar", "Thekkady",
    "Udaipur", "Varanasi", "Varkala", "Vizag",
]

OUTPUT_FILE = Path(__file__).parent / "destination_videos.json"


def _parse_iso8601_duration(duration: str) -> int:
    match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
    if not match:
        return 0
    h, m, s = (int(x or 0) for x in match.groups())
    return h * 3600 + m * 60 + s


def fetch_best_video(destination: str, api_key: str, published_after: str) -> dict | None:
    # Call 1: search.list (100 units)
    search_resp = requests.get(
        "https://www.googleapis.com/youtube/v3/search",
        params={
            "part": "snippet",
            "q": f"{destination} top places to visit travel guide",
            "type": "video",
            "videoCategoryId": "19",
            "videoDefinition": "high",
            "maxResults": 5,
            "publishedAfter": published_after,
            "key": api_key,
        },
        timeout=15,
    )
    search_resp.raise_for_status()
    items = search_resp.json().get("items", [])
    video_ids = [item["id"]["videoId"] for item in items if item.get("id", {}).get("videoId")]
    if not video_ids:
        return None

    # Call 2: videos.list (1 unit)
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
        dur_s = _parse_iso8601_duration(item.get("contentDetails", {}).get("duration", "PT0S"))
        views = int(item.get("statistics", {}).get("viewCount", 0))
        if dur_s < 300 or views < 50_000:
            continue
        snip = item.get("snippet", {})
        candidates.append({
            "video_id": item["id"],
            "title": snip.get("title", ""),
            "view_count": views,
            "duration_seconds": dur_s,
            "published_at": snip.get("publishedAt", "")[:10],
            "description": snip.get("description", "")[:300],
            "tags": snip.get("tags", [])[:10],
            "thumbnail_url": f"https://img.youtube.com/vi/{item['id']}/maxresdefault.jpg",
        })

    candidates.sort(key=lambda x: x["view_count"], reverse=True)
    return candidates[0] if candidates else None


def main():
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        logger.error("YOUTUBE_API_KEY not set")
        sys.exit(1)

    published_after = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Load existing file so we can skip already-fetched destinations
    existing: dict = {}
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, encoding="utf-8") as f:
            existing = json.load(f)
        logger.info("Loaded %d existing entries from %s", len(existing), OUTPUT_FILE)

    results = dict(existing)
    errors = []

    for i, dest in enumerate(DESTINATIONS):
        if dest in results:
            logger.info("[%d/%d] Skipping %s (already ingested)", i + 1, len(DESTINATIONS), dest)
            continue
        logger.info("[%d/%d] Fetching %s ...", i + 1, len(DESTINATIONS), dest)
        try:
            video = fetch_best_video(dest, api_key, published_after)
            if video:
                results[dest] = video
                logger.info("  -> %s (%d views, %ds)", video["title"][:60], video["view_count"], video["duration_seconds"])
            else:
                logger.warning("  -> No qualifying video found for %s", dest)
                errors.append(dest)
        except Exception as e:
            logger.error("  -> Error for %s: %s", dest, e)
            errors.append(dest)

        # Save after each destination so partial results survive interruption
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

        # Respect quota: 1 second between destinations
        if i < len(DESTINATIONS) - 1:
            time.sleep(1)

    logger.info("\nDone. %d/%d destinations ingested.", len(results), len(DESTINATIONS))
    if errors:
        logger.warning("No video found for: %s", ", ".join(errors))


if __name__ == "__main__":
    main()
