import json
import logging
import os
import time
from openai import OpenAI

logger = logging.getLogger(__name__)
from langgraph.types import interrupt
from state import TripSathiState
from prompts import (
    RESEARCH_AGENT_SYSTEM,
    PERSONA_CLASSIFICATION_SYSTEM,
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

# Separate client for the research agent — uses a model with confirmed tool-calling support.
# Defaults to llama-3.3-70b-versatile; override with RESEARCH_MODEL env var.
_RESEARCH_MODEL = os.environ.get("RESEARCH_MODEL", "llama-3.3-70b-versatile")
_research_client = OpenAI(
    base_url=os.environ.get("LLM_BASE_URL", "http://localhost:1234/v1"),
    api_key=os.environ.get("LLM_API_KEY", "lm-studio"),
)

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


def _get_kid_ages(state) -> list:
    """Single source of truth: trip_parameters overrides, user_profile.constraints as fallback."""
    return (
        state["trip_parameters"].get("kid_ages")
        or (state.get("user_profile") or {}).get("constraints", {}).get("kid_ages")
        or []
    )


def _get_elderly(state) -> bool:
    return bool(
        state["trip_parameters"].get("elderly")
        or (state.get("user_profile") or {}).get("constraints", {}).get("elderly")
    )


def _enforce_plan_quality(plan: dict, kid_ages: list, research_synthesis: dict | None, destination: str = "", elderly: bool = False) -> dict:
    """Post-process: enforce toddler rules and surface RAG warnings the LLM missed."""
    toddler = any(isinstance(age, int) and age <= 3 for age in kid_ages)
    warnings = plan.get("warnings", [])
    dest_lower = destination.lower()
    is_kerala = "kerala" in dest_lower or "alleppey" in dest_lower or "munnar" in dest_lower or "kochi" in dest_lower

    has_young_child = any(isinstance(age, int) and age <= 10 for age in kid_ages)

    if toddler:
        # 1. Midday nap block in every day (toddler)
        for day in plan.get("days", []):
            notes = day.get("notes", "")
            if "1:00" not in notes and "nap" not in notes.lower() and "rest" not in notes.lower():
                day["notes"] = "1:00–2:30 PM: mandatory nap/rest at hotel — no activities scheduled during this window. " + notes

        # 2. Replace overnight houseboat hotel with land hotel (Kerala only, toddler)
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

    elif elderly and has_young_child:
        # 1b. Afternoon rest for elderly + young child combo
        for day in plan.get("days", []):
            notes = day.get("notes", "")
            if "rest" not in notes.lower() and "midday" not in notes.lower() and "afternoon" not in notes.lower():
                day["notes"] = "1:00–2:00 PM: midday rest — elderly and child benefit from afternoon break before evening activities. " + notes

    # 4. Carry all synthesis local_risks and implicit_warnings into plan.warnings
    #    — guarantees RAG-sourced risks reach the user even if plan LLM dropped them
    if research_synthesis:
        synthesis_risks = (
            research_synthesis.get("local_risks", []) +
            research_synthesis.get("implicit_warnings", [])
        )
        existing_lower = " ".join(warnings).lower()
        for risk in synthesis_risks:
            # De-duplicate: skip if the key substance is already present (50-char fingerprint)
            fingerprint = risk[:50].lower()
            if fingerprint not in existing_lower:
                warnings.append(risk)
                existing_lower += " " + risk.lower()

    # 6. Houseboat trust warning — Kerala only, triggered by RAG synthesis
    if is_kerala and not any("cold-approach" in w or "inflate" in w for w in warnings):
        if research_synthesis:
            risks = research_synthesis.get("local_risks", []) + research_synthesis.get("implicit_warnings", [])
            if any("houseboat" in r.lower() for r in risks):
                warnings.append(HOUSEBOAT_TRUST_WARNING)
        else:
            warnings.append(HOUSEBOAT_TRUST_WARNING)

    # 7. Alleppey hotel location warning — Kerala only
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
    for attempt in range(3):
        extra_instruction = (
            "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no prose, no code fences."
            if attempt > 0
            else ""
        )
        if attempt > 0:
            time.sleep(8 * attempt)  # 8s, 16s backoff — rate-limit recovery
        response = _client.chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_message + extra_instruction},
            ],
            max_tokens=max_tokens,
        )
        if response.usage:
            logger.info(
                "llm_call model=%s prompt_tokens=%d completion_tokens=%d total_tokens=%d",
                _MODEL,
                response.usage.prompt_tokens,
                response.usage.completion_tokens,
                response.usage.total_tokens,
            )
        raw = (response.choices[0].message.content or "").strip()
        if not raw:
            continue  # empty response — retry with backoff
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            if attempt == 2:
                raise
    raise RuntimeError("LLM returned empty or unparseable JSON after 3 attempts")


def persona_classification(state: TripSathiState) -> dict:
    from memory import read_memories

    answers_text = "\n".join(
        f"Q: {a['question']}\nA: {a['answer']}" for a in state["onboarding_answers"]
    )
    if state.get("destination"):
        answers_text += f"\nDestination hint: {state['destination']}"

    # Inject long-term memories if a user_id is present in trip_parameters
    user_id = state["trip_parameters"].get("user_id", "")
    past_memories = read_memories(user_id)
    if past_memories:
        answers_text += f"\n\n{past_memories}"

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


def _run_research_agent(destination: str, user_profile: dict, trip_parameters: dict) -> list[str]:
    """ReAct agent loop: uses web_search + knowledge_base_query tools to gather destination intel.
    Returns a list of content strings collected from tool calls."""
    from tools import TOOL_SCHEMAS, execute_tool

    dest_slug = destination.lower().split(",")[0].strip().replace(" ", "_")
    task = (
        f"Research destination: {destination}\n"
        f"Traveller profile: {json.dumps(user_profile)}\n"
        f"Trip parameters: {json.dumps(trip_parameters)}\n\n"
        "Gather comprehensive destination intelligence covering routing, local risks, "
        "seasonal context, key places, and persona-specific concerns using the tools available.\n"
        f"When calling knowledge_base_query, always pass destination=\"{dest_slug}\" "
        "to restrict results to this destination only."
    )

    messages = [
        {"role": "system", "content": RESEARCH_AGENT_SYSTEM},
        {"role": "user", "content": task},
    ]

    gathered = []
    MAX_ITERATIONS = 8

    for iteration in range(MAX_ITERATIONS):
        response = _research_client.chat.completions.create(
            model=_RESEARCH_MODEL,
            messages=messages,
            tools=TOOL_SCHEMAS,
            tool_choice="auto",
            max_tokens=2048,
        )
        choice = response.choices[0]
        messages.append(choice.message)

        if choice.finish_reason != "tool_calls" or not choice.message.tool_calls:
            logger.info("research_agent done after %d iterations", iteration + 1)
            break

        for tc in choice.message.tool_calls:
            args = json.loads(tc.function.arguments)
            result = execute_tool(tc.function.name, args)
            logger.info("research_agent tool=%s query=%r chars=%d", tc.function.name, args.get("query", ""), len(result))
            gathered.append(f"[{tc.function.name}: {args.get('query', '')}]\n{result}")
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })

    return gathered


def _enrich_hotel_prices(plan: dict, destination: str, duration_nights: int) -> dict:
    """Search Tavily for current hotel prices and patch approx_cost_per_night in-place."""
    import re
    from tools import web_search

    for hotel in plan.get("hotels", []):
        name = hotel.get("name", "")
        if not name or len(name) < 5 or "land hotel" in name.lower():
            continue  # skip placeholders
        query = f"{name} {destination} hotel price per night INR 2025 booking"
        try:
            result = web_search(query)
            # Match patterns like ₹2,500 / Rs 3000 / 2500 per night
            prices_raw = re.findall(
                r'(?:₹|Rs\.?\s*)(\d{1,2},?\d{3})\s*(?:/\s*night|per night|a night)?',
                result, re.IGNORECASE
            )
            if not prices_raw:
                prices_raw = re.findall(r'(\d{1,2},?\d{3})\s*(?:per night|/night)', result, re.IGNORECASE)
            parsed = sorted(
                {int(p.replace(",", "")) for p in prices_raw if 500 <= int(p.replace(",", "")) <= 50_000}
            )
            if parsed:
                median = parsed[len(parsed) // 2]
                hotel["approx_cost_per_night"] = median
                hotel["content_source"] = "web"
                logger.info("hotel_price_enriched name=%r price=%d", name, median)
        except Exception as e:
            logger.warning("hotel_price_lookup_failed name=%r: %s", name, e)

    # Recalculate accommodation + total in budget_breakdown
    hotels = plan.get("hotels", [])
    budget = plan.get("budget_breakdown", {})
    if budget and hotels:
        budget["accommodation"] = sum(
            h.get("approx_cost_per_night", 0) * duration_nights for h in hotels
        )
        budget["total"] = sum([
            budget.get("accommodation", 0),
            budget.get("transport", 0),
            budget.get("activities", 0),
            budget.get("food", 0),
        ])
        plan["budget_breakdown"] = budget

    return plan


def destination_intelligence(state: TripSathiState) -> dict:
    # Research agent loop: gathers content via web_search + knowledge_base_query tools
    try:
        gathered_content = _run_research_agent(
            state["destination"],
            state.get("user_profile") or {},
            state["trip_parameters"],
        )
    except Exception as e:
        return {"error": f"destination_intelligence_failed: {e}", "current_node": "error"}

    knowledge_block = (
        "\n\n---\n\n".join(gathered_content)
        if gathered_content
        else "No destination-specific content retrieved. Use your general knowledge and flag knowledge gaps in implicit_warnings."
    )
    no_content = not gathered_content

    # Synthesis call: same as before — turns gathered content into structured research_synthesis
    synthesis_prompt = (
        f"Destination: {state['destination']}\n"
        f"Traveller profile: {json.dumps(state.get('user_profile'))}\n"
        f"Trip parameters: {json.dumps(state['trip_parameters'])}\n"
        f"Retrieved knowledge:\n{knowledge_block}"
    )
    try:
        research_synthesis = _call_llm(RESEARCH_SYNTHESIS_SYSTEM, synthesis_prompt, max_tokens=4096)
    except Exception as e:
        return {"error": f"destination_intelligence_failed: {e}", "current_node": "error"}

    if no_content:
        warnings = research_synthesis.get("implicit_warnings", [])
        warnings.insert(0, (
            "No destination content retrieved — recommendations are based on general knowledge only. "
            "Verify local risks, pricing, and logistics independently before booking."
        ))
        research_synthesis["implicit_warnings"] = warnings

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
        new_plan = _enforce_plan_quality(new_plan, _get_kid_ages(state), state.get("research_synthesis"), state["destination"], elderly=_get_elderly(state))
        new_plan = _enrich_hotel_prices(new_plan, state["destination"], state["trip_parameters"].get("duration_nights", 1))
        return {
            "plan": new_plan,
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
        synthesis = state.get("research_synthesis") or {}
        recent_history = state.get("refinement_history", [])[-3:]
        rag_risks = synthesis.get("local_risks", []) + synthesis.get("implicit_warnings", [])
        refinement_prompt = (
            f"Current plan: {json.dumps(state.get('plan'))}\n"
            f"User change request: {feedback}\n"
            f"Previous changes: {json.dumps(recent_history)}\n"
            f"User profile: {json.dumps(state.get('user_profile'))}\n"
            f"Trip parameters: {json.dumps(state['trip_parameters'])}"
            + (f"\nRAG risks — preserve verbatim in refined plan: {json.dumps(rag_risks)}" if rag_risks else "")
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
        updated_plan = _enforce_plan_quality(updated_plan, _get_kid_ages(state), synthesis or None, state["destination"], elderly=_get_elderly(state))
        return {
            "plan": updated_plan,
            "user_feedback": None,
            "refinement_count": state.get("refinement_count", 0) + 1,
            "refinement_history": state.get("refinement_history", []) + [feedback],
            "awaiting_feedback": True,
            "current_node": "awaiting_feedback",
            "stage_label": "Review your plan",
            "error": None,
        }

    # Initial generation
    kid_ages = _get_kid_ages(state)
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
    is_elderly = _get_elderly(state)
    plan = _enforce_plan_quality(plan, kid_ages, state.get("research_synthesis"), state["destination"], elderly=is_elderly)
    plan = _enrich_hotel_prices(plan, state["destination"], state["trip_parameters"].get("duration_nights", 1))
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
    from memory import write_memory

    user_id = state["trip_parameters"].get("user_id", "")
    write_memory(
        user_id=user_id,
        plan=state.get("plan") or {},
        trip_parameters=state.get("trip_parameters") or {},
        user_profile=state.get("user_profile") or {},
    )
    return {
        "awaiting_feedback": False,
        "current_node": "done",
        "stage_label": "Plan finalised",
    }


def _classify_approval(feedback: str) -> bool:
    """LLM semantic check for ambiguous approval signals not in the keyword list."""
    prompt = (
        f'Is this user message approving a travel plan as-is, or requesting a change?\n'
        f'Message: "{feedback}"\n'
        f'Reply with exactly one word: approve OR change'
    )
    try:
        response = _client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=5,
        )
        answer = (response.choices[0].message.content or "").strip().lower()
        return answer.startswith("approve")
    except Exception as e:
        logger.warning("_classify_approval LLM call failed: %s — treating as change request", e)
        return False


def route_after_feedback(state: TripSathiState) -> str:
    """Route after human_feedback: loop to plan_assembly or finalize."""
    from langgraph.graph import END

    if state.get("regenerate_requested"):
        return "plan_assembly"

    feedback = state.get("user_feedback", "")
    if not feedback:
        return END

    # Fast path: exact keyword match
    if feedback.lower().strip() in APPROVAL_SIGNALS:
        return "finalize"

    # Semantic path: LLM classifies ambiguous signals ("that works", "all good", etc.)
    if _classify_approval(feedback):
        return "finalize"

    return "plan_assembly"
