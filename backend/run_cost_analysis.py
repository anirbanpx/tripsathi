"""Cost analysis runner — SPRINT3.md backlog item.

Runs the 3 baseline eval cases (BASE-KL, BASE-PU, BASE-GW) through the live
pipeline, captures real session_tokens accumulated up to the human_feedback
interrupt (i.e. the cost of one plan generation, before any refinement), and
writes reports/cost_analysis.md with measured ₹/plan figures.

Usage:
    python run_cost_analysis.py
"""
import os
import sys
import io
import json
import time
from uuid import uuid4

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from graph import graph
from nodes import _COST_PER_1M

CASES = {
    "BASE-KL": {
        "destination": "Kerala",
        "trip_parameters": {"duration_days": 5, "budget_total": 100000, "party_size": 3, "kid_ages": [5], "elderly": False},
        "onboarding_answers": [
            {"question": "What do you want?", "answer": "5-night Kerala trip for 2 adults and a 5-year-old. Budget ₹1 lakh. First time. Kid gets tired easily, needs proper meals."},
        ],
    },
    "BASE-PU": {
        "destination": "Puri, Odisha",
        "trip_parameters": {"duration_days": 4, "budget_total": 60000, "party_size": 6, "kid_ages": [4], "elderly": True},
        "onboarding_answers": [
            {"question": "What must you include?", "answer": "Jagannath temple and Chilika lake. Parents are religious — temple timing is priority."},
            {"question": "Dietary or special needs?", "answer": "4-year-old is picky and can't eat most local Odia food."},
            {"question": "Group composition?", "answer": "2 adults, 2 elderly parents (70 and 60), and a 4-year-old"},
        ],
    },
    "BASE-GW": {
        "destination": "Guwahati, Assam",
        "trip_parameters": {"duration_days": 4, "budget_total": 40000, "party_size": 2, "kid_ages": [], "elderly": True},
        "onboarding_answers": [
            {"question": "What must you include?", "answer": "Kamakhya temple darshan, Shillong day trip, Brahmaputra river experience."},
            {"question": "Special requirements?", "answer": "Early dinners, no strenuous walking, comfortable mid-range hotel centrally located."},
            {"question": "Group composition?", "answer": "Elderly parents — father 70, mother 60"},
        ],
    },
}


def run_case(case_id: str, case: dict) -> dict:
    print(f"\n{'='*60}\n  {case_id}\n{'='*60}")
    thread_id = str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    initial_state = {
        "destination": case["destination"],
        "trip_parameters": case["trip_parameters"],
        "onboarding_answers": case["onboarding_answers"],
        "user_profile": None, "research_synthesis": None, "plan": None,
        "user_feedback": None, "regenerate_requested": False,
        "refinement_count": 0, "refinement_history": [],
        "awaiting_feedback": False, "current_node": "persona_classification",
        "stage_label": None, "error": None,
    }

    t0 = time.perf_counter()
    result = graph.invoke(initial_state, config)
    elapsed_s = time.perf_counter() - t0

    if result.get("error"):
        print(f"  ERROR: {result['error']}")
        return {"case_id": case_id, "error": result["error"]}

    tokens = result.get("session_tokens", 0)
    cost_usd = tokens * _COST_PER_1M / 1_000_000
    cost_inr = cost_usd * 84
    print(f"  tokens={tokens} elapsed_s={elapsed_s:.1f} cost_usd=${cost_usd:.4f} cost_inr=₹{cost_inr:.2f}")
    return {"case_id": case_id, "tokens": tokens, "elapsed_s": round(elapsed_s, 1),
             "cost_usd": round(cost_usd, 4), "cost_inr": round(cost_inr, 2)}


if __name__ == "__main__":
    results = []
    case_ids = list(CASES.keys())
    for i, case_id in enumerate(case_ids):
        if i > 0:
            print("\n[Waiting 90s before next case to stay clear of Groq TPM/TPD limits...]")
            time.sleep(90)
        results.append(run_case(case_id, CASES[case_id]))

    out_path = os.path.join(os.path.dirname(__file__), "..", "reports", "cost_analysis_raw.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\n{'='*60}\n  SUMMARY\n{'='*60}")
    for r in results:
        if "error" in r:
            print(f"  {r['case_id']:10} ERROR: {r['error']}")
        else:
            print(f"  {r['case_id']:10} tokens={r['tokens']:6}  ₹{r['cost_inr']:.2f}  ({r['elapsed_s']}s)")
    print(f"\nRaw results written to {out_path}")
