import json
import logging
import sqlite3
from datetime import datetime, timezone
from uuid import uuid4

from taste import load_taste, save_taste, TasteProfile

_logger = logging.getLogger(__name__)

# re-use same DB as taste.py
import os
from pathlib import Path
DB_PATH = Path(os.getenv("TASTE_DB_PATH", "data/taste.db"))

# keyword → interest category mapping (subset of activity keywords)
_ACTIVITY_INTEREST_MAP: dict[str, str] = {
    # nature
    "backwater": "nature", "waterfall": "nature", "lake": "nature", "hill": "nature",
    "forest": "nature", "garden": "nature", "valley": "nature", "beach": "nature",
    "river": "nature", "coastal": "nature",
    # heritage
    "fort": "heritage", "palace": "heritage", "temple": "heritage", "church": "heritage",
    "mosque": "heritage", "museum": "heritage", "monument": "heritage", "ruins": "heritage",
    "heritage": "heritage", "historical": "heritage",
    # wildlife
    "safari": "wildlife", "tiger": "wildlife", "elephant": "wildlife", "bird": "wildlife",
    "wildlife": "wildlife", "sanctuary": "wildlife", "reserve": "wildlife", "zoo": "wildlife",
    "leopard": "wildlife", "deer": "wildlife",
    # adventure
    "trek": "adventure", "trekking": "adventure", "rafting": "adventure", "paragliding": "adventure",
    "bungee": "adventure", "kayak": "adventure", "cycle": "adventure", "climb": "adventure",
    "surf": "adventure", "diving": "adventure",
    # food
    "food": "food", "cuisine": "food", "restaurant": "food", "street food": "food",
    "cooking": "food", "market": "food", "cafe": "food", "bakery": "food",
    "wine": "food", "tasting": "food",
    # spiritual
    "ashram": "spiritual", "prayer": "spiritual", "meditation": "spiritual", "yoga": "spiritual",
    "pilgrimage": "spiritual", "ghat": "spiritual", "aarti": "spiritual", "puja": "spiritual",
    "shrine": "spiritual", "spiritual": "spiritual",
    # wellness
    "spa": "wellness", "ayurveda": "wellness", "massage": "wellness", "retreat": "wellness",
    "wellness": "wellness", "thermal": "wellness", "hot spring": "wellness", "detox": "wellness",
    "yoga retreat": "wellness", "meditation retreat": "wellness",
    # photography
    "sunrise": "photography", "sunset": "photography", "viewpoint": "photography",
    "photography": "photography", "photo": "photography", "landscape": "photography",
    "golden hour": "photography", "panorama": "photography", "overlook": "photography",
    "scenic": "photography",
    # shopping
    "shopping": "shopping", "bazaar": "shopping", "craft": "shopping", "souvenir": "shopping",
    "textile": "shopping", "handicraft": "shopping", "antique": "shopping", "boutique": "shopping",
    "jewellery": "shopping", "market": "shopping",
}

# destination → top interest tags
_DEST_INTEREST_TAGS: dict[str, list[str]] = {
    "kerala": ["nature", "wellness", "food"],
    "goa": ["beach", "food", "photography"],
    "rajasthan": ["heritage", "photography", "food"],
    "jaipur": ["heritage", "shopping", "photography"],
    "udaipur": ["heritage", "photography", "wellness"],
    "jaisalmer": ["heritage", "adventure", "photography"],
    "jodhpur": ["heritage", "photography", "food"],
    "agra": ["heritage", "photography"],
    "varanasi": ["spiritual", "photography", "heritage"],
    "rishikesh": ["spiritual", "adventure", "wellness"],
    "haridwar": ["spiritual", "heritage"],
    "amritsar": ["spiritual", "heritage", "food"],
    "shimla": ["nature", "adventure", "photography"],
    "manali": ["adventure", "nature", "photography"],
    "spiti": ["adventure", "nature", "photography"],
    "leh": ["adventure", "nature", "photography"],
    "ladakh": ["adventure", "nature", "photography"],
    "darjeeling": ["nature", "photography", "food"],
    "sikkim": ["nature", "adventure", "wildlife"],
    "meghalaya": ["nature", "adventure", "photography"],
    "assam": ["wildlife", "nature", "food"],
    "coorg": ["nature", "food", "wellness"],
    "ooty": ["nature", "photography"],
    "munnar": ["nature", "photography", "wellness"],
    "andaman": ["adventure", "nature", "photography"],
    "pondicherry": ["heritage", "wellness", "food"],
    "hampi": ["heritage", "photography", "adventure"],
    "mysore": ["heritage", "food", "photography"],
    "kolkata": ["heritage", "food", "photography"],
    "mumbai": ["food", "heritage", "shopping"],
    "delhi": ["heritage", "food", "shopping"],
    "hyderabad": ["heritage", "food", "shopping"],
    "bangalore": ["food", "nature", "shopping"],
    "chennai": ["heritage", "food", "beach"],
    "ahmedabad": ["heritage", "food", "shopping"],
    "pune": ["heritage", "food", "nature"],
    "khajuraho": ["heritage", "photography"],
    "bodh gaya": ["spiritual", "heritage"],
    "mathura": ["spiritual", "heritage"],
    "vrindavan": ["spiritual", "photography"],
    "tirupati": ["spiritual", "heritage"],
    "madurai": ["spiritual", "heritage", "food"],
    "ranthambore": ["wildlife", "nature", "photography"],
    "jim corbett": ["wildlife", "nature"],
    "kaziranga": ["wildlife", "nature", "photography"],
    "sundarbans": ["wildlife", "nature", "adventure"],
}


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def _ensure_saves_db() -> None:
    c = _conn()
    try:
        c.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                user_id     TEXT PRIMARY KEY,
                google_sub  TEXT UNIQUE NOT NULL,
                email       TEXT NOT NULL,
                name        TEXT NOT NULL,
                avatar_url  TEXT,
                created_at  TEXT NOT NULL,
                last_login  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS saved_trips (
                id            TEXT PRIMARY KEY,
                user_id       TEXT NOT NULL REFERENCES users(user_id),
                thread_id     TEXT,
                destination   TEXT NOT NULL,
                duration_days INTEGER,
                plan_json     TEXT NOT NULL,
                saved_at      TEXT NOT NULL,
                UNIQUE(user_id, thread_id)
            );

            CREATE TABLE IF NOT EXISTS wishlist (
                id            TEXT PRIMARY KEY,
                user_id       TEXT NOT NULL REFERENCES users(user_id),
                item_type     TEXT NOT NULL,
                name          TEXT NOT NULL,
                location      TEXT,
                metadata_json TEXT,
                saved_at      TEXT NOT NULL,
                UNIQUE(user_id, item_type, name)
            );

            CREATE TABLE IF NOT EXISTS saved_hotels (
                id                    TEXT PRIMARY KEY,
                user_id               TEXT NOT NULL REFERENCES users(user_id),
                name                  TEXT NOT NULL,
                location              TEXT NOT NULL,
                approx_cost_per_night INTEGER,
                reasoning             TEXT,
                content_source        TEXT,
                saved_at              TEXT NOT NULL,
                UNIQUE(user_id, name, location)
            );
        """)
        c.commit()
    finally:
        c.close()


def upsert_user(sub: str, email: str, name: str, avatar: str) -> str:
    now = datetime.now(timezone.utc).isoformat()
    c = _conn()
    try:
        row = c.execute("SELECT user_id FROM users WHERE google_sub = ?", (sub,)).fetchone()
        if row:
            user_id = row["user_id"]
            c.execute("UPDATE users SET last_login = ?, avatar_url = ? WHERE user_id = ?", (now, avatar, user_id))
        else:
            user_id = f"usr_{uuid4().hex[:12]}"
            c.execute(
                "INSERT INTO users (user_id, google_sub, email, name, avatar_url, created_at, last_login) VALUES (?,?,?,?,?,?,?)",
                (user_id, sub, email, name, avatar, now, now),
            )
        c.commit()
        return user_id
    finally:
        c.close()


def get_user(user_id: str) -> dict | None:
    c = _conn()
    try:
        row = c.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        return dict(row) if row else None
    finally:
        c.close()


def save_trip(user_id: str, thread_id: str | None, destination: str, duration_days: int, plan_json: dict) -> str:
    now = datetime.now(timezone.utc).isoformat()
    trip_id = f"trp_{uuid4().hex[:12]}"
    c = _conn()
    try:
        c.execute(
            """INSERT INTO saved_trips (id, user_id, thread_id, destination, duration_days, plan_json, saved_at)
               VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(user_id, thread_id) DO UPDATE SET plan_json=excluded.plan_json, saved_at=excluded.saved_at""",
            (trip_id, user_id, thread_id, destination, duration_days, json.dumps(plan_json), now),
        )
        c.commit()
    finally:
        c.close()
    _update_taste_from_save(user_id, "trip", {"destination": destination, "plan": plan_json})
    return trip_id


def get_saved_trips(user_id: str) -> list[dict]:
    c = _conn()
    try:
        rows = c.execute(
            "SELECT id, destination, duration_days, saved_at FROM saved_trips WHERE user_id = ? ORDER BY saved_at DESC",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        c.close()


def delete_saved_trip(user_id: str, trip_id: str) -> bool:
    c = _conn()
    try:
        cur = c.execute("DELETE FROM saved_trips WHERE id = ? AND user_id = ?", (trip_id, user_id))
        c.commit()
        return cur.rowcount > 0
    finally:
        c.close()


def toggle_wishlist_item(user_id: str, item_type: str, name: str, location: str | None, metadata: dict | None) -> bool:
    c = _conn()
    try:
        row = c.execute(
            "SELECT id FROM wishlist WHERE user_id = ? AND item_type = ? AND name = ?",
            (user_id, item_type, name),
        ).fetchone()
        if row:
            c.execute("DELETE FROM wishlist WHERE id = ?", (row["id"],))
            c.commit()
            return False
        now = datetime.now(timezone.utc).isoformat()
        item_id = f"wl_{uuid4().hex[:12]}"
        c.execute(
            "INSERT INTO wishlist (id, user_id, item_type, name, location, metadata_json, saved_at) VALUES (?,?,?,?,?,?,?)",
            (item_id, user_id, item_type, name, location, json.dumps(metadata or {}), now),
        )
        c.commit()
    finally:
        c.close()
    _update_taste_from_save(user_id, "wishlist", {"item_type": item_type, "name": name})
    return True


def get_wishlist(user_id: str) -> list[dict]:
    c = _conn()
    try:
        rows = c.execute(
            "SELECT id, item_type, name, location, saved_at FROM wishlist WHERE user_id = ? ORDER BY saved_at DESC",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        c.close()


def delete_wishlist_item(user_id: str, item_id: str) -> bool:
    c = _conn()
    try:
        cur = c.execute("DELETE FROM wishlist WHERE id = ? AND user_id = ?", (item_id, user_id))
        c.commit()
        return cur.rowcount > 0
    finally:
        c.close()


def toggle_hotel(user_id: str, name: str, location: str, approx_cost: int | None, reasoning: str | None, content_source: str | None) -> bool:
    c = _conn()
    try:
        row = c.execute(
            "SELECT id FROM saved_hotels WHERE user_id = ? AND name = ? AND location = ?",
            (user_id, name, location),
        ).fetchone()
        if row:
            c.execute("DELETE FROM saved_hotels WHERE id = ?", (row["id"],))
            c.commit()
            return False
        now = datetime.now(timezone.utc).isoformat()
        hotel_id = f"htl_{uuid4().hex[:12]}"
        c.execute(
            """INSERT INTO saved_hotels (id, user_id, name, location, approx_cost_per_night, reasoning, content_source, saved_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (hotel_id, user_id, name, location, approx_cost, reasoning, content_source, now),
        )
        c.commit()
    finally:
        c.close()
    _update_taste_from_save(user_id, "hotel", {
        "approx_cost_per_night": approx_cost or 0,
        "content_source": content_source or "",
    })
    return True


def get_saved_hotels(user_id: str) -> list[dict]:
    c = _conn()
    try:
        rows = c.execute(
            "SELECT id, name, location, approx_cost_per_night, reasoning, content_source, saved_at FROM saved_hotels WHERE user_id = ? ORDER BY saved_at DESC",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        c.close()


def delete_hotel(user_id: str, hotel_id: str) -> bool:
    c = _conn()
    try:
        cur = c.execute("DELETE FROM saved_hotels WHERE id = ? AND user_id = ?", (hotel_id, user_id))
        c.commit()
        return cur.rowcount > 0
    finally:
        c.close()


def _derive_traveler_label(profile: TasteProfile) -> str:
    top = sorted(profile.interests.items(), key=lambda x: x[1], reverse=True)
    top_labels = [k for k, v in top[:2] if v >= 0.5]
    if not top_labels:
        top_labels = [top[0][0]] if top else ["explorer"]
    interest_str = " + ".join(t.capitalize() for t in top_labels)
    if profile.accommodation_taste <= 2:
        budget_label = "budget"
    elif profile.accommodation_taste >= 4:
        budget_label = "premium"
    else:
        budget_label = "mid-range"
    return f"{interest_str} · {budget_label}"


def _update_taste_from_save(user_id: str, save_type: str, data: dict) -> None:
    try:
        profile = load_taste(user_id)
        if profile is None:
            return

        if save_type == "hotel":
            cost = data.get("approx_cost_per_night", 0)
            if cost > 8000:
                profile.accommodation_taste = min(5, round(profile.accommodation_taste * 0.7 + 4.5 * 0.3))
            elif cost < 2500:
                profile.accommodation_taste = max(1, round(profile.accommodation_taste * 0.7 + 2 * 0.3))
            if data.get("content_source") == "rag":
                profile.immersion_style = max(1, round(profile.immersion_style * 0.7 + 2 * 0.3))

        elif save_type == "wishlist":
            name_lower = data.get("name", "").lower()
            for keyword, interest in _ACTIVITY_INTEREST_MAP.items():
                if keyword in name_lower and interest in profile.interests:
                    profile.interests[interest] = min(1.0, profile.interests[interest] + 0.1)

            if data.get("item_type") == "destination":
                dest_key = name_lower.split(",")[0].strip()
                tags = _DEST_INTEREST_TAGS.get(dest_key, [])
                for tag in tags[:2]:
                    if tag in profile.interests:
                        profile.interests[tag] = min(1.0, profile.interests[tag] + 0.1)

        elif save_type == "trip":
            dest_key = data.get("destination", "").lower().split(",")[0].strip()
            tags = _DEST_INTEREST_TAGS.get(dest_key, [])
            for tag in tags[:2]:
                if tag in profile.interests:
                    profile.interests[tag] = min(1.0, profile.interests[tag] + 0.08)
            plan = data.get("plan") or {}
            hotels = plan.get("hotels") or []
            for hotel in hotels[:1]:
                cost = hotel.get("approx_cost_per_night", 0)
                if cost > 8000:
                    profile.accommodation_taste = min(5, round(profile.accommodation_taste * 0.8 + 4.5 * 0.2))
                elif cost < 2500:
                    profile.accommodation_taste = max(1, round(profile.accommodation_taste * 0.8 + 2 * 0.2))

        save_taste(profile)
    except Exception as e:
        _logger.warning("_update_taste_from_save failed user=%s type=%s err=%s", user_id, save_type, e)
