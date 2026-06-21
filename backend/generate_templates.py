"""Build script: bake pre-baked plan templates for the fast-path explore feature.

Run manually when prompts or RAG content change:
    cd backend && python generate_templates.py [--specs DEST1,DEST2] [--dry-run]

Each template is saved to backend/templates/<key>.json with:
    {key, plan, places_fallback, trip_parameters, meta:{generated_at, pipeline_version}}

~20 one-time graph.invoke runs -- ~27k tokens each. Mind the 200k/day Groq cap;
bake in batches (use --specs) across days if needed.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from uuid import uuid4

from dotenv import load_dotenv
load_dotenv()

from graph import graph
from nodes import _fetch_places_for_plan

PIPELINE_VERSION = "1.0"

# ---------------------------------------------------------------------------
# Template specs -- 5 static + 15 dynamic (3 seasons x 5)
# Each bake_month is the month used in start_date so RAG seasonal_context is coherent.
# ---------------------------------------------------------------------------
_M = {
    "Jan": "2027-01-10", "Apr": "2026-04-10", "May": "2026-05-10",
    "Jun": "2026-06-10", "Jul": "2026-07-10", "Aug": "2026-08-10",
    "Sep": "2026-09-10", "Oct": "2026-10-10", "Nov": "2026-11-10",
    "Dec": "2026-12-10",
}

TEMPLATE_SPECS = [
    # --- STATIC (tier=static, always shown) ---
    {
        "destination": "Mysore",
        "duration_nights": 3, "duration_days": 4,
        "party_size": 2, "kid_ages": [10], "elderly": False,
        "budget": "mid", "trip_style": ["heritage", "food"],
        "start_date": _M["Dec"], "tier": "static",
    },
    {
        "destination": "Hampi",
        "duration_nights": 3, "duration_days": 4,
        "party_size": 2, "kid_ages": [], "elderly": False,
        "budget": "budget", "trip_style": ["heritage", "photography"],
        "start_date": _M["Jan"], "tier": "static",
    },
    {
        "destination": "Udaipur",
        "duration_nights": 4, "duration_days": 5,
        "party_size": 2, "kid_ages": [], "elderly": False,
        "budget": "premium", "trip_style": ["heritage", "romance"],
        "start_date": _M["Nov"], "tier": "static",
    },
    {
        "destination": "Munnar",
        "duration_nights": 3, "duration_days": 4,
        "party_size": 2, "kid_ages": [], "elderly": False,
        "budget": "mid", "trip_style": ["nature", "tea"],
        "start_date": _M["Dec"], "tier": "static",
    },
    {
        "destination": "Rishikesh",
        "duration_nights": 4, "duration_days": 5,
        "party_size": 1, "kid_ages": [], "elderly": False,
        "budget": "budget", "trip_style": ["adventure", "spiritual"],
        "start_date": _M["Oct"], "tier": "static",
    },
    # --- DYNAMIC: SUMMER Apr-Jun ---
    {
        "destination": "Manali",
        "duration_nights": 5, "duration_days": 6,
        "party_size": 3, "kid_ages": [], "elderly": False,
        "budget": "mid", "trip_style": ["adventure", "nature"],
        "start_date": _M["May"], "tier": "dynamic", "season": "summer",
    },
    {
        "destination": "Shimla",
        "duration_nights": 4, "duration_days": 5,
        "party_size": 2, "kid_ages": [8], "elderly": False,
        "budget": "mid", "trip_style": ["nature", "heritage"],
        "start_date": _M["Apr"], "tier": "dynamic", "season": "summer",
    },
    {
        "destination": "Nainital",
        "duration_nights": 4, "duration_days": 5,
        "party_size": 2, "kid_ages": [7], "elderly": False,
        "budget": "mid", "trip_style": ["nature", "lake"],
        "start_date": _M["May"], "tier": "dynamic", "season": "summer",
    },
    {
        "destination": "Mussoorie",
        "duration_nights": 3, "duration_days": 4,
        "party_size": 2, "kid_ages": [], "elderly": False,
        "budget": "mid", "trip_style": ["nature", "romance"],
        "start_date": _M["Apr"], "tier": "dynamic", "season": "summer",
    },
    {
        "destination": "Dharamsala",
        "duration_nights": 4, "duration_days": 5,
        "party_size": 1, "kid_ages": [], "elderly": False,
        "budget": "budget", "trip_style": ["spiritual", "nature"],
        "start_date": _M["Jun"], "tier": "dynamic", "season": "summer",
    },
    # --- DYNAMIC: MONSOON Jul-Sep ---
    {
        "destination": "Wayanad",
        "duration_nights": 3, "duration_days": 4,
        "party_size": 2, "kid_ages": [], "elderly": False,
        "budget": "mid", "trip_style": ["nature", "wildlife"],
        "start_date": _M["Aug"], "tier": "dynamic", "season": "monsoon",
    },
    {
        "destination": "Spiti",
        "duration_nights": 6, "duration_days": 7,
        "party_size": 3, "kid_ages": [], "elderly": False,
        "budget": "budget", "trip_style": ["adventure", "roadtrip"],
        "start_date": _M["Aug"], "tier": "dynamic", "season": "monsoon",
    },
    {
        "destination": "Coorg",
        "duration_nights": 3, "duration_days": 4,
        "party_size": 2, "kid_ages": [], "elderly": False,
        "budget": "mid", "trip_style": ["nature", "wellness"],
        "start_date": _M["Jul"], "tier": "dynamic", "season": "monsoon",
    },
    {
        "destination": "Thekkady",
        "duration_nights": 3, "duration_days": 4,
        "party_size": 2, "kid_ages": [9], "elderly": False,
        "budget": "mid", "trip_style": ["wildlife", "nature"],
        "start_date": _M["Aug"], "tier": "dynamic", "season": "monsoon",
    },
    {
        "destination": "Kodaikanal",
        "duration_nights": 3, "duration_days": 4,
        "party_size": 2, "kid_ages": [], "elderly": False,
        "budget": "budget", "trip_style": ["nature", "romance"],
        "start_date": _M["Sep"], "tier": "dynamic", "season": "monsoon",
    },
    # --- DYNAMIC: WINTER Oct-Mar ---
    {
        "destination": "Andaman",
        "duration_nights": 5, "duration_days": 6,
        "party_size": 2, "kid_ages": [], "elderly": False,
        "budget": "premium", "trip_style": ["beaches", "nature"],
        "start_date": _M["Jan"], "tier": "dynamic", "season": "winter",
    },
    {
        "destination": "Kutch",
        "duration_nights": 3, "duration_days": 4,
        "party_size": 4, "kid_ages": [], "elderly": False,
        "budget": "mid", "trip_style": ["culture", "desert"],
        "start_date": _M["Dec"], "tier": "dynamic", "season": "winter",
    },
    {
        "destination": "Varkala",
        "duration_nights": 4, "duration_days": 5,
        "party_size": 1, "kid_ages": [], "elderly": False,
        "budget": "budget", "trip_style": ["beaches", "wellness"],
        "start_date": _M["Jan"], "tier": "dynamic", "season": "winter",
    },
    {
        "destination": "Darjeeling",
        "duration_nights": 4, "duration_days": 5,
        "party_size": 2, "kid_ages": [10], "elderly": False,
        "budget": "mid", "trip_style": ["nature", "heritage"],
        "start_date": _M["Nov"], "tier": "dynamic", "season": "winter",
    },
    {
        "destination": "Jaisalmer",
        "duration_nights": 3, "duration_days": 4,
        "party_size": 2, "kid_ages": [], "elderly": False,
        "budget": "mid", "trip_style": ["desert", "heritage"],
        "start_date": _M["Dec"], "tier": "dynamic", "season": "winter",
    },
]


def canonical_key(spec: dict) -> str:
    dest = spec["destination"].lower().replace(" ", "_")
    styles = "_".join(sorted(spec["trip_style"]))
    kids = "k" + "-".join(str(a) for a in sorted(spec.get("kid_ages") or [])) if spec.get("kid_ages") else "nokids"
    return (
        f"{dest}_{spec['duration_nights']}n_p{spec['party_size']}"
        f"_{kids}_{'elderly' if spec.get('elderly') else 'fit'}"
        f"_{spec['budget']}_{styles}"
    )


def _initial_state(spec: dict, thread_id: str) -> dict:
    trip_params = {
        "duration_nights": spec["duration_nights"],
        "duration_days": spec["duration_days"],
        "party_size": spec["party_size"],
        "kid_ages": spec.get("kid_ages", []),
        "elderly": spec.get("elderly", False),
        "budget_bracket": spec["budget"],
        "budget": spec["budget"],
        "trip_style": spec["trip_style"],
        "start_date": spec["start_date"],
        "dietary_restrictions": [],
        "user_id": "",
    }
    return {
        "destination": spec["destination"],
        "trip_parameters": trip_params,
        "onboarding_answers": [],
        "traveler_notes": None,
        "taste_profile": None,
        "candidates": None,
        "ranked_candidates": None,
        "user_profile": None,
        "research_synthesis": None,
        "plan": None,
        "user_feedback": None,
        "refinement_count": 0,
        "refinement_history": [],
        "regenerate_requested": False,
        "critic_passes": 0,
        "awaiting_feedback": False,
        "current_node": "persona_classification",
        "stage_label": "Understanding your profile",
        "error": None,
        "thread_id": thread_id,
        "session_tokens": 0,
    }


def bake_one(spec: dict, out_dir: str, dry_run: bool = False) -> bool:
    key = canonical_key(spec)
    dest = spec["destination"]
    out_path = os.path.join(out_dir, f"{key}.json")

    if os.path.exists(out_path):
        print(f"  [SKIP] {key}.json already exists -- delete to re-bake")
        return True

    print(f"\n{'[DRY-RUN] ' if dry_run else ''}Baking: {dest} ({key})")
    if dry_run:
        return True

    thread_id = str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    for chunk in graph.stream(_initial_state(spec, thread_id), config=config, stream_mode="updates"):
        for node, update in chunk.items():
            if isinstance(update, dict):
                label = update.get("stage_label", "")
                print(f"    > {node}: {label}", flush=True)

    snapshot = graph.get_state(config)
    state = snapshot.values
    if state.get("error"):
        print(f"  [ERROR] {state['error']}")
        return False

    plan = state.get("plan")
    if not plan:
        print("  [ERROR] No plan produced")
        return False

    print(f"  Fetching live places ...", flush=True)
    trip_params = _initial_state(spec, "")["trip_parameters"]
    plan_days = [{"day_number": d.get("day_number", i + 1), **d} for i, d in enumerate(plan.get("days", []))]
    places = _fetch_places_for_plan(dest, plan_days, state.get("user_profile") or {}, trip_params)

    template = {
        "key": key,
        "plan": plan,
        "places_fallback": places,
        "trip_parameters": trip_params,
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "pipeline_version": PIPELINE_VERSION,
            "session_tokens": state.get("session_tokens", 0),
            "tier": spec.get("tier", "static"),
            "season": spec.get("season"),
        },
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(template, f, indent=2, ensure_ascii=False)

    tokens = state.get("session_tokens", 0)
    print(f"  [OK] Saved -> {out_path}  (tokens={tokens:,})")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Bake pre-computed plan templates")
    parser.add_argument(
        "--specs", default="",
        help="Comma-separated destination names to bake (default: all missing)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be baked without making LLM calls",
    )
    args = parser.parse_args()

    out_dir = os.path.join(os.path.dirname(__file__), "templates")
    os.makedirs(out_dir, exist_ok=True)

    filter_dests = {d.strip().lower() for d in args.specs.split(",") if d.strip()}
    specs = [
        s for s in TEMPLATE_SPECS
        if not filter_dests or s["destination"].lower() in filter_dests
    ]

    if not specs:
        print("No matching specs found.")
        sys.exit(1)

    print(f"Templates directory: {out_dir}")
    print(f"Specs to process: {len(specs)}")

    ok = err = skipped = 0
    for spec in specs:
        key = canonical_key(spec)
        out_path = os.path.join(out_dir, f"{key}.json")
        if os.path.exists(out_path):
            skipped += 1
            print(f"  [SKIP] {key}.json")
            continue
        success = bake_one(spec, out_dir, dry_run=args.dry_run)
        if success:
            ok += 1
        else:
            err += 1

    print(f"\nDone -- baked={ok}, skipped={skipped}, errors={err}")
    if err:
        sys.exit(1)


if __name__ == "__main__":
    main()
