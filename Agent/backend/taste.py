# TasteProfile dataclass + SQLite persistence

from dataclasses import dataclass, field, asdict
import json, sqlite3, os
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(os.getenv("TASTE_DB_PATH", "data/taste.db"))


@dataclass
class TasteProfile:
    user_id: str
    # Core taste dimensions (each 1–5 scale unless noted)
    pace: int = 3                        # 1=very slow, 5=packed
    crowd_tolerance: int = 3             # 1=avoid crowds, 5=fine with crowds
    immersion_style: int = 3             # 1=local/authentic, 5=curated/comfort
    food_adventurousness: int = 3        # 1=safe/familiar, 5=adventurous
    walking_tolerance: int = 3           # 1=minimal walking, 5=happy to walk 10km+
    planning_density: int = 3            # 1=slow/unplanned, 5=every hour planned
    accommodation_taste: int = 3         # 1=boutique/homestay, 5=chain/resort
    # Weighted interest vector (0.0–1.0 per interest, sum need not equal 1)
    interests: dict = field(default_factory=lambda: {
        "nature": 0.5, "heritage": 0.5, "food": 0.5, "adventure": 0.5,
        "photography": 0.5, "spiritual": 0.5, "wildlife": 0.5,
        "shopping": 0.5, "wellness": 0.5, "nightlife": 0.5,
    })
    dietary_restrictions: list = field(default_factory=list)  # ["vegetarian", "vegan", ...]
    hard_avoids: list = field(default_factory=list)           # ["crowded markets", "extreme heat"]
    decision_style: str = "L2"            # "L1" | "L2" | "L3"
    # Per-dimension confidence (0.0–1.0); starts low, rises as we learn
    confidence: dict = field(default_factory=lambda: {
        "pace": 0.1, "crowd_tolerance": 0.1, "immersion_style": 0.1,
        "food_adventurousness": 0.1, "walking_tolerance": 0.1,
        "planning_density": 0.1, "accommodation_taste": 0.1,
        "interests": 0.1,
    })


def _ensure_db() -> None:
    """Create the SQLite DB and table if they don't exist."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS taste_profiles (
                user_id TEXT PRIMARY KEY,
                profile_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.commit()
    finally:
        conn.close()


def load_taste(user_id: str) -> "TasteProfile | None":
    """Read a TasteProfile from SQLite; returns None if not found."""
    _ensure_db()
    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            "SELECT profile_json FROM taste_profiles WHERE user_id = ?",
            (user_id,)
        ).fetchone()
    finally:
        conn.close()

    if row is None:
        return None

    data = json.loads(row[0])
    return TasteProfile(**data)


def save_taste(profile: TasteProfile) -> None:
    """Upsert a TasteProfile to SQLite."""
    _ensure_db()
    profile_json = json.dumps(asdict(profile))
    updated_at = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            """
            INSERT INTO taste_profiles (user_id, profile_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                profile_json = excluded.profile_json,
                updated_at = excluded.updated_at
            """,
            (profile.user_id, profile_json, updated_at)
        )
        conn.commit()
    finally:
        conn.close()


def merge_taste(existing: TasteProfile, updates: dict) -> TasteProfile:
    """Merge a partial update dict into an existing TasteProfile.

    - Scalar int fields: replaced directly.
    - interests: merged key by key (only keys present in updates["interests"]).
    - lists (dietary_restrictions, hard_avoids): replaced.
    - confidence: bumps each provided dimension by +0.2, capped at 1.0.
    """
    scalar_int_fields = {
        "pace", "crowd_tolerance", "immersion_style", "food_adventurousness",
        "walking_tolerance", "planning_density", "accommodation_taste",
    }

    current = asdict(existing)

    for key, value in updates.items():
        if key == "user_id":
            continue
        elif key in scalar_int_fields:
            current[key] = int(value)
            # bump confidence for this dimension
            current["confidence"][key] = min(1.0, current["confidence"].get(key, 0.1) + 0.2)
        elif key == "interests":
            for interest_key, interest_val in value.items():
                current["interests"][interest_key] = float(interest_val)
            current["confidence"]["interests"] = min(
                1.0, current["confidence"].get("interests", 0.1) + 0.2
            )
        elif key in ("dietary_restrictions", "hard_avoids"):
            current[key] = list(value)
        elif key == "decision_style":
            current[key] = value
        elif key == "confidence":
            for dim, val in value.items():
                current["confidence"][dim] = min(1.0, float(val))

    return TasteProfile(**current)


def taste_to_summary(profile: TasteProfile) -> str:
    """Return a 2-sentence human-readable summary for LLM context injection."""
    pace_desc = {1: "very slow-paced", 2: "relaxed", 3: "moderate", 4: "active", 5: "packed"}.get(profile.pace, "moderate")
    crowd_desc = "avoids crowds" if profile.crowd_tolerance <= 2 else ("fine with crowds" if profile.crowd_tolerance >= 4 else "moderately comfortable with crowds")
    food_desc = "prefers safe/familiar food" if profile.food_adventurousness <= 2 else ("loves adventurous eating" if profile.food_adventurousness >= 4 else "moderately adventurous with food")

    top_interests = [k for k, v in sorted(profile.interests.items(), key=lambda x: x[1], reverse=True) if v >= 0.7]
    interest_str = (", ".join(top_interests[:3]) if top_interests else "general sightseeing")

    sentence1 = f"Traveller prefers {pace_desc} trips with high interest in {interest_str}."

    details = []
    if crowd_desc != "moderately comfortable with crowds":
        details.append(crowd_desc.capitalize())
    if food_desc != "moderately adventurous with food":
        details.append(food_desc.capitalize())
    if profile.dietary_restrictions:
        details.append(", ".join(profile.dietary_restrictions))
    if profile.hard_avoids:
        avoids = ", ".join(profile.hard_avoids[:3])
        details.append(f"avoids {avoids}")

    sentence2 = "; ".join(details) + "." if details else "No specific restrictions noted."

    return f"{sentence1} {sentence2}"
