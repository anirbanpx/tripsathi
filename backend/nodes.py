import json
import os
import time
from openai import OpenAI
from langgraph.types import interrupt
from state import TripSathiState
from prompts import (
    PERSONA_CLASSIFICATION_SYSTEM,
    QUERY_EXPANSION_SYSTEM,
    RESEARCH_SYNTHESIS_SYSTEM,
    PLAN_GENERATION_SYSTEM,
    PLAN_REFINEMENT_SYSTEM,
    PLAN_REGENERATE_SYSTEM,
)

_client = OpenAI(
    base_url=os.environ.get("LLM_BASE_URL", "http://localhost:1234/v1"),
    api_key=os.environ.get("LLM_API_KEY", "lm-studio"),
)
_MODEL = os.environ.get("LLM_MODEL", "local-model")

APPROVAL_SIGNALS = {
    "looks good", "approve", "approved", "perfect", "that's fine", "yes",
    "ok", "done", "great", "thanks", "good", "fine", "accept", "confirmed",
}

HOUSEBOAT_TRUST_WARNING = (
    "Houseboat booking risk: cold-approach operators at the jetty inflate prices 30–50% "
    "and may provide substandard boats. Book through your hotel front desk or a Kerala Tourism-certified "
    "aggregator (e.g. Vasudeva Vilasam for mid-range, Spice Routes Leisure for premium)."
)
ALLEPPEY_LOCATION_WARNING = (
    "Alleppey hotel location matters: choose a hotel near the backwater junction "
    "(Finishing Point Road or near the boat jetty) — NOT on NH 66 or near Alleppey beach, "
    "which adds 3–5 km and extra cost to reach houseboats."
)
HOUSEBOAT_TODDLER_WARNING = (
    "Overnight houseboat not suitable for children under 3: open deck with no railings, "
    "open water, limited bathroom facilities. Book a day cruise (4–6 hrs) instead through your hotel."
)


def _enforce_plan_quality(plan: dict, kid_ages: list, research_synthesis: dict | None, destination: str = "") -> dict:
    """Post-process: enforce toddler rules and surface RAG warnings the LLM missed."""
    toddler = any(isinstance(age, int) and age <= 3 for age in kid_ages)
    warnings = plan.get("warnings", [])
    dest_lower = destination.lower()
    is_kerala = "kerala" in dest_lower or "alleppey" in dest_lower or "munnar" in dest_lower or "kochi" in dest_lower

    if toddler:
        # 1. Midday nap block in every day
        for day in plan.get("days", []):
            notes = day.get("notes", "")
            if "1:00" not in notes and "nap" not in notes.lower() and "rest" not in notes.lower():
                day["notes"] = "1:00–2:30 PM: mandatory nap/rest at hotel — no activities scheduled during this window. " + notes

        # 2. Replace overnight houseboat hotel with land hotel (Kerala only)
        if is_kerala:
            for hotel in plan.get("hotels", []):
                if "houseboat" in hotel.get("name", "").lower():
                    hotel["name"] = "Backwater-side land hotel (book near jetty, not highway)"
                    hotel["reasoning"] = (
                        "Overnight houseboat not safe for toddlers under 3. "
                        "Choose a land hotel near the backwater jetty (Finishing Point Road area) "
                        "for easy day-cruise access. High chair: pre-request on booking."
                    )
                    hotel["content_source"] = "rag"

        # 3. Add toddler houseboat warning (Kerala only)
        if is_kerala and not any("under 3" in w or "toddler" in w.lower() for w in warnings):
            warnings.insert(0, HOUSEBOAT_TODDLER_WARNING)

    # 4. Houseboat trust warning — Kerala only, triggered by RAG synthesis
    if is_kerala and not any("cold-approach" in w or "inflate" in w for w in warnings):
        if research_synthesis:
            risks = research_synthesis.get("local_risks", []) + research_synthesis.get("implicit_warnings", [])
            if any("houseboat" in r.lower() for r in risks):
                warnings.append(HOUSEBOAT_TRUST_WARNING)
        else:
            warnings.append(HOUSEBOAT_TRUST_WARNING)

    # 5. Alleppey hotel location warning — Kerala only
    if is_kerala and not any("NH 66" in w or "finishing point" in w.lower() for w in warnings):
        if research_synthesis:
            all_text = " ".join(research_synthesis.get("implicit_warnings", []) + research_synthesis.get("local_risks", []))
            if "alleppey" in all_text.lower() or "hotel location" in all_text.lower() or "highway" in all_text.lower():
                warnings.append(ALLEPPEY_LOCATION_WARNING)
        else:
            warnings.append(ALLEPPEY_LOCATION_WARNING)

    plan["warnings"] = warnings
    return plan


def _call_llm(system: str, user_message: str, max_tokens: int = 4096) -> dict | list:
    for attempt in range(2):
        extra_instruction = (
            "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no prose, no code fences."
            if attempt == 1
            else ""
        )
        if attempt == 1:
            time.sleep(2)
        response = _client.chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_message + extra_instruction},
            ],
            max_tokens=max_tokens,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            if attempt == 1:
                raise
    raise RuntimeError("LLM returned unparseable JSON after retry")


def persona_classification(state: TripSathiState) -> dict:
    answers_text = "\n".join(
        f"Q: {a['question']}\nA: {a['answer']}" for a in state["onboarding_answers"]
    )
    if state.get("destination"):
        answers_text += f"\nDestination hint: {state['destination']}"

    try:
        user_profile = _call_llm(PERSONA_CLASSIFICATION_SYSTEM, answers_text, max_tokens=1024)
    except Exception as e:
        return {"error": f"persona_classification_failed: {e}", "current_node": "error"}

    return {
        "user_profile": user_profile,
        "current_node": "destination_intelligence",
        "stage_label": "Researching your destination",
        "error": None,
    }


def destination_intelligence(state: TripSathiState) -> dict:
    from rag.indexer import get_query_engine

    # Call 2: expand queries
    expansion_prompt = (
        f"Destination: {state['destination']}\n"
        f"Traveller profile: {json.dumps(state['user_profile'])}\n"
        f"Trip: {json.dumps(state['trip_parameters'])}"
    )
    try:
        expanded_queries = _call_llm(QUERY_EXPANSION_SYSTEM, expansion_prompt, max_tokens=512)
    except Exception as e:
        return {"error": f"destination_intelligence_failed: {e}", "current_node": "error"}

    # LlamaIndex retrieval (local variable — not state)
    retrieved_content = []
    try:
        query_engine = get_query_engine()
        for q in expanded_queries:
            result = query_engine.query(q)
            text = str(result).strip()
            if text:
                retrieved_content.append(text)
    except Exception:
        pass  # Graceful degradation: proceed with empty corpus

    knowledge_block = (
        "\n\n---\n\n".join(retrieved_content)
        if retrieved_content
        else "No destination-specific content retrieved. Use your general knowledge and flag knowledge gaps in implicit_warnings."
    )

    # Call 3: synthesize
    synthesis_prompt = (
        f"Destination: {state['destination']}\n"
        f"Traveller profile: {json.dumps(state['user_profile'])}\n"
        f"Trip parameters: {json.dumps(state['trip_parameters'])}\n"
        f"Retrieved knowledge:\n{knowledge_block}"
    )
    try:
        research_synthesis = _call_llm(RESEARCH_SYNTHESIS_SYSTEM, synthesis_prompt, max_tokens=2048)
    except Exception as e:
        return {"error": f"destination_intelligence_failed: {e}", "current_node": "error"}

    return {
        "research_synthesis": research_synthesis,
        "current_node": "plan_assembly",
        "stage_label": "Generating your itinerary",
        "error": None,
    }


def plan_assembly(state: TripSathiState) -> dict:
    """Generate, refine, or regenerate the plan based on state. No interrupt here — that's human_feedback's job."""
    if state.get("regenerate_requested"):
        regen_prompt = (
            f"Previous plan (REJECTED): {json.dumps(state.get('plan'))}\n"
            f"Destination: {state['destination']}\n"
            f"Research: {json.dumps(state.get('research_synthesis'))}\n"
            f"User profile: {json.dumps(state.get('user_profile'))}\n"
            f"Trip parameters: {json.dumps(state['trip_parameters'])}"
        )
        try:
            new_plan = _call_llm(PLAN_REGENERATE_SYSTEM, regen_prompt)
        except Exception as e:
            return {"error": f"plan_assembly_failed: {e}", "current_node": "error"}
        regen_kid_ages = state["trip_parameters"].get("kid_ages") or []
        new_plan = _enforce_plan_quality(new_plan, regen_kid_ages, state.get("research_synthesis"), state["destination"])
        return {
            "plan": new_plan,
            "previous_plan": state.get("plan"),
            "regenerate_requested": False,
            "refinement_count": 0,
            "refinement_history": [],
            "awaiting_feedback": True,
            "current_node": "awaiting_feedback",
            "stage_label": "Review your plan",
            "error": None,
        }

    if state.get("user_feedback") is not None:
        feedback = state["user_feedback"]
        refinement_prompt = (
            f"Current plan: {json.dumps(state.get('plan'))}\n"
            f"User change request: {feedback}\n"
            f"Previous changes: {json.dumps(state.get('refinement_history', []))}\n"
            f"User profile: {json.dumps(state.get('user_profile'))}\n"
            f"Trip parameters: {json.dumps(state['trip_parameters'])}"
        )
        try:
            updated_plan = _call_llm(PLAN_REFINEMENT_SYSTEM, refinement_prompt)
        except Exception as e:
            # Non-fatal: keep current plan, surface error as warning
            return {
                "user_feedback": None,
                "error": f"refinement_failed: {e}",
                "awaiting_feedback": True,
                "current_node": "awaiting_feedback",
                "stage_label": "Review your plan",
            }
        return {
            "plan": updated_plan,
            "previous_plan": state.get("plan"),
            "user_feedback": None,
            "refinement_count": state.get("refinement_count", 0) + 1,
            "refinement_history": state.get("refinement_history", []) + [feedback],
            "awaiting_feedback": True,
            "current_node": "awaiting_feedback",
            "stage_label": "Review your plan",
            "error": None,
        }

    # Initial generation
    kid_ages = state["trip_parameters"].get("kid_ages") or (state.get("user_profile") or {}).get("constraints", {}).get("kid_ages") or []
    toddler_block = ""
    if any(age <= 3 for age in kid_ages if isinstance(age, int)):
        toddler_block = (
            "\n\nCRITICAL TODDLER CONSTRAINTS — KID AGE ≤ 3 DETECTED. YOU MUST FOLLOW ALL OF THESE:\n"
            "1. MIDDAY NAP: Every single day's notes field MUST contain this exact text: "
            "'1:00–2:30 PM: mandatory nap/rest at hotel — no activities scheduled during this window.'\n"
            "2. NO OVERNIGHT HOUSEBOAT: Do NOT list a houseboat as hotel/accommodation. "
            "A houseboat is only allowed as a DAY ACTIVITY (4–6 hour daytime cruise). "
            "The hotel for any night in Alleppey must be a land-based hotel, not a houseboat.\n"
            "3. Add to warnings: 'Overnight houseboat not suitable for toddlers under 3 — "
            "open deck with no railings. Book a day cruise (4–6 hrs) instead through your hotel.'\n"
            "4. SOFT FOOD: Every breakfast/lunch/dinner must name a specific toddler-safe dish "
            "(idli, plain rice with dal, appam with stew, plain dosa, puttu with banana). "
            "Do not write 'kid-friendly options' without naming the dish.\n"
            "5. HOTEL HIGH CHAIR: Each hotel's reasoning must include whether a high chair is available "
            "or must be pre-requested.\n"
            "6. MAX 2 ACTIVITIES per day. No activity requiring more than 20 minutes of continuous walking."
        )

    # Extract explicit must-haves from onboarding answers
    explicit_reqs = [
        a["answer"] for a in state.get("onboarding_answers", [])
        if any(kw in a["answer"].lower() for kw in ["must", "priority", "want to", "need to", "include", "cover"])
    ]
    req_block = ""
    if explicit_reqs:
        req_block = (
            "\n\nMANDATORY USER REQUIREMENTS — include every one of these in the plan, "
            "even if not optimal from a logistics standpoint:\n"
            + "\n".join(f"- {r}" for r in explicit_reqs)
        )

    generation_prompt = (
        f"Destination: {state['destination']}\n"
        f"Research: {json.dumps(state.get('research_synthesis'))}\n"
        f"User profile: {json.dumps(state.get('user_profile'))}\n"
        f"Trip parameters: {json.dumps(state['trip_parameters'])}"
        f"{req_block}"
        f"{toddler_block}"
    )
    try:
        plan = _call_llm(PLAN_GENERATION_SYSTEM, generation_prompt)
    except Exception as e:
        return {"error": f"plan_assembly_failed: {e}", "current_node": "error"}
    plan = _enforce_plan_quality(plan, kid_ages, state.get("research_synthesis"), state["destination"])
    return {
        "plan": plan,
        "refinement_count": 1,
        "refinement_history": [],
        "awaiting_feedback": True,
        "current_node": "awaiting_feedback",
        "stage_label": "Review your plan",
        "error": None,
    }


def human_feedback(state: TripSathiState) -> dict:
    """Interrupt the graph and wait for user input. Returns user input to state on resume."""
    user_input = interrupt(
        {
            "plan": state.get("plan"),
            "status": "awaiting_feedback",
            "stage_label": state.get("stage_label"),
            "refinement_count": state.get("refinement_count", 0),
            "error": state.get("error"),
        }
    )
    # user_input is the value passed to Command(resume=...) on resume
    if isinstance(user_input, dict) and user_input.get("regenerate"):
        return {"regenerate_requested": True, "user_feedback": None}
    return {"user_feedback": str(user_input), "regenerate_requested": False}


def finalize(state: TripSathiState) -> dict:
    return {
        "awaiting_feedback": False,
        "current_node": "done",
        "stage_label": "Plan finalised",
    }


def route_after_feedback(state: TripSathiState) -> str:
    """Route after human_feedback: loop to plan_assembly or finalize."""
    from langgraph.graph import END

    if state.get("regenerate_requested"):
        return "plan_assembly"

    feedback = state.get("user_feedback", "")
    if feedback and (
        feedback.lower().strip() in APPROVAL_SIGNALS
        or state.get("refinement_count", 0) >= 5
    ):
        return "finalize"

    if feedback:
        return "plan_assembly"

    return END
