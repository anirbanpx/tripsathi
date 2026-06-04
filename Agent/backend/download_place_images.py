"""
One-time script: download tourist place photos for all destinations.

Strategy:
  1. Try Unsplash (free, curated travel photos)
  2. Fall back to Wikimedia Commons thumbnail if Unsplash returns nothing

Output:
  - Images → frontend/public/images/places/<slug>.jpg
  - JSON map → frontend/src/lib/placesMap.generated.json

Usage:
  python download_place_images.py --key $UNSPLASH_ACCESS_KEY [--dry-run]
"""

import argparse
import json
import os
import re
import time
from pathlib import Path

import requests

# ── Place catalogue ───────────────────────────────────────────────────────────
# Format: (place_name, destination) → slug key = slugify(place_name + "_" + destination)

PLACES = [
    # Jaisalmer
    ("Sonar Quila Golden Fort", "Jaisalmer", "Jaisalmer Fort golden sandstone desert palace Rajasthan"),
    ("Patwon ki Haveli", "Jaisalmer"),
    ("Salim Singh ki Haveli", "Jaisalmer"),
    ("Gadisar Lake", "Jaisalmer"),
    ("Sam Sand Dunes", "Jaisalmer"),
    ("Khuri Dunes", "Jaisalmer"),
    # Udaipur
    ("City Palace", "Udaipur"),
    ("Jagdish Temple", "Udaipur"),
    ("Lake Pichola", "Udaipur"),
    ("Bagore ki Haveli", "Udaipur"),
    ("Fateh Sagar Lake", "Udaipur"),
    ("Saheliyon ki Bari", "Udaipur"),
    ("Sajjangarh Monsoon Palace", "Udaipur"),
    ("Shilpgram", "Udaipur"),
    # Kerala
    ("Eravikulam National Park", "Munnar"),
    ("Mattupetty Dam", "Munnar"),
    ("Echo Point", "Munnar"),
    ("Top Station", "Munnar"),
    ("Chinese fishing nets", "Fort Kochi"),
    ("Mattancherry Palace Dutch Palace", "Kochi", "Mattancherry Palace Kochi Kerala heritage murals"),
    ("Fort Kochi Beach", "Kochi"),
    ("Krishnapuram Palace", "Kerala"),
    # Guwahati / Northeast
    ("Kamakhya Temple", "Guwahati"),
    ("Umananda Island Temple", "Guwahati"),
    ("Assam State Museum", "Guwahati"),
    ("Kaziranga National Park", "Assam"),
    ("Elephant Falls", "Shillong"),
    ("Don Bosco Museum", "Shillong"),
    ("Ward's Lake", "Shillong"),
    # Puri / Odisha
    ("Jagannath Temple", "Puri"),
    ("Puri Beach", "Puri"),
    ("Chilika Lake", "Odisha"),
    ("Konark Sun Temple", "Odisha"),
    # Goa
    ("Basilica of Bom Jesus", "Goa"),
    ("Se Cathedral", "Goa"),
    ("Savoi Plantation", "Goa"),
    ("Radhanagar Beach", "Andaman"),
    ("Elephant Beach", "Andaman"),
    # Rajasthan
    ("Amber Fort", "Jaipur"),
    ("City Palace", "Jaipur"),
    ("Jantar Mantar", "Jaipur"),
    ("Hawa Mahal", "Jaipur"),
    ("Nahargarh Fort", "Jaipur"),
    ("Mehrangarh Fort", "Jodhpur"),
    ("Jaswant Thada", "Jodhpur"),
    ("Umaid Bhawan Palace", "Jodhpur"),
    ("Brahma Temple", "Pushkar", "Brahma Mandir Pushkar lake ghats Rajasthan pilgrimage"),
    ("Pushkar Lake", "Pushkar"),
    # Ladakh
    ("Leh Palace", "Ladakh"),
    ("Shanti Stupa", "Leh"),
    ("Diskit Monastery", "Ladakh"),
    ("Hunder Sand Dunes", "Ladakh"),
    ("Pangong Lake", "Ladakh"),
    ("Thiksey Monastery", "Ladakh"),
    ("Hemis Monastery", "Ladakh"),
    ("Tso Moriri", "Ladakh"),
    # Coorg
    ("Raja's Seat", "Coorg"),
    ("Madikeri Fort", "Coorg"),
    ("Omkareshwara Temple", "Coorg"),
    ("Abbey Falls", "Coorg"),
    ("Dubare Elephant Camp", "Coorg"),
    ("Brahmagiri Wildlife Sanctuary", "Coorg"),
    # Shimla
    ("Mall Road", "Shimla"),
    ("The Ridge Shimla", "Shimla"),
    ("Jakhu Temple", "Shimla"),
    ("Christ Church Shimla", "Shimla"),
    ("Viceregal Lodge", "Shimla"),
    ("Kufri", "Shimla"),
    ("Chail Palace", "Shimla"),
    # Andaman
    ("Cellular Jail", "Andaman"),
    ("Corbyn's Cove Beach", "Andaman"),
    ("Kalapathar Beach", "Andaman", "Kalapathar Beach Neil Island Andaman turquoise water"),
    ("Laxmanpur Beach", "Andaman", "Laxmanpur Beach Neil Island Andaman sunset coast"),
    ("Bharatpur Beach", "Andaman", "Bharatpur Beach Neil Island Andaman coral reef snorkeling"),
    # Manali
    ("Hadimba Devi Temple", "Manali"),
    ("Vashisht Hot Springs", "Manali"),
    ("Solang Valley", "Manali"),
    ("Rohtang Pass", "Manali"),
    ("Atal Tunnel", "Manali"),
    # Rishikesh
    ("Triveni Ghat", "Rishikesh"),
    ("Parmarth Niketan", "Rishikesh"),
    ("Ram Jhula", "Rishikesh"),
    ("Laxman Jhula", "Rishikesh"),
    ("Beatles Ashram", "Rishikesh"),
    ("Neelkanth Mahadev Temple", "Rishikesh"),
    ("Shivpuri", "Rishikesh"),
    # Varanasi
    ("Dashashwamedh Ghat", "Varanasi"),
    ("Manikarnika Ghat", "Varanasi"),
    ("Assi Ghat", "Varanasi"),
    ("Kashi Vishwanath Temple", "Varanasi"),
    ("Dhamek Stupa", "Sarnath"),
    ("Sarnath Archaeological Museum", "Sarnath"),
    # Mysore
    ("Mysore Palace", "Mysore"),
    ("Devaraja Market", "Mysore"),
    ("St Philomenas Church", "Mysore"),
    ("Chamundeshwari Temple Chamundi Hills", "Mysore"),
    ("Brindavan Gardens KRS Dam", "Mysore", "Brindavan Gardens KRS Dam Mandya Karnataka musical fountain"),
    ("Srirangapatna", "Mysore"),
    # Pondicherry
    ("Promenade Goubert Avenue", "Pondicherry"),
    ("Sri Aurobindo Ashram", "Pondicherry"),
    ("Basilica Sacred Heart of Jesus", "Pondicherry", "Sacred Heart Basilica Pondicherry French colonial church"),
    ("Auroville Matri Mandir", "Pondicherry"),
    ("Paradise Beach", "Pondicherry"),
    ("Serenity Beach", "Pondicherry"),
    # Hampi
    ("Virupaksha Temple", "Hampi"),
    ("Vittala Temple Stone Chariot", "Hampi"),
    ("Lotus Mahal", "Hampi"),
    ("Elephant Stables", "Hampi"),
    ("Matanga Hill", "Hampi"),
    ("Tungabhadra River", "Hampi"),
    ("Hemakuta Hill", "Hampi"),
    # Darjeeling
    ("Tiger Hill", "Darjeeling"),
    ("Batasia Loop", "Darjeeling"),
    ("Himalayan Mountaineering Institute", "Darjeeling"),
    ("Padmaja Naidu Himalayan Zoo", "Darjeeling"),
    ("Happy Valley Tea Estate", "Darjeeling"),
    ("Ghum Monastery", "Darjeeling"),
    ("Peace Pagoda", "Darjeeling"),
    ("Rock Garden Barbotey", "Darjeeling"),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def place_slug(name: str, destination: str) -> str:
    return slugify(f"{name}_{destination}")


_UNSPLASH_RATE_LIMITED = False  # flip to True when rate limit detected


def unsplash_search(query: str, api_key: str) -> str | None:
    """Return a direct download URL for the best Unsplash result, or None."""
    global _UNSPLASH_RATE_LIMITED
    if _UNSPLASH_RATE_LIMITED:
        return None
    try:
        resp = requests.get(
            "https://api.unsplash.com/search/photos",
            params={"query": query, "per_page": 1, "orientation": "landscape"},
            headers={"Authorization": f"Client-ID {api_key}"},
            timeout=10,
        )
        if resp.status_code == 403 or resp.status_code == 429:
            print(f"    Unsplash rate limit hit — switching to Wikimedia only for remaining places")
            _UNSPLASH_RATE_LIMITED = True
            return None
        if not resp.content:
            _UNSPLASH_RATE_LIMITED = True
            return None
        results = resp.json().get("results", [])
        if not results:
            return None
        return results[0]["urls"]["regular"]  # ~1080px wide
    except Exception as e:
        print(f"    Unsplash error: {e}")
        return None


def _wiki_page_thumbnail(article: str) -> str | None:
    try:
        resp = requests.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{requests.utils.quote(article)}",
            timeout=10,
            headers={"User-Agent": "TripSathi/1.0 (portfolio project; anirbanpx2020@email.iimcal.ac.in)"},
        )
        if resp.status_code != 200:
            return None
        thumb = resp.json().get("thumbnail", {})
        url = thumb.get("source", "")
        if not url:
            return None
        # Convert /thumb/.../320px-File.jpg → original full-res image URL
        # This avoids requesting a non-existent upscaled size from Wikimedia
        if "/thumb/" in url:
            return re.sub(r"/thumb/(.+)/\d+px-.+$", r"/\1", url)
        return url
    except Exception:
        return None


def wikimedia_thumbnail(place_name: str, destination: str = "") -> str | None:
    """Try multiple Wikipedia article name variants and return the first thumbnail found."""
    candidates = []
    if destination:
        candidates.append(f"{place_name} {destination}")
    candidates.append(place_name)
    # strip parenthetical suffixes e.g. "Dutch Palace"
    base = place_name.split("(")[0].strip()
    if base != place_name:
        candidates.append(base)
    if destination:
        candidates.append(f"{destination} {place_name}")
        candidates.append(f"{place_name}, {destination}")

    for article in dict.fromkeys(candidates):  # deduplicate, preserve order
        url = _wiki_page_thumbnail(article)
        if url:
            return url
    return None


def download_image(url: str, dest_path: Path) -> bool:
    """Download image from url to dest_path. Returns True on success."""
    try:
        resp = requests.get(
            url,
            timeout=15,
            stream=True,
            headers={"User-Agent": "TripSathi/1.0 (portfolio project; anirbanpx2020@email.iimcal.ac.in)"},
            allow_redirects=True,
        )
        if resp.status_code != 200:
            return False
        content_type = resp.headers.get("Content-Type", "")
        is_wikimedia = "wikimedia.org" in url or "wikipedia.org" in url
        if not is_wikimedia and "image" not in content_type and "octet-stream" not in content_type:
            return False
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)
        return dest_path.stat().st_size > 5000  # reject tiny/broken files
    except Exception as e:
        print(f"    Download error: {e}")
        return False


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--key", required=True, help="Unsplash Access Key")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without downloading")
    parser.add_argument("--wikimedia-only", action="store_true", help="Skip Unsplash, use Wikimedia only")
    args = parser.parse_args()

    if args.wikimedia_only:
        global _UNSPLASH_RATE_LIMITED
        _UNSPLASH_RATE_LIMITED = True

    script_dir = Path(__file__).parent
    img_dir = script_dir.parent / "frontend" / "public" / "images" / "places"
    map_path = script_dir.parent / "frontend" / "src" / "lib" / "placesMap.generated.json"

    img_dir.mkdir(parents=True, exist_ok=True)

    # Load existing map to skip already-downloaded files
    existing_map: dict[str, str] = {}
    if map_path.exists():
        existing_map = json.loads(map_path.read_text())

    results: dict[str, str] = dict(existing_map)
    stats = {"unsplash": 0, "wikimedia": 0, "skipped": 0, "failed": 0}

    print(f"\nProcessing {len(PLACES)} places...\n")

    for entry in PLACES:
        name, destination = entry[0], entry[1]
        query_override = entry[2] if len(entry) > 2 else None
        slug = place_slug(name, destination)
        filename = f"{slug}.jpg"
        dest_path = img_dir / filename

        if slug in existing_map and dest_path.exists():
            print(f"  [SKIP] {name} ({destination})")
            stats["skipped"] += 1
            continue

        print(f"  [ .. ] {name} ({destination})")

        if args.dry_run:
            q = query_override or f"{name} {destination} India"
            print(f"         -> would search: '{q}'")
            continue

        # 1 — Unsplash
        query = query_override or f"{name} {destination} India"
        url = unsplash_search(query, args.key)
        source = "unsplash"

        # 2 — Wikimedia fallback
        if not url:
            print(f"         Unsplash: no results -> trying Wikimedia...")
            url = wikimedia_thumbnail(name, destination)
            source = "wikimedia"

        if not url:
            print(f"         [FAIL] No image found for {name}")
            stats["failed"] += 1
            time.sleep(0.5)
            continue

        if download_image(url, dest_path):
            results[slug] = filename
            stats[source] += 1
            print(f"         [{source.upper()}] OK {filename}")
        else:
            print(f"         [FAIL] Download failed: {url[:80]}")
            stats["failed"] += 1

        # Respect Unsplash rate limit: 50 req/hr = 1 req/1.2s
        time.sleep(1.5)

    # Write JSON map
    if not args.dry_run:
        map_path.write_text(json.dumps(results, indent=2, sort_keys=True))
        print(f"\nMap written -> {map_path}  ({len(results)} entries)")

    print(f"\n-- Coverage report --")
    print(f"  Unsplash:   {stats['unsplash']}")
    print(f"  Wikimedia:  {stats['wikimedia']}")
    print(f"  Skipped:    {stats['skipped']}")
    print(f"  Failed:     {stats['failed']}")
    total = stats['unsplash'] + stats['wikimedia'] + stats['skipped']
    pct = round(100 * total / len(PLACES)) if PLACES else 0
    print(f"  Coverage:   {total}/{len(PLACES)} ({pct}%)")


if __name__ == "__main__":
    main()
