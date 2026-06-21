"""One-off: bake the Munnar explore template for real (graph + live Maps places).
Anonymous/generic profile (no taste, no user_id) so candidate_gen is skipped — this is
exactly how the fast-path template is meant to be generated. Throwaway preview script.
"""
import json
import os
from uuid import uuid4

from dotenv import load_dotenv
load_dotenv()

from graph import graph
from nodes import _fetch_places_for_plan

DESTINATION = "Munnar"
TRIP_PARAMETERS = {
    "duration_nights": 3,
    "duration_days": 4,
    "party_size": 2,
    "kid_ages": [],
    "elderly": False,
    "budget_bracket": "mid",
    "budget": "mid",
    "trip_style": ["nature", "tea"],
    "start_date": "2026-12-10",
    "dietary_restrictions": [],
    "user_id": "",
}


def _initial_state(thread_id: str) -> dict:
    return {
        "destination": DESTINATION,
        "trip_parameters": TRIP_PARAMETERS,
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


def main() -> None:
    thread_id = str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    print(f"=== Baking Munnar template (thread {thread_id}) ===\n", flush=True)

    for chunk in graph.stream(_initial_state(thread_id), config=config, stream_mode="updates"):
        for node, update in chunk.items():
            if isinstance(update, dict):
                print(f"  ▸ {node}: {update.get('stage_label', '')}", flush=True)

    snapshot = graph.get_state(config)
    state = snapshot.values
    plan = state.get("plan")
    if state.get("error"):
        print("\nERROR:", state["error"])
        return
    if not plan:
        print("\nNo plan produced.")
        return

    print("\n=== ITINERARY (RAG + LLM) ===")
    print(json.dumps(plan, indent=2, ensure_ascii=False))
    print(f"\nsession_tokens={state.get('session_tokens')}")

    print("\n=== LIVE PLACES (Google Maps) ===", flush=True)
    places = _fetch_places_for_plan(
        DESTINATION,
        [{"day_number": d.get("day_number", i + 1), **d} for i, d in enumerate(plan.get("days", []))],
        state.get("user_profile") or {},
        TRIP_PARAMETERS,
    )
    print(json.dumps(places, indent=2, ensure_ascii=False))

    out = os.path.join(os.path.dirname(__file__), "munnar_preview.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"plan": plan, "places_fallback": places, "trip_parameters": TRIP_PARAMETERS}, f, indent=2, ensure_ascii=False)
    print(f"\nSaved → {out}")


if __name__ == "__main__":
    main()
