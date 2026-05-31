"""Standalone eval runner — calls graph directly, no HTTP server needed."""
import os, sys, json
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(__file__))

from graph import graph

CASES = {
    "BASE-PU": {
        "destination": "Puri, Odisha",
        "trip_parameters": {
            "duration_days": 4,
            "budget_total": 60000,
            "party_size": 6,
            "kid_ages": [4],
            "elderly": True,
        },
        "onboarding_answers": [
            {"question": "What must you include?", "answer": "Must include Jagannath temple and Chilika lake. Parents are religious — temple timing is a priority."},
            {"question": "Any dietary or special needs?", "answer": "The 4-year-old is picky and can't eat most local Odia food."},
            {"question": "Group composition?", "answer": "2 adults, 2 elderly parents (70 and 60), and a 4-year-old"},
        ],
        "criteria": [
            "6.*am|early.*morning|morning.*temple|arrive.*early.*temple|temple.*early.*morning|before.*6|plan.*arrive",
            "non-hindu|non hindu|raghunandan|rooftop|library|cannot enter|entry restriction",
            "midday rest|midday nap|1:00|afternoon rest|midday|rest block",
            "₹3,000|₹3000|3000.*5000|inflation|overcharg|book.*hotel.*chilika|hotel.*chilika|rs.*1.*500|1500.*2000",
            "packaged food|hotel dining|maggi|biscuit|hotel restaurant|continental|bring.*food|north.*indian",
            "budget_breakdown|total.*₹|total.*60|accommodation.*₹",
        ],
        "criteria_labels": [
            "Early morning temple slot",
            "Non-Hindu restriction + Raghunandan/rooftop alternative",
            "Midday rest included",
            "Chilika cab inflation flagged with price range",
            "Child food fallbacks (packaged / hotel dining)",
            "Budget breakdown",
        ],
    },
    "BASE-GW": {
        "destination": "Guwahati, Assam",
        "trip_parameters": {
            "duration_days": 4,
            "budget_total": 40000,
            "party_size": 2,
            "kid_ages": [],
            "elderly": True,
        },
        "onboarding_answers": [
            {"question": "What must you include?", "answer": "Priority is Kamakhya temple darshan. Also want to cover a Shillong day trip and Brahmaputra river experience."},
            {"question": "Special requirements?", "answer": "Parents need early dinners, no strenuous walking, and a comfortable mid-range hotel in a central location."},
            {"question": "Group composition?", "answer": "Elderly parents — father 70, mother 60"},
        ],
        "criteria": [
            "kamakhya.*day.?1|day.?1.*kamakhya|day_number.*1.*kamakhya|kamakhya.*priority|kamakhya.*first",
            "₹500|₹700|vip.*darshan|vip.*₹|darshan.*vip|500.*700|queue.*bypass|skip.*queue",
            "150.*step|steep.*step|doli|steps.*steep|step.*150",
            "7.*am.*shillong|7.*am.*departure|shillong.*7.*am|depart.*7|leave.*7|7:00.*shillong",
            "missed.*dinner|dinner.*risk|back.*9|return.*9|arrive.*7|7.*pm.*back|late.*return|night.*driving",
            "public.*ferry|private.*cruise|ferry.*vs|cruise.*₹|government.*boat|private.*boat|two.*option",
            "early dinner|6.*pm.*dinner|6:30.*dinner|dinner.*6|dinner.*early|before.*7.*dinner",
        ],
        "criteria_labels": [
            "Kamakhya on Day 1",
            "VIP darshan recommended with pricing (₹500-700)",
            "150 steep steps flagged (+ doli)",
            "Shillong 7 AM departure timing math",
            "Missed dinner / late return risk called out",
            "Brahmaputra: public ferry vs private cruise compared",
            "Early dinner planned per day",
        ],
    },
}


def run_case(case_id: str, case: dict) -> None:
    import re
    from uuid import uuid4

    print(f"\n{'='*60}")
    print(f"  {case_id}")
    print(f"{'='*60}")

    thread_id = str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    initial_state = {
        "destination": case["destination"],
        "trip_parameters": case["trip_parameters"],
        "onboarding_answers": case["onboarding_answers"],
        "user_profile": None,
        "research_synthesis": None,
        "plan": None,
        "user_feedback": None,
        "regenerate_requested": False,
        "refinement_count": 0,
        "refinement_history": [],
        "awaiting_feedback": False,
        "current_node": "persona_classification",
        "stage_label": None,
        "error": None,
    }

    print("Running pipeline...")
    result = graph.invoke(initial_state, config)
    if result.get("error"):
        print(f"ERROR: {result['error']}")
        return
    plan = result.get("plan") or {}

    # Build full-text corpus for matching — include full JSON for structural checks
    full_text = json.dumps(plan, ensure_ascii=False).lower()

    print("\nWARNINGS:")
    for w in plan.get("warnings", []):
        print(f"  • {w[:120]}")

    print("\nSCORING:")
    passed = 0
    for label, pattern in zip(case["criteria_labels"], case["criteria"]):
        hit = bool(re.search(pattern, full_text, re.IGNORECASE))
        icon = "✅" if hit else "❌"
        print(f"  {icon}  {label}")
        if hit:
            passed += 1

    total = len(case["criteria"])
    print(f"\n  Score: {passed}/{total}")

    synthesis = result.get("research_synthesis") or {}
    print("\nSYNTHESIS local_risks:")
    for r in (synthesis.get("local_risks") or []):
        print(f"  • {r[:120]}")
    print("SYNTHESIS implicit_warnings:")
    for w in (synthesis.get("implicit_warnings") or []):
        print(f"  • {w[:120]}")
    if not synthesis:
        print("  (synthesis is empty/None — RAG or LLM step may have failed)")


if __name__ == "__main__":
    import time as _time
    cases_to_run = sys.argv[1:] if len(sys.argv) > 1 else list(CASES.keys())
    for i, case_id in enumerate(cases_to_run):
        if i > 0:
            print(f"\n[Waiting 30s between cases to stay within rate limits...]")
            _time.sleep(30)
        if case_id in CASES:
            run_case(case_id, CASES[case_id])
        else:
            print(f"Unknown case: {case_id}")
