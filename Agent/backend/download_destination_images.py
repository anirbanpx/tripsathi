#!/usr/bin/env python3
"""
Download destination images from Unsplash and generate frontend mapping.

Usage:
    python download_destination_images.py --key YOUR_UNSPLASH_ACCESS_KEY

Get a free key at: https://unsplash.com/developers (create an app, copy Access Key)

Outputs:
    backend/static/images/destinations/{name}.jpg   — downloaded images
    backend/data/destinations.json                   — backend name→file mapping
    frontend/src/lib/destinationMap.generated.json   — frontend import mapping
"""

import os
import json
import time
import argparse
import requests
from pathlib import Path

# ── Top 50+ Indian tourist destinations ──────────────────────────────────────

DESTINATIONS = [
    # Kerala
    {"name": "Kerala",      "query": "Kerala backwaters India green landscape"},
    {"name": "Kochi",       "query": "Kochi Fort Cochin Kerala waterfront India"},
    {"name": "Alleppey",    "query": "Alleppey houseboat backwaters Kerala India"},
    {"name": "Munnar",      "query": "Munnar tea plantation hills Kerala India"},
    {"name": "Kovalam",     "query": "Kovalam beach lighthouse Kerala India"},
    {"name": "Thekkady",    "query": "Thekkady Periyar lake wildlife Kerala"},
    {"name": "Varkala",     "query": "Varkala cliff beach Kerala India"},
    {"name": "Wayanad",     "query": "Wayanad misty forest Kerala India"},
    {"name": "Kumarakom",   "query": "Kumarakom backwaters sunset Kerala India"},

    # Goa
    {"name": "Goa",         "query": "Goa beach sunset palm trees India"},
    {"name": "Panaji",      "query": "Panaji Panjim Goa colonial architecture India"},

    # Rajasthan
    {"name": "Jaipur",      "query": "Jaipur Hawa Mahal pink city Rajasthan India"},
    {"name": "Udaipur",     "query": "Udaipur lake palace Rajasthan India"},
    {"name": "Jodhpur",     "query": "Jodhpur blue city Mehrangarh fort Rajasthan"},
    {"name": "Jaisalmer",   "query": "Jaisalmer golden fort desert Rajasthan India"},
    {"name": "Pushkar",     "query": "Pushkar lake Brahma temple Rajasthan India"},
    {"name": "Ranthambore", "query": "Ranthambore tiger safari fort Rajasthan India"},
    {"name": "Mount Abu",   "query": "Mount Abu Nakki lake hill station Rajasthan"},

    # North India
    {"name": "Delhi",       "query": "Delhi Red Fort India Gate cityscape"},
    {"name": "Agra",        "query": "Agra Taj Mahal sunrise India"},
    {"name": "Varanasi",    "query": "Varanasi ghats Ganges sunrise India"},
    {"name": "Amritsar",    "query": "Amritsar Golden Temple night reflection India"},
    {"name": "Rishikesh",   "query": "Rishikesh Ganges suspension bridge India"},
    {"name": "Haridwar",    "query": "Haridwar Ganges ghat aarti India"},
    {"name": "Khajuraho",   "query": "Khajuraho temples Madhya Pradesh India"},

    # Himalayas
    {"name": "Manali",      "query": "Manali snow mountains Himachal Pradesh India"},
    {"name": "Shimla",      "query": "Shimla colonial hill station Himachal Pradesh India"},
    {"name": "Dharamsala",  "query": "Dharamsala McLeod Ganj Himalayas India"},
    {"name": "Leh",         "query": "Leh Ladakh monastery mountains India landscape"},
    {"name": "Nainital",    "query": "Nainital lake mountains Uttarakhand India"},
    {"name": "Mussoorie",   "query": "Mussoorie hill station Uttarakhand India mist"},
    {"name": "Spiti",       "query": "Spiti Valley Himachal Pradesh India barren mountains"},

    # South India
    {"name": "Mysore",      "query": "Mysore palace Karnataka India illuminated"},
    {"name": "Hampi",       "query": "Hampi ruins boulders Karnataka India"},
    {"name": "Coorg",       "query": "Coorg Kodagu coffee plantation Karnataka India"},
    {"name": "Ooty",        "query": "Ooty Nilgiris tea garden Tamil Nadu India"},
    {"name": "Kodaikanal",  "query": "Kodaikanal lake hill station Tamil Nadu India"},
    {"name": "Pondicherry", "query": "Pondicherry French quarter promenade beach India"},
    {"name": "Mahabalipuram","query": "Mahabalipuram shore temple Tamil Nadu India"},
    {"name": "Madurai",     "query": "Madurai Meenakshi temple Tamil Nadu India"},

    # Metro cities
    {"name": "Mumbai",      "query": "Mumbai Marine Drive cityscape India night"},
    {"name": "Bangalore",   "query": "Bangalore Bengaluru Lalbagh garden India"},
    {"name": "Chennai",     "query": "Chennai Marina beach sunrise Tamil Nadu India"},
    {"name": "Hyderabad",   "query": "Hyderabad Charminar old city India"},
    {"name": "Kolkata",     "query": "Kolkata Howrah Bridge Victoria Memorial India"},

    # East India
    {"name": "Darjeeling",  "query": "Darjeeling tea garden Kanchenjunga West Bengal India"},
    {"name": "Puri",        "query": "Puri beach Jagannath temple Odisha India"},
    {"name": "Bhubaneswar", "query": "Bhubaneswar Lingaraj temple Odisha India"},

    # Islands
    {"name": "Andaman",     "query": "Andaman Islands turquoise beach India"},
    {"name": "Havelock",    "query": "Havelock Island Andaman pristine beach India"},

    # West India
    {"name": "Ahmedabad",   "query": "Ahmedabad Sabarmati ashram Gujarat India"},
    {"name": "Kutch",       "query": "Rann of Kutch salt desert white Gujarat India"},

    # Wildlife
    {"name": "Jim Corbett", "query": "Jim Corbett National Park jungle Uttarakhand India"},
    {"name": "Kaziranga",   "query": "Kaziranga National Park rhino Assam India"},
]


def normalize(name: str) -> str:
    return (
        name.lower()
        .replace(" ", "_")
        .replace("/", "_")
        .replace("'", "")
    )


def download_file(url: str, dest: Path) -> bool:
    try:
        r = requests.get(url, stream=True, timeout=30)
        r.raise_for_status()
        dest.write_bytes(r.content)
        return True
    except Exception as e:
        print(f"  ✗ download error: {e}")
        return False


def main(access_key: str, skip_existing: bool = True):
    images_dir = Path(__file__).parent / "static" / "images" / "destinations"
    images_dir.mkdir(parents=True, exist_ok=True)

    data_dir = Path(__file__).parent / "data"
    data_dir.mkdir(exist_ok=True)

    frontend_lib = Path(__file__).parent.parent / "frontend" / "src" / "lib"

    mapping: dict[str, str] = {}
    ok, skipped, failed = 0, 0, 0

    headers = {"Authorization": f"Client-ID {access_key}"}

    for dest in DESTINATIONS:
        key = normalize(dest["name"])
        filename = f"{key}.jpg"
        filepath = images_dir / filename

        if skip_existing and filepath.exists():
            mapping[key] = filename
            skipped += 1
            print(f"  >> {dest['name']} -- already exists")
            continue

        print(f"  DL {dest['name']}...", end=" ", flush=True)

        # Search Unsplash
        try:
            resp = requests.get(
                "https://api.unsplash.com/search/photos",
                params={"query": dest["query"], "orientation": "landscape", "per_page": 3},
                headers=headers,
                timeout=10,
            )
            resp.raise_for_status()
        except Exception as e:
            print(f"API error: {e}")
            failed += 1
            continue

        results = resp.json().get("results", [])
        if not results:
            print("no results")
            failed += 1
            continue

        photo = results[0]
        image_url = photo["urls"]["regular"]  # ~1080px wide JPEG

        # Trigger Unsplash download event (required by their API terms)
        try:
            requests.get(photo["links"]["download_location"], headers=headers, timeout=10)
        except Exception:
            pass

        if download_file(image_url, filepath):
            mapping[key] = filename
            ok += 1
            print(f"OK (by {photo['user']['name']})")
        else:
            failed += 1

        time.sleep(5)  # conservative — free tier is 50 req/hour

    # ── Write backend mapping ─────────────────────────────────────────────────
    backend_json = data_dir / "destinations.json"
    backend_json.write_text(json.dumps(mapping, indent=2, ensure_ascii=False))

    # ── Write frontend mapping ────────────────────────────────────────────────
    frontend_json = frontend_lib / "destinationMap.generated.json"
    frontend_json.write_text(json.dumps(mapping, indent=2, ensure_ascii=False))

    print(f"\nDone: {ok} downloaded  {skipped} skipped  {failed} failed")
    print(f"Mapping -> {backend_json}")
    print(f"Frontend -> {frontend_json}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download Unsplash destination images")
    parser.add_argument("--key", required=True, help="Unsplash Access Key")
    parser.add_argument("--force", action="store_true", help="Re-download existing images")
    args = parser.parse_args()
    main(args.key, skip_existing=not args.force)
