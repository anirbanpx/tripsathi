"""Fast-path template store — match incoming plan requests to pre-baked templates.

Templates live in backend/templates/*.json (produced by generate_templates.py).
Loaded once at import time; kept in memory.

match() returns a template dict on a canonical-key hit with no personalization signal,
or None to let the caller fall through to the live pipeline.
"""
import json
import os
from typing import Optional

_TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")
_store: dict[str, dict] = {}


def _load() -> None:
    if not os.path.isdir(_TEMPLATES_DIR):
        return
    for fname in os.listdir(_TEMPLATES_DIR):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(_TEMPLATES_DIR, fname), encoding="utf-8") as f:
                t = json.load(f)
            key = t.get("key") or fname[:-5]
            _store[key] = t
        except Exception:
            pass


_load()


def canonical_key(destination: str, trip_parameters: dict) -> str:
    dest = destination.lower().replace(" ", "_")
    # frontend sends duration_days; backend bake script sends duration_nights — handle both
    nights = trip_parameters.get("duration_nights")
    if nights is None:
        nights = max(0, trip_parameters.get("duration_days", 1) - 1)
    party = trip_parameters.get("party_size", 1)
    kid_ages = trip_parameters.get("kid_ages") or []
    elderly = trip_parameters.get("elderly", False)
    # frontend may send either key
    budget = trip_parameters.get("budget_bracket") or trip_parameters.get("budget", "mid")
    styles = sorted(trip_parameters.get("trip_style") or [])

    kids = "k" + "-".join(str(a) for a in sorted(kid_ages)) if kid_ages else "nokids"
    return (
        f"{dest}_{nights}n_p{party}"
        f"_{kids}_{'elderly' if elderly else 'fit'}"
        f"_{budget}_{'_'.join(styles)}"
    )


def match(
    destination: str,
    trip_parameters: dict,
    traveler_notes: str = "",
    onboarding_answers: Optional[list] = None,
) -> Optional[dict]:
    """Return a pre-baked template if key matches and there is no personalization signal.

    Personalization guard: only traveler_notes is a real signal.
    onboarding_answers from streamPlan are always present (derived from params),
    so they are NOT a signal — only block on non-empty traveler_notes.
    """
    if traveler_notes and traveler_notes.strip():
        return None

    key = canonical_key(destination, trip_parameters)
    return _store.get(key)


def template_count() -> int:
    return len(_store)
