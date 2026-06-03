import json
import logging
import os
import time
from openai import OpenAI

logger = logging.getLogger(__name__)
from langgraph.types import interrupt
from state import TripSathiState
from prompts import (
    CANDIDATE_GEN_SYSTEM,
    CLARIFY_SYSTEM,
    CRITIC_SYSTEM,
    PERSONA_CLASSIFICATION_SYSTEM,
    TASTE_DELTA_SYSTEM,
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

DESTINATION_RULES: dict[str, dict] = {
    # keys are lowercase substrings to match in destination name
    "kerala": {
        "toddler_hotel_swap": {
            "match_hotel_keyword": "houseboat",
            "replacement_name": "Backwater-side land hotel (book near jetty, not highway)",
            "replacement_reasoning": (
                "Overnight houseboat not safe for toddlers under 3. "
                "Choose a land hotel near the backwater jetty (Finishing Point Road area) "
                "for easy day-cruise access. High chair: pre-request on booking."
            ),
        },
        "toddler_warning": (
            "Overnight houseboat not suitable for children under 3: open deck with no railings, "
            "open water, limited bathroom facilities. Book a day cruise (4–6 hrs) instead through your hotel."
        ),
        "trust_warnings": [
            {
                "trigger_in_synthesis": ["houseboat"],
                "text": (
                    "Houseboat booking risk: cold-approach operators at the jetty inflate prices 30–50% "
                    "and may provide substandard boats. Book through your hotel front desk or a Kerala Tourism-certified "
                    "aggregator (e.g. Vasudeva Vilasam for mid-range, Spice Routes Leisure for premium)."
                ),
                "dedup_key": "cold-approach",
            },
        ],
        "location_warnings": [
            {
                "trigger_in_synthesis": ["alleppey", "hotel location", "highway"],
                "text": (
                    "Alleppey hotel location matters: choose a hotel near the backwater junction "
                    "(Finishing Point Road or near the boat jetty) — NOT on NH 66 or near Alleppey beach, "
                    "which adds 3–5 km and extra cost to reach houseboats."
                ),
                "dedup_key": "NH 66",
            },
        ],
    },
    "manali": {
        "trust_warnings": [
            {
                "trigger_in_synthesis": ["photo tout", "hadimba", "cap"],
                "text": (
                    "Photo tout risk at Hadimba Temple: men with Himachali caps and yaks position themselves "
                    "on the approach path. Once a cap is placed on a child, they demand ₹300–500. "
                    "Decline before physical contact — walk past without eye contact."
                ),
                "dedup_key": "photo tout",
            },
        ],
    },
    "jaisalmer": {
        "trust_warnings": [
            {
                "trigger_in_synthesis": ["camel", "operator", "desert camp"],
                "text": (
                    "Desert camp and camel safari operators outside the fort charge inflated rates. "
                    "Book through your hotel or a TripAdvisor-reviewed operator. "
                    "Confirm camp location: Sam Sand Dunes (40 km) is more scenic than closer alternatives."
                ),
                "dedup_key": "desert camp",
            },
        ],
    },
}


def _get_destination_rules(destination: str) -> dict:
    dest_lower = destination.lower()
    for key, rules in DESTINATION_RULES.items():
        if key in dest_lower:
            return rules
    return {}


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
    rules = _get_destination_rules(destination)

    has_young_child = any(isinstance(age, int) and age <= 10 for age in kid_ages)

    if toddler:
        # 1. Midday nap block in every day (toddler)
        for day in plan.get("days", []):
            notes = day.get("notes", "")
            if "1:00" not in notes and "nap" not in notes.lower() and "rest" not in notes.lower():
                day["notes"] = "1:00–2:30 PM: mandatory nap/rest at hotel — no activities scheduled during this window. " + notes

        # 2. Replace overnight hotel matching keyword with land alternative (destination-specific)
        swap = rules.get("toddler_hotel_swap")
        if swap:
            keyword = swap["match_hotel_keyword"]
            for hotel in plan.get("hotels", []):
                if keyword in hotel.get("name", "").lower():
                    hotel["name"] = swap["replacement_name"]
                    hotel["reasoning"] = swap["replacement_reasoning"]
                    hotel["content_source"] = "rag"

        # 3. Add toddler warning (destination-specific)
        toddler_warning = rules.get("toddler_warning")
        if toddler_warning and not any("under 3" in w or "toddler" in w.lower() for w in warnings):
            warnings.insert(0, toddler_warning)

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

    # 5. Trust warnings — destination-specific, triggered by RAG synthesis keywords
    synthesis_text = ""
    if research_synthesis:
        all_risks = research_synthesis.get("local_risks", []) + research_synthesis.get("implicit_warnings", [])
        synthesis_text = " ".join(all_risks).lower()

    for tw in rules.get("trust_warnings", []):
        dedup_key = tw["dedup_key"]
        if any(dedup_key in w for w in warnings):
            continue
        triggers = tw["trigger_in_synthesis"]
        if research_synthesis:
            if any(t in synthesis_text for t in triggers):
                warnings.append(tw["text"])
        else:
            warnings.append(tw["text"])

    # 6. Location warnings — destination-specific, triggered by RAG synthesis keywords
    for lw in rules.get("location_warnings", []):
        dedup_key = lw["dedup_key"]
        if any(dedup_key in w for w in warnings):
            continue
        triggers = lw["trigger_in_synthesis"]
        if research_synthesis:
            if any(t in synthesis_text for t in triggers):
                warnings.append(lw["text"])
        else:
            warnings.append(lw["text"])

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

    if state.get("traveler_notes"):
        answers_text += f"\n\nUser's original request (verbatim): {state['traveler_notes']}"

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


def destination_intelligence(state: TripSathiState) -> dict:
    from rag.indexer import get_query_engine

    # Call 2: expand queries
    expansion_prompt = (
        f"Destination: {state['destination']}\n"
        f"Traveller profile: {json.dumps(state['user_profile'])}\n"
        f"Trip: {json.dumps(state['trip_parameters'])}"
    )
    try:
        expanded_queries = _call_llm(QUERY_EXPANSION_SYSTEM, expansion_prompt, max_tokens=1024)
    except Exception as e:
        return {"error": f"destination_intelligence_failed: {e}", "current_node": "error"}

    # LlamaIndex retrieval (local variable — not state)
    retrieved_content = []
    rag_failed = False
    dest_slug = state["destination"].lower().split(",")[0].strip().replace(" ", "_")
    try:
        query_engine = get_query_engine(destination=dest_slug)
        for q in expanded_queries:
            result = query_engine.query(q)
            text = str(result).strip()
            if text:
                retrieved_content.append(text)
    except Exception:
        rag_failed = True  # Graceful degradation: proceed with empty corpus

    if not retrieved_content:
        rag_failed = True

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
        research_synthesis = _call_llm(RESEARCH_SYNTHESIS_SYSTEM, synthesis_prompt, max_tokens=4096)
    except Exception as e:
        return {"error": f"destination_intelligence_failed: {e}", "current_node": "error"}

    if rag_failed:
        warnings = research_synthesis.get("implicit_warnings", [])
        warnings.insert(0, (
            "Local knowledge base returned no results for this destination — "
            "recommendations are based on general knowledge only. "
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

    notes_block = ""
    if state.get("traveler_notes"):
        notes_block = f"\n\nUser's original request (verbatim — honor the intent and tone): {state['traveler_notes']}"

    # Ranked candidates block — steer plan generation toward taste-matched items
    ranked_block = ""
    ranked = state.get("ranked_candidates") or []
    if ranked:
        def _fmt(items: list, n: int) -> str:
            return "\n".join(
                f"  - {c['name']} (match {c.get('match_score', 0):.3f}): {c.get('description', '')[:90]}"
                for c in items[:n]
            )
        activities = [c for c in ranked if c.get("type") not in ("hotel", "restaurant")]
        hotels     = [c for c in ranked if c.get("type") == "hotel"]
        restaurants = [c for c in ranked if c.get("type") == "restaurant"]
        ranked_block = "\n\nRANKED CANDIDATES (pre-scored against traveller taste — use as your primary selection pool):"
        if activities:
            ranked_block += f"\nActivities/experiences:\n{_fmt(activities, 12)}"
        if hotels:
            ranked_block += f"\nHotels:\n{_fmt(hotels, 4)}"
        if restaurants:
            ranked_block += f"\nRestaurants:\n{_fmt(restaurants, 5)}"
        ranked_block += "\nPrioritise higher-scored items. Include a lower-scored item only if logistically essential."

    generation_prompt = (
        f"Destination: {state['destination']}\n"
        f"Research: {json.dumps(state.get('research_synthesis'))}\n"
        f"User profile: {json.dumps(state.get('user_profile'))}\n"
        f"Trip parameters: {json.dumps(state['trip_parameters'])}"
        f"{notes_block}"
        f"{ranked_block}"
        f"{req_block}"
        f"{toddler_block}"
    )
    try:
        plan = _call_llm(PLAN_GENERATION_SYSTEM, generation_prompt)
    except Exception as e:
        return {"error": f"plan_assembly_failed: {e}", "current_node": "error"}
    is_elderly = _get_elderly(state)
    plan = _enforce_plan_quality(plan, kid_ages, state.get("research_synthesis"), state["destination"], elderly=is_elderly)
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
    """Mark plan as done and persist taste deltas extracted from refinements."""
    _persist_taste_deltas(state)
    return {
        "awaiting_feedback": False,
        "current_node": "done",
        "stage_label": "Plan finalised",
    }


def _rerank(query: str, documents: list[str], top_k: int = 30) -> list[tuple[int, float]]:
    """Score documents against query. Returns (original_index, score) sorted by relevance desc.
    Tries Voyage rerank-2.5 first; falls back to Cohere rerank-english-v3.0; then identity order."""
    if os.getenv("VOYAGE_API_KEY"):
        try:
            import voyageai
            from packaging.version import Version
            if Version(voyageai.__version__) >= Version("0.3.0"):
                vo = voyageai.Client(api_key=os.environ["VOYAGE_API_KEY"])
                result = vo.rerank(query, documents, model="rerank-2.5", top_k=min(top_k, len(documents)))
                return [(r.index, r.relevance_score) for r in result.results]
            # voyageai < 0.3.0 has no rerank — fall through to Cohere
        except Exception as e:
            logger.warning("Voyage rerank failed (%s) — trying Cohere", e)
    if os.getenv("COHERE_API_KEY"):
        try:
            import cohere
            co = cohere.Client(api_key=os.environ["COHERE_API_KEY"])
            result = co.rerank(
                query=query, documents=documents,
                model="rerank-english-v3.0",
                top_n=min(top_k, len(documents)),
                return_documents=False,
            )
            return [(r.index, r.relevance_score) for r in result.results]
        except Exception as e:
            logger.warning("Cohere rerank also failed (%s) — using identity order", e)
    return [(i, 0.5) for i in range(min(len(documents), top_k))]


def _build_taste_query(taste_profile: dict | None, user_profile: dict | None, trip_parameters: dict) -> str:
    """Build a natural-language POSITIVE preference statement for the reranker.
    Cross-encoders need full sentences. Only include positive wants — negatives backfire.
    Hard avoids are filtered in _filter_candidates before this is called."""
    clauses: list[str] = []

    if taste_profile:
        pace = taste_profile.get("pace", 3)
        ct   = taste_profile.get("crowd_tolerance", 3)
        fa   = taste_profile.get("food_adventurousness", 3)
        wt   = taste_profile.get("walking_tolerance", 3)
        at   = taste_profile.get("accommodation_taste", 3)

        # Pace + crowd
        if pace <= 2 and ct <= 2:
            clauses.append("slow relaxed trip exploring quiet offbeat hidden local spots away from tourists")
        elif pace <= 2:
            clauses.append("slow relaxed leisurely travel")
        elif ct <= 2:
            clauses.append("offbeat peaceful authentic local experiences away from tourist crowds")
        elif pace >= 4:
            clauses.append("active packed itinerary visiting multiple popular attractions each day")

        # Interests
        interests = taste_profile.get("interests", {})
        high = [k for k, v in sorted(interests.items(), key=lambda x: -x[1]) if v >= 0.6]
        if high:
            clauses.append(f"interested in {' '.join(high[:5])}")

        # Walking
        if wt >= 4:
            clauses.append("enjoys hiking trekking and walking trails in nature")
        elif wt <= 2:
            clauses.append("prefers easy accessible flat terrain minimal walking")

        # Accommodation
        if at <= 2:
            clauses.append("prefers staying in boutique hotels homestays guesthouses")
        elif at >= 4:
            clauses.append("prefers well-appointed hotel resorts with full amenities")

        # Food
        if fa >= 4:
            clauses.append("loves trying authentic local street food and regional cuisine")
        elif fa <= 2:
            clauses.append("prefers familiar hotel dining and known cuisine")

        # Dietary
        if taste_profile.get("dietary_restrictions"):
            clauses.append(f"{' '.join(taste_profile['dietary_restrictions'])} food options")

    up = user_profile or {}
    constraints = up.get("constraints", {})
    if constraints.get("kid_ages"):
        clauses.append("family-friendly activities suitable for young children")
    if constraints.get("elderly"):
        clauses.append("accessible low-intensity senior-friendly activities with flat terrain")
    if trip_parameters.get("budget") == "budget":
        clauses.append("free or very low cost activities")

    return ". ".join(clauses) + "." if clauses else "Authentic local sightseeing and cultural experiences."


def _filter_candidates(candidates: list, taste_profile: dict | None, user_profile: dict | None) -> list:
    """Pre-filter candidates on hard constraints before reranking.
    Removes items matching hard_avoids, and checks toddler/elderly flags."""
    hard_avoids = [a.lower() for a in (taste_profile or {}).get("hard_avoids", [])]
    up = user_profile or {}
    constraints = up.get("constraints", {})
    kid_ages = constraints.get("kid_ages") or []
    has_toddler = any(isinstance(a, int) and a <= 3 for a in kid_ages)
    has_elderly = bool(constraints.get("elderly"))

    filtered = []
    for c in candidates:
        text = (c.get("name", "") + " " + c.get("description", "")).lower()
        if any(avoid in text for avoid in hard_avoids if len(avoid) > 3):
            continue
        if has_toddler and c.get("toddler_ok") is False:
            continue
        if has_elderly and c.get("elderly_ok") is False:
            continue
        filtered.append(c)

    return filtered if len(filtered) >= 5 else candidates  # don't filter so hard we're left with nothing


def _candidate_to_doc(c: dict) -> str:
    tags = ", ".join(c.get("interest_tags", []))
    return (
        f"{c.get('name', '')}: {c.get('description', '')} "
        f"Type: {c.get('type', '')}. Tags: {tags}. "
        f"Cost: {c.get('cost_tier', '')}. Terrain: {c.get('terrain', '')}."
    )


def candidate_gen(state: TripSathiState) -> dict:
    """Extract a structured item pool from research_synthesis using the LLM."""
    synthesis = state.get("research_synthesis") or {}
    extraction_input = (
        f"Destination: {state['destination']}\n"
        f"Key places: {json.dumps(synthesis.get('key_places', []))}\n"
        f"Routing: {synthesis.get('routing', '')}\n"
        f"Seasonal context: {synthesis.get('seasonal_context', '')}\n"
        f"User profile: {json.dumps(state.get('user_profile'))}\n"
        f"Trip parameters: {json.dumps(state['trip_parameters'])}"
    )
    try:
        raw = _call_llm(CANDIDATE_GEN_SYSTEM, extraction_input, max_tokens=2048)
    except Exception as e:
        logger.warning("candidate_gen LLM failed (%s) — proceeding with empty pool", e)
        raw = []

    if isinstance(raw, dict):
        raw = raw.get("candidates", raw.get("items", []))
    candidates = raw if isinstance(raw, list) else []

    return {
        "candidates": candidates,
        "current_node": "ranker",
        "stage_label": "Personalising your plan",
        "error": None,
    }


def ranker(state: TripSathiState) -> dict:
    """Score candidates against the user's taste profile via Voyage/Cohere rerank."""
    candidates = state.get("candidates") or []
    if not candidates:
        return {
            "ranked_candidates": [],
            "current_node": "plan_assembly",
            "stage_label": "Generating your itinerary",
            "error": None,
        }

    candidates = _filter_candidates(candidates, state.get("taste_profile"), state.get("user_profile"))
    query = _build_taste_query(
        state.get("taste_profile"),
        state.get("user_profile"),
        state["trip_parameters"],
    )
    docs = [_candidate_to_doc(c) for c in candidates]
    scored = _rerank(query, docs, top_k=min(len(docs), 30))

    ranked = []
    for idx, score in scored:
        if idx < len(candidates):
            item = dict(candidates[idx])
            item["match_score"] = round(float(score), 4)
            ranked.append(item)

    logger.info(
        "ranker destination=%s candidates=%d ranked=%d top=%r",
        state["destination"], len(candidates), len(ranked),
        ranked[0]["name"] if ranked else "—",
    )
    return {
        "ranked_candidates": ranked,
        "current_node": "plan_assembly",
        "stage_label": "Generating your itinerary",
        "error": None,
    }


def get_clarify_questions(user_id: str, destination: str) -> list[str]:
    """Generate 1-2 adaptive clarifying questions based on the user's taste profile confidence gaps.
    Returns [] if no questions are needed (profile already confident or no profile yet and we want
    to stay friction-free)."""
    from taste import load_taste

    profile = load_taste(user_id) if user_id else None

    if profile is None:
        # No profile — ask one open-ended orientation question to seed the taste model
        return [f"Tell me about a past trip you loved — what made it special for you?"]

    low_conf = {k: v for k, v in profile.confidence.items() if v < 0.5}
    if not low_conf:
        return []  # all dimensions already confident — skip clarify

    prompt = (
        f"Destination: {destination}\n"
        f"Low-confidence taste dimensions (need clarification): {list(low_conf.keys())}\n"
        f"Taste profile:\n"
        f"  pace: {profile.pace}/5 (confidence {profile.confidence.get('pace', 0):.1f})\n"
        f"  crowd_tolerance: {profile.crowd_tolerance}/5 (confidence {profile.confidence.get('crowd_tolerance', 0):.1f})\n"
        f"  food_adventurousness: {profile.food_adventurousness}/5 (confidence {profile.confidence.get('food_adventurousness', 0):.1f})\n"
        f"  immersion_style: {profile.immersion_style}/5 (confidence {profile.confidence.get('immersion_style', 0):.1f})\n"
        f"  walking_tolerance: {profile.walking_tolerance}/5 (confidence {profile.confidence.get('walking_tolerance', 0):.1f})\n"
        f"  interests top: {sorted(profile.interests.items(), key=lambda x: -x[1])[:3]}"
    )
    try:
        result = _call_llm(CLARIFY_SYSTEM, prompt, max_tokens=1024)
        if isinstance(result, list):
            return [str(q) for q in result[:2] if q]
    except Exception:
        pass
    return []


def critic(state: TripSathiState) -> dict:
    """Red-team the assembled plan against the user's taste + constraints."""
    plan = state.get("plan")
    if not plan:
        return {"current_node": "human_feedback", "stage_label": "Review your plan", "error": None}

    critic_input = (
        f"Plan: {json.dumps(plan)}\n"
        f"User profile: {json.dumps(state.get('user_profile'))}\n"
        f"Taste profile: {json.dumps(state.get('taste_profile'))}\n"
        f"Trip parameters: {json.dumps(state['trip_parameters'])}\n"
        f"Seasonal context: {json.dumps((state.get('research_synthesis') or {}).get('seasonal_context', ''))}"
    )
    try:
        result = _call_llm(CRITIC_SYSTEM, critic_input, max_tokens=1024)
    except Exception as e:
        logger.warning("critic failed (%s) — passing through", e)
        return {"current_node": "human_feedback", "stage_label": "Review your plan", "error": None}

    issues = result.get("issues", []) if isinstance(result, dict) else []
    verdict = result.get("verdict", "pass") if isinstance(result, dict) else "pass"
    passes = state.get("critic_passes", 0) + 1

    if verdict == "fail" and issues and passes <= 2:
        correction = (
            "CRITIC REVIEW — fix ALL of the following before presenting to user:\n"
            + "\n".join(f"- {issue}" for issue in issues)
        )
        logger.info("critic pass=%d issues=%d — looping to plan_assembly", passes, len(issues))
        return {
            "critic_passes": passes,
            "user_feedback": correction,
            "current_node": "plan_assembly",
            "stage_label": "Refining your plan",
            "error": None,
        }

    if passes > 2:
        logger.info("critic max passes reached — proceeding to human_feedback")
    return {
        "critic_passes": passes,
        "user_feedback": None,
        "current_node": "human_feedback",
        "stage_label": "Review your plan",
        "error": None,
    }


def route_after_critic(state: TripSathiState) -> str:
    """Route after critic: loop to plan_assembly for fixes, or proceed to human_feedback."""
    return state.get("current_node", "human_feedback")


def _persist_taste_deltas(state: TripSathiState) -> None:
    """Extract taste signals from refinement history and merge into the stored TasteProfile."""
    user_id = state["trip_parameters"].get("user_id", "")
    refinements = state.get("refinement_history", [])
    if not user_id or not refinements:
        return

    from taste import load_taste, save_taste, merge_taste, TasteProfile

    refinement_text = "\n".join(f"- {r}" for r in refinements)
    try:
        deltas = _call_llm(TASTE_DELTA_SYSTEM, f"Refinements:\n{refinement_text}", max_tokens=512)
    except Exception as e:
        logger.warning("taste delta extraction failed: %s", e)
        return

    if not isinstance(deltas, dict) or not deltas:
        return

    profile = load_taste(user_id)
    if profile is None:
        profile = TasteProfile(user_id=user_id)

    updated = merge_taste(profile, deltas)
    save_taste(updated)
    logger.info(
        "taste deltas persisted user_id=%s refinements=%d deltas_keys=%s",
        user_id, len(refinements), list(deltas.keys()),
    )

    try:
        from memory import write_memory
        taste_summary = f"Trip to {state.get('destination', '')}: refined {len(refinements)} times. Signals: {list(deltas.keys())}"
        write_memory(user_id, taste_summary)
    except Exception:
        pass


def route_after_feedback(state: TripSathiState) -> str:
    """Route after human_feedback: loop to plan_assembly or finalize."""
    from langgraph.graph import END

    if state.get("regenerate_requested"):
        return "plan_assembly"

    feedback = state.get("user_feedback", "")
    if feedback and feedback.lower().strip() in APPROVAL_SIGNALS:
        return "finalize"

    if feedback:
        return "plan_assembly"

    return END
