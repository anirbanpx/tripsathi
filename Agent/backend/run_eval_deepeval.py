"""DeepEval LLM-as-judge eval runner.

Runs all 10 test cases through the live pipeline, then scores each plan
semantically using DeepEval GEval — no regex, pure LLM judgment.

Usage:
    python run_eval_deepeval.py              # all cases
    python run_eval_deepeval.py BASE-KL A-KL-01   # specific cases
    python run_eval_deepeval.py --suite personalization
    python run_eval_deepeval.py --suite all

Requires: deepeval, dotenv, and the backend env loaded.
"""
import os
import sys
import json
import io
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from openai import OpenAI
from deepeval.models.base_model import DeepEvalBaseLLM
from deepeval.metrics import GEval, BaseMetric
from deepeval.test_case import LLMTestCase, LLMTestCaseParams, SingleTurnParams
from graph import graph


# ── Custom judge model wrapping Groq ────────────────────────────────────────

class GroqJudge(DeepEvalBaseLLM):
    def __init__(self):
        self._client = OpenAI(
            base_url=os.environ.get("LLM_BASE_URL"),
            api_key=os.environ.get("LLM_API_KEY"),
        )
        self._model = os.environ.get("LLM_MODEL", "openai/gpt-oss-120b")

    def load_model(self):
        return self._client

    def generate(self, prompt: str, schema=None) -> str:
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2048,
        )
        return response.choices[0].message.content or ""

    async def a_generate(self, prompt: str, schema=None) -> str:
        return self.generate(prompt, schema)

    def get_model_name(self) -> str:
        return self._model


judge = GroqJudge()


# ── Test cases (all 10 from evaluations_data.csv) ───────────────────────────

CASES = {
    "BASE-KL": {
        "destination": "Kerala",
        "trip_parameters": {"duration_days": 5, "budget_total": 100000, "party_size": 3, "kid_ages": [5], "elderly": False},
        "onboarding_answers": [
            {"question": "What do you want?", "answer": "5-night Kerala trip for 2 adults and a 5-year-old. Budget ₹1 lakh. First time. Kid gets tired easily, needs proper meals."},
        ],
        "criteria": [
            ("Correct routing", "The plan recommends Munnar and Alleppey as the primary destinations with reasoning for the route sequence."),
            ("Kid food flagged", "The plan flags child food options or meal considerations for a 5-year-old at each stop."),
            ("Hotel location reasoning", "The plan gives reasoning for hotel location in Alleppey relative to backwaters or the boat jetty."),
            ("Houseboat handled", "The plan either recommends Shikara over overnight houseboat OR gives a reason related to child suitability."),
            ("Budget breakdown", "The plan includes a budget breakdown with accommodation, transport, food, and total costs."),
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
        "criteria": [
            ("Early temple slot", "The plan recommends an early morning slot (before 8 AM) for Jagannath temple darshan."),
            ("Non-Hindu restriction", "The plan mentions that non-Hindus cannot enter the Jagannath temple and offers an alternative viewpoint (Raghunandan Library rooftop or similar)."),
            ("Midday rest", "The plan includes a midday rest or afternoon break, given the elderly members and young child."),
            ("Chilika cab inflation", "The plan warns about inflated cab pricing at Chilika lake and suggests booking through the hotel or pre-negotiating."),
            ("Child food fallbacks", "The plan suggests hotel dining, packaged food, or continental options as fallbacks for the picky child."),
            ("Budget breakdown", "The plan includes a budget breakdown with total."),
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
        "criteria": [
            ("Kamakhya on Day 1", "The plan schedules Kamakhya temple visit on Day 1 as the priority."),
            ("VIP darshan pricing", "The plan recommends VIP darshan at Kamakhya and mentions a specific price (around ₹500-700 per person)."),
            ("Steep steps warning", "The plan warns about steep steps at Kamakhya and mentions an alternative like a doli (palanquin) for elderly visitors."),
            ("Shillong timing math", "The plan provides specific timing for the Shillong day trip with a 7 AM or early departure recommendation."),
            ("Missed dinner risk", "The plan flags the risk of returning late from Shillong and missing dinner, or builds in early return timing."),
            ("Brahmaputra options", "The plan compares public ferry and private cruise options for Brahmaputra with recommendation."),
            ("Early dinners planned", "The plan schedules dinner before 7:30 PM each day for the elderly group."),
        ],
    },
    "A-KL-01": {
        "destination": "Kerala",
        "trip_parameters": {"duration_days": 5, "budget_total": 100000, "party_size": 3, "kid_ages": [2], "elderly": False},
        "onboarding_answers": [
            {"question": "What do you want?", "answer": "5-night Kerala trip for 2 adults and a 2-year-old toddler (still napping midday, needs high chair and soft food). Budget ₹1 lakh. First time Kerala. Kid gets tired easily."},
        ],
        "criteria": [
            ("Midday nap block", "Every day in the plan includes a midday rest or nap block around 1-2 PM."),
            ("No overnight houseboat", "The plan does NOT recommend an overnight houseboat for accommodation; it either offers a day cruise or land hotel instead."),
            ("Soft food named", "The plan names specific soft foods suitable for a toddler (idli, plain rice, dal, appam, puttu, or similar) — not just 'kid-friendly'."),
            ("High chair noted", "The plan mentions high chair availability or the need to pre-request it at hotels."),
            ("Reduced activities", "The plan limits activities to 1-2 per day, not 3+."),
        ],
    },
    "A-KL-02": {
        "destination": "Kerala",
        "trip_parameters": {"duration_days": 5, "budget_total": 100000, "party_size": 5, "kid_ages": [5], "elderly": True},
        "onboarding_answers": [
            {"question": "What do you want?", "answer": "5-night Kerala trip for 2 adults and a 5-year-old. Budget ₹1 lakh. Also bringing parents — father 68, mother 62. Father has mild knee issues, can't do stairs or uneven terrain."},
        ],
        "criteria": [
            ("Mobility-restricted activities", "The plan avoids or flags activities unsuitable for someone with knee issues and uneven terrain (e.g. Eravikulam NP)."),
            ("Lift/elevator access", "The plan notes elevator or lift access at hotels for elderly members."),
            ("Afternoon rest", "The plan includes afternoon rest periods for the elderly group."),
            ("Core routing preserved", "The plan still covers Munnar and Alleppey (or equivalent Kerala highlights) — mobility constraints don't eliminate the trip."),
        ],
    },
    "A-KL-03": {
        "destination": "Kerala",
        "trip_parameters": {"duration_days": 5, "budget_total": 100000, "party_size": 3, "kid_ages": [5], "elderly": False},
        "onboarding_answers": [
            {"question": "What do you want?", "answer": "5-night Kerala trip for 2 adults and a 5-year-old. Budget ₹1 lakh. We're budget-conscious — want to avoid tourist traps. Prefer local restaurants over resort dining."},
        ],
        "criteria": [
            ("Lower hotel tier", "The plan recommends mid-range or budget hotels (not luxury resorts), with approximate costs reflecting a budget-conscious choice."),
            ("Local restaurant recommendations", "The plan recommends local restaurants with approximate prices rather than resort dining."),
            ("Tourist traps flagged", "The plan warns about or avoids overpriced tourist traps (tea museum, resort activities, etc.)."),
            ("Lower total budget", "The plan's total budget estimate is lower than the standard ₹1 lakh baseline plan for Kerala."),
        ],
    },
    "A-PU-01": {
        "destination": "Puri, Odisha",
        "trip_parameters": {"duration_days": 4, "budget_total": 60000, "party_size": 3, "kid_ages": [4], "elderly": False},
        "onboarding_answers": [
            {"question": "What do you want?", "answer": "4-night Puri trip for 2 adults and a 4-year-old. Budget ₹60,000. Must include Jagannath temple and Chilika lake. The 4-year-old is picky and can't eat most local Odia food."},
        ],
        "criteria": [
            ("Later temple slot", "The plan does NOT recommend a 5-6 AM temple slot (no elderly requiring early slot), instead uses a more reasonable morning time like 8-9 AM."),
            ("Child food flagged", "The plan still flags child food options and fallbacks — this is persona-independent."),
            ("Chilika inflation flagged", "The plan still warns about Chilika cab inflation — this is destination-specific, not elderly-specific."),
        ],
    },
    "B-KL-01": {
        "destination": "Kerala",
        "trip_parameters": {"duration_days": 5, "budget_total": 100000, "party_size": 3, "kid_ages": [5], "elderly": False},
        "onboarding_answers": [
            {"question": "What do you want?", "answer": "5-night Kerala trip for 2 adults and a 5-year-old. Budget ₹1 lakh. First time. Kid gets tired easily, needs proper meals."},
        ],
        "criteria": [
            ("Hotel location warning", "The plan proactively flags that Alleppey hotel location matters — recommends staying near the boat jetty / backwater junction, not on the highway."),
            ("Houseboat operator trust", "The plan warns about houseboat operator trust issues — cold-approach operators at the jetty, price inflation, or recommends booking through the hotel / certified operator."),
        ],
    },
    "B-GW-01": {
        "destination": "Guwahati, Assam",
        "trip_parameters": {"duration_days": 4, "budget_total": 40000, "party_size": 2, "kid_ages": [], "elderly": True},
        "onboarding_answers": [
            {"question": "What do you want?", "answer": "4-night Guwahati trip for elderly parents — father 70, mother 60. Budget ₹40,000. Priority is Kamakhya temple. Also Shillong day trip and Brahmaputra river."},
        ],
        "criteria": [
            ("Shillong timing risk", "The plan proactively flags the risk of returning late from Shillong with elderly parents and the impact on dinner timing."),
            ("Kamakhya queue depth", "The plan proactively warns about Kamakhya queue wait times or steep steps for elderly visitors, and recommends VIP darshan or a doli."),
        ],
    },
    "B-PU-01": {
        "destination": "Puri, Odisha",
        "trip_parameters": {"duration_days": 4, "budget_total": 60000, "party_size": 6, "kid_ages": [4], "elderly": True},
        "onboarding_answers": [
            {"question": "What do you want?", "answer": "4-night Puri trip for 2 adults, 2 elderly parents (70 and 60), and a 4-year-old. Budget ₹60,000. Must include Jagannath temple and Chilika. Parents are religious."},
        ],
        "criteria": [
            ("Temple entry restriction", "The plan proactively flags Jagannath temple non-Hindu entry restriction and provides a specific alternative viewpoint."),
            ("Chilika operator risk", "The plan proactively warns about Chilika cab or boat operator pricing inflation with a specific price range and mitigation."),
            ("Child food scarcity", "The plan proactively flags that Puri has limited child-friendly food options and gives specific fallbacks."),
        ],
    },
}


# ── Personalization metrics ──────────────────────────────────────────────────

class PersonalizationDeltaMetric(BaseMetric):
    """Score = fraction of activities that differ between two plans for same destination."""
    threshold = 0.4  # at least 40% of activities should differ

    def __init__(self, plan_a: dict, plan_b: dict):
        self.plan_a = plan_a
        self.plan_b = plan_b

    def measure(self, test_case: LLMTestCase) -> float:
        activities_a = {a["name"].lower() for day in self.plan_a.get("days", []) for a in day.get("activities", [])}
        activities_b = {a["name"].lower() for day in self.plan_b.get("days", []) for a in day.get("activities", [])}
        if not activities_a or not activities_b:
            self.score = 0.0
            self.success = False
            return 0.0
        union = activities_a | activities_b
        intersection = activities_a & activities_b
        delta = 1 - len(intersection) / len(union)  # Jaccard distance
        self.score = round(delta, 3)
        self.success = self.score >= self.threshold
        return self.score

    def is_successful(self) -> bool:
        return self.success

    @property
    def name(self):
        return "PersonalizationDelta"


class TasteAdherenceMetric(BaseMetric):
    """Uses LLM-as-judge to score how well the plan matches the taste profile."""
    threshold = 0.6

    def __init__(self, taste_profile: dict, model: str = "openai/gpt-oss-120b"):
        self.taste_profile = taste_profile
        self._model = model

    def measure(self, test_case: LLMTestCase) -> float:
        from nodes import _call_llm
        from prompts import TASTE_ADHERENCE_JUDGE_SYSTEM

        judge_input = (
            f"Plan: {test_case.actual_output}\n"
            f"Taste profile: {json.dumps(self.taste_profile)}"
        )
        try:
            result = _call_llm(TASTE_ADHERENCE_JUDGE_SYSTEM, judge_input, max_tokens=512)
            score = float(result.get("score", 0.5)) if isinstance(result, dict) else 0.5
        except Exception:
            score = 0.5
        self.score = round(min(max(score, 0.0), 1.0), 3)
        self.success = self.score >= self.threshold
        return self.score

    def is_successful(self) -> bool:
        return self.success

    @property
    def name(self):
        return "TasteAdherence"


class ConstraintAdherenceMetric(BaseMetric):
    """Rule-based check: hard constraints are binary — either honoured or violated."""
    threshold = 1.0  # must be perfect

    def __init__(self, user_profile: dict, trip_parameters: dict):
        self.user_profile = user_profile
        self.trip_parameters = trip_parameters

    def measure(self, test_case: LLMTestCase) -> float:
        try:
            plan = json.loads(test_case.actual_output) if isinstance(test_case.actual_output, str) else test_case.actual_output
        except Exception:
            self.score = 0.0
            self.success = False
            return 0.0

        violations = []
        constraints = self.user_profile.get("constraints", {})
        kid_ages = constraints.get("kid_ages") or self.trip_parameters.get("kid_ages", [])
        has_toddler = any(isinstance(a, int) and a <= 3 for a in kid_ages)

        if has_toddler:
            for hotel in plan.get("hotels", []):
                if "houseboat" in hotel.get("name", "").lower():
                    violations.append("Overnight houseboat scheduled for toddler")
            for day in plan.get("days", []):
                notes = day.get("notes", "").lower()
                if "nap" not in notes and "rest" not in notes and "1:00" not in notes:
                    violations.append(f"Day {day.get('day_number', '?')}: missing midday rest for toddler")

        dietary = constraints.get("dietary_restrictions", [])
        if "vegetarian" in dietary or "vegan" in dietary:
            all_meals = " ".join(
                str(day.get("meals", {}).get(m, ""))
                for day in plan.get("days", [])
                for m in ("breakfast", "lunch", "dinner")
            ).lower()
            meat_keywords = ["chicken", "mutton", "fish", "prawn", "beef", "pork", "meat", "seafood"]
            if any(kw in all_meals for kw in meat_keywords):
                violations.append("Non-vegetarian meal for vegetarian traveller")

        self.score = 1.0 if not violations else 0.0
        self.success = self.score >= self.threshold
        self.violations = violations
        return self.score

    def is_successful(self) -> bool:
        return self.success

    @property
    def name(self):
        return "ConstraintAdherence"


# ── Personalization suite ────────────────────────────────────────────────────

def run_personalization_suite():
    """Run the personalization eval suite.
    Tests: PersonalizationDelta, TasteAdherence, ConstraintAdherence."""
    print("Running personalization eval suite...")

    # --- Test 1: PersonalizationDelta ---
    # Two canned plans for the same destination (Manali) with different personas
    offbeat_plan = {
        "days": [
            {"day_number": 1, "activities": [{"name": "Hadimba Temple"}, {"name": "Old Manali village walk"}]},
            {"day_number": 2, "activities": [{"name": "Great Himalayan National Park trek"}, {"name": "Beas River"}]},
        ],
        "hotels": [{"name": "Drifters Inn Homestay"}]
    }
    comfort_plan = {
        "days": [
            {"day_number": 1, "activities": [{"name": "Mall Road Shopping"}, {"name": "Rohtang Pass trip"}]},
            {"day_number": 2, "activities": [{"name": "Solang Valley snow activities"}, {"name": "Local market"}]},
        ],
        "hotels": [{"name": "Johnson Hotel"}]
    }
    delta_metric = PersonalizationDeltaMetric(offbeat_plan, comfort_plan)
    test_delta = LLMTestCase(input="same destination different personas", actual_output=json.dumps(offbeat_plan))
    delta_metric.measure(test_delta)
    print(f"  PersonalizationDelta: {delta_metric.score:.3f} ({'PASS' if delta_metric.success else 'FAIL'})")

    # --- Test 2: TasteAdherence (offbeat traveller + offbeat plan) ---
    offbeat_taste = {
        "pace": 2, "crowd_tolerance": 1, "food_adventurousness": 4,
        "interests": {"nature": 0.9, "wildlife": 0.8, "heritage": 0.7, "shopping": 0.1},
        "hard_avoids": ["crowded market"],
    }
    adherence_metric = TasteAdherenceMetric(offbeat_taste)
    test_adherence = LLMTestCase(
        input="offbeat Manali plan",
        actual_output=json.dumps(offbeat_plan),
    )
    adherence_metric.measure(test_adherence)
    print(f"  TasteAdherence (offbeat plan for offbeat profile): {adherence_metric.score:.3f} ({'PASS' if adherence_metric.success else 'FAIL'})")

    # --- Test 3: TasteAdherence (wrong plan for profile — should score low) ---
    adherence_wrong = TasteAdherenceMetric(offbeat_taste)
    test_wrong = LLMTestCase(
        input="comfort plan for offbeat profile (should be low score)",
        actual_output=json.dumps(comfort_plan),
    )
    adherence_wrong.measure(test_wrong)
    print(f"  TasteAdherence (comfort plan for offbeat profile): {adherence_wrong.score:.3f} (expect low, {'PASS' if not adherence_wrong.success else 'NOTE: higher than expected'})")

    # --- Test 4: ConstraintAdherence (toddler family) ---
    toddler_profile = {"constraints": {"kid_ages": [2], "elderly": False, "dietary_restrictions": []}}
    toddler_params = {"kid_ages": [2]}
    safe_toddler_plan = {
        "days": [{"day_number": 1, "notes": "1:00-2:30 PM: mandatory nap/rest at hotel", "activities": []}],
        "hotels": [{"name": "Family guesthouse Manali"}],
        "warnings": []
    }
    constraint_metric = ConstraintAdherenceMetric(toddler_profile, toddler_params)
    test_constraint = LLMTestCase(input="toddler safe plan", actual_output=json.dumps(safe_toddler_plan))
    constraint_metric.measure(test_constraint)
    print(f"  ConstraintAdherence (safe toddler plan): {constraint_metric.score:.3f} ({'PASS' if constraint_metric.success else 'FAIL'})")

    # --- Test 5: ConstraintAdherence (unsafe plan — houseboat for toddler) ---
    unsafe_plan = {
        "days": [{"day_number": 1, "notes": "Full day sightseeing", "activities": []}],
        "hotels": [{"name": "Alleppey Houseboat overnight"}],
        "warnings": []
    }
    constraint_fail = ConstraintAdherenceMetric(toddler_profile, toddler_params)
    test_fail = LLMTestCase(input="unsafe toddler plan", actual_output=json.dumps(unsafe_plan))
    constraint_fail.measure(test_fail)
    print(f"  ConstraintAdherence (unsafe: houseboat for toddler): {constraint_fail.score:.3f} (expect FAIL, {'PASS' if not constraint_fail.success else 'BUG: should have failed'})")

    print("\nPersonalization suite complete.")


# ── Runner ───────────────────────────────────────────────────────────────────

def run_case(case_id: str, case: dict) -> dict:
    from uuid import uuid4
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

    print("Running pipeline...")
    result = graph.invoke(initial_state, config)
    if result.get("error"):
        print(f"  ERROR: {result['error']}")
        return {"case_id": case_id, "error": result["error"]}

    plan = result.get("plan") or {}
    plan_text = json.dumps(plan, ensure_ascii=False)

    print("Scoring with GEval...")
    scores = []
    for label, criterion in case["criteria"]:
        test_case = LLMTestCase(
            input=case["onboarding_answers"][0]["answer"],
            actual_output=plan_text,
        )
        metric = GEval(
            name=label,
            criteria=criterion,
            evaluation_params=[SingleTurnParams.ACTUAL_OUTPUT],
            model=judge,
            threshold=0.5,
        )
        try:
            metric.measure(test_case)
            passed = metric.score >= metric.threshold
            scores.append({"label": label, "score": round(metric.score, 2), "passed": passed, "reason": metric.reason})
            icon = "✅" if passed else "❌"
            print(f"  {icon} {label} — {metric.score:.2f}  {metric.reason or ''}")
        except Exception as e:
            scores.append({"label": label, "score": 0, "passed": False, "reason": str(e)})
            print(f"  ⚠️  {label} — eval error: {e}")

    passed_count = sum(1 for s in scores if s["passed"])
    total = len(scores)
    print(f"\n  Score: {passed_count}/{total}")
    return {"case_id": case_id, "scores": scores, "passed": passed_count, "total": total}


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="TripSathi DeepEval runner")
    parser.add_argument("cases", nargs="*", help="Specific case IDs to run (e.g. BASE-KL A-KL-01)")
    parser.add_argument("--suite", choices=["personalization", "all"], help="Run a named eval suite")
    args = parser.parse_args()

    if args.suite == "personalization":
        run_personalization_suite()
        sys.exit(0)

    if args.suite == "all":
        run_personalization_suite()
        print()

    cases_to_run = args.cases if args.cases else list(CASES.keys())
    results = []
    for i, case_id in enumerate(cases_to_run):
        if i > 0:
            print(f"\n[Waiting 30s between cases...]")
            time.sleep(30)
        if case_id in CASES:
            results.append(run_case(case_id, CASES[case_id]))
        else:
            print(f"Unknown case: {case_id}")

    print(f"\n{'='*60}")
    print("  SUMMARY")
    print(f"{'='*60}")
    grand_passed = sum(r.get("passed", 0) for r in results)
    grand_total = sum(r.get("total", 0) for r in results)
    for r in results:
        if "error" in r:
            print(f"  ❌ {r['case_id']} — ERROR")
        else:
            bar = "█" * r["passed"] + "░" * (r["total"] - r["passed"])
            print(f"  {r['case_id']:12} {bar}  {r['passed']}/{r['total']}")
    print(f"\n  Overall: {grand_passed}/{grand_total}")
