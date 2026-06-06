import functools
import json
import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from openai import OpenAI, RateLimitError, APIStatusError, BadRequestError
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

_thread_tokens = threading.local()   # per-thread token accumulator
_COST_PER_1M = 0.90                  # blended $/1M tokens (Groq gpt-oss-120b approx)

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


@dataclass
class _Provider:
    name: str
    client: OpenAI
    model: str


@dataclass
class _GeminiProvider:
    name: str
    api_key: str
    model: str


def _build_provider(name, base_env, key_env, model_env, base_default, model_default):
    key = os.environ.get(key_env)
    if not key:
        return None
    return _Provider(
        name=name,
        client=OpenAI(
            base_url=os.environ.get(base_env, base_default),
            api_key=key,
            max_retries=0,
        ),
        model=os.environ.get(model_env, model_default),
    )


def _build_gemini_provider():
    key = os.environ.get("FALLBACK2_LLM_API_KEY")
    if not key:
        return None
    return _GeminiProvider(
        name="gemini",
        api_key=key,
        model=os.environ.get("FALLBACK2_LLM_MODEL", "gemini-2.5-flash-lite"),
    )


_DEFAULT_OPENROUTER_MODELS = (
    "meta-llama/llama-3.3-70b-instruct:free,"
    "google/gemma-4-31b-it:free,"
    "deepseek/deepseek-r1-0528:free,"
    "z-ai/glm-4.5-air:free,"
    "nvidia/nemotron-3-super-120b-a12b:free,"
    "qwen/qwen3-next-80b-a3b-instruct:free"
)


def _build_openrouter_providers() -> list[_Provider]:
    key = os.environ.get("FALLBACK3_LLM_API_KEY")
    if not key:
        return []
    base_url = os.environ.get("FALLBACK3_LLM_BASE_URL", "https://openrouter.ai/api/v1")
    models_str = os.environ.get("FALLBACK3_LLM_MODELS", _DEFAULT_OPENROUTER_MODELS)
    models = [m.strip() for m in models_str.split(",") if m.strip()]
    client = OpenAI(base_url=base_url, api_key=key, max_retries=0)
    return [_Provider(name=f"openrouter_{i}", client=client, model=model) for i, model in enumerate(models)]


_PROVIDERS: list = [p for p in [
    _build_provider("groq",     "LLM_BASE_URL",           "LLM_API_KEY",           "LLM_MODEL",
                    "http://localhost:1234/v1", "local-model"),
    _build_provider("cerebras", "FALLBACK1_LLM_BASE_URL",  "FALLBACK1_LLM_API_KEY", "FALLBACK1_LLM_MODEL",
                    "https://api.cerebras.ai/v1", "gpt-oss-120b"),
    _build_gemini_provider(),
] if p] + _build_openrouter_providers()

# session stickiness: provider name -> epoch time it becomes usable again
_disabled_until: dict[str, float] = {}

# Task-based provider ordering.
# synthesis/candidate_gen → Gemini-first (large context, generous free quota)
# plan/critic → gpt-oss-first (deliberate reasoning)
# gemini_only → Gemini exclusively
# default → Groq-first
_TASK_CHAINS: dict[str, list[str]] = {
    "synthesis":     ["openrouter", "groq", "cerebras", "gemini"],
    "candidate_gen": ["openrouter", "groq", "cerebras", "gemini"],
    "plan":          ["openrouter", "groq", "cerebras", "gemini"],
    "critic":        ["openrouter", "groq", "cerebras", "gemini"],
    "gemini_only":   ["openrouter", "gemini"],
    "default":       ["openrouter", "groq", "cerebras", "gemini"],
}


def _classify_error(e) -> str:
    if isinstance(e, RateLimitError):
        return "quota"
    if isinstance(e, APIStatusError) and e.status_code == 429:
        return "quota"
    if isinstance(e, APIStatusError) and e.status_code == 403:
        return "quota"  # permission denied / project blocked — skip provider, try next
    if isinstance(e, APIStatusError):
        msg = str(e).lower()
        if "rate_limit_exceeded" in msg or "tokens per day" in msg:
            return "quota"
        if "context" in msg or "too many tokens" in msg or "input is too long" in msg:
            return "context"
    if isinstance(e, BadRequestError):
        msg = str(e).lower()
        if "context" in msg or "too many tokens" in msg or "input is too long" in msg:
            return "context"
    return "other"


def _parse_cooldown(e) -> float:
    match = re.search(r"try again in (\d+(?:\.\d+)?)s", str(e), re.IGNORECASE)
    return float(match.group(1)) if match else 600.0


def _classify_gemini_error(e) -> str:
    msg = str(e).lower()
    if "429" in msg or "resource_exhausted" in msg or "quota" in msg or "rate" in msg:
        return "quota"
    if "403" in msg or "permission_denied" in msg or "access denied" in msg or "denied access" in msg:
        return "quota"
    if "too long" in msg or "context" in msg or "input token" in msg:
        return "context"
    return "other"


def _gemini_tokens(response) -> int:
    try:
        return response.usage_metadata.total_token_count or 0
    except Exception:
        return 0


def _openai_tools_to_gemini(tools: list) -> list:
    """Convert OpenAI tool schema → Gemini function_declarations list."""
    decls = []
    for t in tools:
        if t.get("type") != "function":
            continue
        fn = t["function"]
        decl: dict = {"name": fn["name"]}
        if fn.get("description"):
            decl["description"] = fn["description"]
        if fn.get("parameters"):
            decl["parameters"] = fn["parameters"]
        decls.append(decl)
    return [{"function_declarations": decls}] if decls else []


def _call_gemini_json(provider, system: str, user_message: str, max_tokens: int) -> dict | list | None:
    """Single Gemini call returning parsed JSON, with up to 3-attempt retry."""
    client = genai.Client(api_key=provider.api_key)
    for attempt in range(3):
        extra = (
            "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no prose, no code fences."
            if attempt > 0 else ""
        )
        if attempt > 0:
            time.sleep(8 * attempt)
        try:
            response = client.models.generate_content(
                model=provider.model,
                contents=user_message + extra,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    max_output_tokens=max_tokens,
                ),
            )
        except Exception as e:
            kind = _classify_gemini_error(e)
            if kind in ("quota", "context"):
                raise
            if attempt == 2:
                raise
            continue

        tokens = _gemini_tokens(response)
        _thread_tokens.count = getattr(_thread_tokens, "count", 0) + tokens
        logger.info("llm_call provider=gemini model=%s total_tokens=%d", provider.model, tokens)

        raw = (response.text or "").strip()
        if not raw:
            continue
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
                return None
            continue
    return None


def _call_gemini_with_tools(
    provider,
    system: str,
    user_message: str,
    tools: list,
    max_tokens: int,
    max_tool_rounds: int,
) -> dict | list | None:
    """Gemini multi-turn tool-calling loop."""
    from tools import execute_tool

    client = genai.Client(api_key=provider.api_key)
    gemini_tools = _openai_tools_to_gemini(tools) if tools else []

    contents: list = [user_message]
    tool_rounds = 0

    while True:
        active_tools = gemini_tools if tool_rounds < max_tool_rounds and gemini_tools else []
        response = client.models.generate_content(
            model=provider.model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=max_tokens,
                tools=active_tools or None,
            ),
        )

        tokens = _gemini_tokens(response)
        _thread_tokens.count = getattr(_thread_tokens, "count", 0) + tokens
        logger.info("llm_call provider=gemini model=%s total_tokens=%d", provider.model, tokens)

        fn_calls = getattr(response, "function_calls", None) or []

        if not fn_calls:
            raw = (response.text or "").strip()
            if not raw:
                return None
            if raw.startswith("```"):
                parts = raw.split("```")
                raw = parts[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return None

        contents.append(response.candidates[0].content)
        tool_results = []
        for fc in fn_calls:
            try:
                args = dict(fc.args) if fc.args else {}
            except Exception:
                args = {}
            result = execute_tool(fc.name, args)
            logger.info("tool_call name=%s result_len=%d", fc.name, len(result))
            tool_results.append(
                types.Part.from_function_response(name=fc.name, response={"result": result})
            )
        contents.append(types.Content(role="user", parts=tool_results))
        tool_rounds += 1


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


def _season_qualifier(start_date: str | None) -> str:
    """Derive a seasonal amenity hint from trip start date."""
    if not start_date:
        return ""
    try:
        month = int(str(start_date)[5:7])
    except (ValueError, IndexError):
        return ""
    if month in (3, 4, 5):   # Summer — heat is the main concern
        return "air conditioned with pool"
    if month in (6, 7, 8, 9):  # Monsoon — indoor comfort matters
        return "good indoor facilities covered"
    if month in (12, 1, 2):  # Winter — cold nights in hill stations
        return "heated rooms"
    return ""  # Oct-Nov: peak pleasant season, no special amenity need


def _build_place_search_queries(state) -> tuple[list[str], list[str]]:
    """Build 2-3 focused search_places queries per category from persona signals.

    Returns (hotel_queries, restaurant_queries). Each list has 1-3 short, targeted
    queries that cover different facets: core type/budget, location preference,
    group context or seasonal amenity. Shorter focused queries outperform one long
    compound string in Google Places text search.
    """
    destination = state["destination"]
    tp = state.get("trip_parameters") or {}
    up = (state.get("user_profile") or {}).get("constraints", {})
    taste = state.get("taste_profile") or {}

    budget = tp.get("budget_bracket") or up.get("budget_sensitivity") or "mid"
    kid_ages = _get_kid_ages(state)
    elderly = _get_elderly(state)
    mobility_limited = bool(up.get("mobility_limited"))
    dietary = up.get("dietary_restrictions") or tp.get("dietary_restrictions") or []
    trip_style = tp.get("trip_style") or []
    at = taste.get("accommodation_taste", 3)
    ct = taste.get("crowd_tolerance", 3)
    wt = taste.get("walking_tolerance", 3)

    # ── Derived signals ──────────────────────────────────────────────────────

    # Accommodation type
    if at <= 2:
        acc_type = "homestay guesthouse"
    elif at >= 4:
        acc_type = "resort"
    else:
        acc_type = "hotel"

    # Budget prefix
    budget_prefix = {"budget": "budget", "premium": "luxury", "mid": "mid-range"}.get(budget, "mid-range")
    # "luxury resort" not "luxury luxury resort"
    if budget == "premium" and at >= 4:
        budget_prefix = ""

    # Location signal — priority: mobility > hard_avoids > walking_tolerance > crowd_tolerance > trip_style
    hard_avoids_text = " ".join(taste.get("hard_avoids") or []).lower()
    if elderly or mobility_limited:
        location = "central accessible flat terrain"
    elif any(kw in hard_avoids_text for kw in ["noise", "noisy", "highway", "loud"]):
        location = "quiet peaceful away from noise"
    elif any(kw in hard_avoids_text for kw in ["crowded", "tourist crowd", "busy street"]):
        location = "away from tourist crowds"
    elif any(kw in hard_avoids_text for kw in ["city center", "city noise", "urban"]):
        location = "away from city center"
    elif wt <= 2:
        location = "walking distance to attractions"
    elif ct <= 2:
        location = "quiet secluded"
    elif ct >= 4:
        location = "city center"
    else:
        location = {"beaches": "beachfront", "nature": "near nature reserve",
                    "adventure": "near trekking", "religious": "near temple"}.get(
            next((s for s in trip_style if s in ("beaches", "nature", "adventure", "religious")), ""), ""
        )

    # Group context
    context = "family" if kid_ages else ("accessible" if (elderly or mobility_limited) else "")

    # Seasonal amenity
    season = _season_qualifier(tp.get("start_date"))

    # ── Hotel queries (up to 3, each covering a different facet) ────────────

    hotel_queries: list[str] = []

    # Q1: core — budget tier + property type (always)
    q1_parts = [p for p in [budget_prefix, acc_type, destination] if p]
    hotel_queries.append(" ".join(q1_parts))

    # Q2: location preference (skip if neutral/empty)
    if location:
        hotel_queries.append(f"{acc_type} {destination} {location}")

    # Q3: group context, then seasonal amenity as fallback — only if adds new info
    if context:
        hotel_queries.append(f"{context} {acc_type} {destination}")
    elif season:
        hotel_queries.append(f"{acc_type} {destination} {season}")

    # Deduplicate while preserving order
    seen: set[str] = set()
    hotel_queries = [q for q in hotel_queries if not (q in seen or seen.add(q))]  # type: ignore[func-returns-value]

    # ── Restaurant queries (up to 2) ─────────────────────────────────────────

    restaurant_queries: list[str] = []

    # Q1: dietary + destination (always)
    dietary_prefix = " ".join(dietary) if dietary else ""
    q1 = f"{dietary_prefix} restaurant {destination}".strip() if dietary_prefix else f"restaurant {destination}"
    restaurant_queries.append(q1)

    # Q2: context — family / fine dining / local food; monsoon → covered seating
    if kid_ages:
        restaurant_queries.append(f"family restaurant {destination}")
    elif budget == "premium":
        restaurant_queries.append(f"fine dining {destination}")
    elif budget == "budget":
        restaurant_queries.append(f"local street food {destination}")
    elif season and "covered" in season:
        restaurant_queries.append(f"indoor restaurant {destination}")

    seen = set()
    restaurant_queries = [q for q in restaurant_queries if not (q in seen or seen.add(q))]  # type: ignore[func-returns-value]

    return hotel_queries[:3], restaurant_queries[:2]


def _parallel_place_search(queries: list[str]) -> list[dict]:
    """Run multiple search_places queries in parallel and merge, deduplicating by name.

    Returns a list of {name, rating, address} dicts, ordered by first appearance
    (higher-priority queries go first so the plan LLM sees the best matches early).
    """
    from tools import search_places

    if not queries:
        return []

    with ThreadPoolExecutor(max_workers=len(queries)) as pool:
        raw_results = list(pool.map(search_places, queries))

    seen_names: set[str] = set()
    merged: list[dict] = []

    for raw in raw_results:
        if not isinstance(raw, str):
            continue
        # Skip error/empty responses from search_places
        if any(raw.startswith(prefix) for prefix in ("No places", "Places lookup failed", "Google Maps")):
            continue
        for line in raw.split("\n"):
            if not line.startswith("- "):
                continue
            parts = line[2:].split(" | ")
            name = parts[0].strip()
            if not name or name in seen_names:
                continue
            seen_names.add(name)
            # Parse "Rating: 4.2/5 (123 reviews)" → "4.2"
            rating = ""
            if len(parts) > 1:
                rating = parts[1].replace("Rating: ", "").split("/")[0].strip()
            address = parts[2].strip() if len(parts) > 2 else ""
            merged.append({"name": name, "rating": rating, "address": address})

    return merged


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


def _resolve_chain(task: str) -> list:
    """Expand task chain names → ordered provider list, with 'openrouter' fanned out to all openrouter_N entries."""
    chain = _TASK_CHAINS.get(task, _TASK_CHAINS["default"])
    provider_map = {p.name: p for p in _PROVIDERS}
    openrouter_providers = [p for p in _PROVIDERS if p.name.startswith("openrouter_")]
    result = []
    for name in chain:
        if name == "openrouter":
            result.extend(openrouter_providers)
        elif name in provider_map:
            result.append(provider_map[name])
    return result


def _call_llm(system: str, user_message: str, max_tokens: int = 4096, task: str = "default") -> dict | list:
    now = time.time()
    ordered = _resolve_chain(task)
    available = [p for p in ordered if _disabled_until.get(p.name, 0) <= now]
    if not available:
        raise RuntimeError("all LLM providers are currently rate-limited")

    for provider in available:
        if isinstance(provider, _GeminiProvider):
            try:
                result = _call_gemini_json(provider, system, user_message, max_tokens)
                if result is not None:
                    return result
            except Exception as e:
                kind = _classify_gemini_error(e)
                if kind == "quota":
                    _disabled_until[provider.name] = time.time() + 600.0
                    logger.warning("provider %s exhausted → failing over", provider.name)
                elif kind == "context":
                    logger.warning("provider %s context-length error → failing over", provider.name)
                else:
                    logger.warning("provider %s error → failing over: %s", provider.name, e)
            continue

        for attempt in range(3):
            extra_instruction = (
                "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no prose, no code fences."
                if attempt > 0
                else ""
            )
            if attempt > 0:
                time.sleep(8 * attempt)
            try:
                response = provider.client.chat.completions.create(
                    model=provider.model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user_message + extra_instruction},
                    ],
                    max_tokens=max_tokens,
                )
            except Exception as e:
                kind = _classify_error(e)
                if kind == "quota":
                    cooldown = _parse_cooldown(e)
                    _disabled_until[provider.name] = time.time() + cooldown
                    logger.warning("provider %s exhausted → failing over (cooldown %.0fs)", provider.name, cooldown)
                    break  # try next provider
                if kind == "context":
                    logger.warning("provider %s context-length error → failing over", provider.name)
                    break  # try next provider (don't disable — request-specific)
                if attempt == 2:
                    raise
                continue

            if response.usage:
                _thread_tokens.count = getattr(_thread_tokens, "count", 0) + response.usage.total_tokens
                logger.info(
                    "llm_call provider=%s model=%s prompt_tokens=%d completion_tokens=%d total_tokens=%d",
                    provider.name,
                    provider.model,
                    response.usage.prompt_tokens,
                    response.usage.completion_tokens,
                    response.usage.total_tokens,
                )
            raw = (response.choices[0].message.content or "").strip()
            if not raw:
                continue
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
                    break  # exhausted retries for this provider, try next
                continue

    raise RuntimeError("all LLM providers exhausted — no valid JSON response")


def _call_llm_with_tools(
    system: str,
    user_message: str,
    tools: list,
    max_tokens: int = 4096,
    task: str = "default",
    max_tool_rounds: int = 4,
) -> dict | list:
    """Like _call_llm but drives an OpenAI tool-call loop.
    Executes tools locally and feeds results back until the LLM returns plain content.
    Falls through to the next provider on any tool-calling error."""
    from tools import execute_tool

    now = time.time()
    ordered = _resolve_chain(task)
    available = [p for p in ordered if _disabled_until.get(p.name, 0) <= now]
    if not available:
        raise RuntimeError("all LLM providers are currently rate-limited")

    for provider in available:
        if isinstance(provider, _GeminiProvider):
            try:
                result = _call_gemini_with_tools(provider, system, user_message, tools, max_tokens, max_tool_rounds)
                if result is not None:
                    return result
            except Exception as e:
                kind = _classify_gemini_error(e)
                if kind == "quota":
                    _disabled_until[provider.name] = time.time() + 600.0
                    logger.warning("provider %s exhausted → failing over", provider.name)
                elif kind == "context":
                    logger.warning("provider %s context-length error → failing over", provider.name)
                else:
                    logger.warning("provider %s tool_call error → failing over: %s", provider.name, e)
            continue

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ]
        tool_rounds = 0

        while True:
            # On the final allowed round stop passing tools — force a content response
            active_tools = tools if tool_rounds < max_tool_rounds else None
            try:
                kwargs: dict = {"model": provider.model, "messages": messages, "max_tokens": max_tokens}
                if active_tools:
                    kwargs["tools"] = active_tools
                    kwargs["tool_choice"] = "auto"
                response = provider.client.chat.completions.create(**kwargs)
            except Exception as e:
                kind = _classify_error(e)
                if kind == "quota":
                    cooldown = _parse_cooldown(e)
                    _disabled_until[provider.name] = time.time() + cooldown
                    logger.warning("provider %s exhausted → failing over (cooldown %.0fs)", provider.name, cooldown)
                    break
                if kind == "context":
                    logger.warning("provider %s context-length error → failing over", provider.name)
                    break
                logger.warning("provider %s tool_call error → failing over: %s", provider.name, e)
                break

            if response.usage:
                _thread_tokens.count = getattr(_thread_tokens, "count", 0) + response.usage.total_tokens
                logger.info(
                    "llm_call provider=%s model=%s prompt_tokens=%d completion_tokens=%d total_tokens=%d",
                    provider.name, provider.model,
                    response.usage.prompt_tokens, response.usage.completion_tokens, response.usage.total_tokens,
                )

            msg = response.choices[0].message

            # No tool calls — this is the final answer
            if not msg.tool_calls:
                raw = (msg.content or "").strip()
                if not raw:
                    break
                if raw.startswith("```"):
                    parts = raw.split("```")
                    raw = parts[1]
                    if raw.startswith("json"):
                        raw = raw[4:]
                    raw = raw.strip()
                try:
                    return json.loads(raw)
                except json.JSONDecodeError:
                    break  # try next provider

            # Append assistant turn with tool_calls
            messages.append({
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in msg.tool_calls
                ],
            })

            # Execute each tool and append results
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    args = {}
                result = execute_tool(tc.function.name, args)
                logger.info("tool_call name=%s result_len=%d", tc.function.name, len(result))
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

            tool_rounds += 1

    raise RuntimeError("all LLM providers exhausted — no valid response from tool-calling agent")


def _drain_tokens() -> int:
    """Return tokens accumulated since last drain and reset the counter."""
    count = getattr(_thread_tokens, "count", 0)
    _thread_tokens.count = 0
    return count


def _timed_node(fn):
    """Decorator: log per-node elapsed time and token count; accumulate session_tokens in state."""
    @functools.wraps(fn)
    def _wrapper(state: TripSathiState) -> dict:
        t0 = time.perf_counter()
        result = fn(state)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        node_tokens = _drain_tokens()
        result["session_tokens"] = state.get("session_tokens", 0) + node_tokens
        logger.info("node=%s elapsed_ms=%.0f tokens=%d", fn.__name__, elapsed_ms, node_tokens)
        return result
    return _wrapper


@_timed_node
def persona_classification(state: TripSathiState) -> dict:
    _drain_tokens()  # reset any stale tokens from previous session on this thread
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
        user_profile = _call_llm(PERSONA_CLASSIFICATION_SYSTEM, answers_text, max_tokens=1024, task="default")
    except Exception as e:
        return {"error": f"persona_classification_failed: {e}", "current_node": "error"}

    return {
        "user_profile": user_profile,
        "current_node": "destination_intelligence",
        "stage_label": "Researching your destination",
        "error": None,
    }


@_timed_node
def destination_intelligence(state: TripSathiState) -> dict:
    from rag.indexer import get_query_engine

    # Call 2: expand queries
    expansion_prompt = (
        f"Destination: {state['destination']}\n"
        f"Traveller profile: {json.dumps(state['user_profile'])}\n"
        f"Trip: {json.dumps(state['trip_parameters'])}"
    )
    try:
        expanded_queries = _call_llm(QUERY_EXPANSION_SYSTEM, expansion_prompt, max_tokens=1024, task="default")
    except Exception as e:
        # Graceful degradation: LLM down → fall back to generic queries so RAG still runs
        logger.warning("query expansion failed (%s) — using fallback queries", e)
        _dest = state["destination"]
        expanded_queries = [
            f"{_dest} top attractions sightseeing",
            f"{_dest} local food restaurants",
            f"{_dest} travel tips safety warnings",
            f"{_dest} things to do activities itinerary",
        ]

    # LlamaIndex retrieval (local variable — not state)
    retrieved_content = []
    rag_failed = False
    query_engine = None
    dest_slug = state["destination"].lower().split(",")[0].strip().replace(" ", "_")
    try:
        query_engine = get_query_engine(destination=dest_slug)

        def _run_query(q: str) -> str:
            try:
                return str(query_engine.query(q)).strip()
            except Exception as _e:
                logger.warning("RAG sub-query failed q=%r: %s", q, _e)
                return ""

        with ThreadPoolExecutor(max_workers=min(len(expanded_queries), 7)) as _pool:
            retrieved_content = [t for t in _pool.map(_run_query, expanded_queries) if t]
    except Exception as e:
        logger.error("RAG query failed for destination=%s: %s", dest_slug, e)
        rag_failed = True  # Graceful degradation: proceed with empty corpus

    if not retrieved_content:
        rag_failed = True

    knowledge_block = (
        "\n\n---\n\n".join(retrieved_content)
        if retrieved_content
        else "No destination-specific content retrieved. Use your general knowledge and flag knowledge gaps in implicit_warnings."
    )

    # Call 3a: pre-fetch hotels + restaurants from Google Maps in parallel.
    # We do this ourselves rather than asking the synthesis LLM to call search_places,
    # so we control query quality and run all searches simultaneously.
    hotel_queries, restaurant_queries = _build_place_search_queries(state)
    logger.info(
        "place_search destination=%s hotel_queries=%r restaurant_queries=%r",
        state["destination"], hotel_queries, restaurant_queries,
    )
    with ThreadPoolExecutor(max_workers=2) as _places_pool:
        _hotel_future = _places_pool.submit(_parallel_place_search, hotel_queries)
        _rest_future = _places_pool.submit(_parallel_place_search, restaurant_queries)
        prefetched_hotels = _hotel_future.result()
        prefetched_restaurants = _rest_future.result()
    logger.info(
        "place_search_done destination=%s hotels=%d restaurants=%d",
        state["destination"], len(prefetched_hotels), len(prefetched_restaurants),
    )

    # Call 3b: synthesize via tool-calling agent.
    # Hotels/restaurants are already pre-fetched — LLM only needs weather + web search here.
    synthesis_prompt = (
        f"Destination: {state['destination']}\n"
        f"Traveller profile: {json.dumps(state['user_profile'])}\n"
        f"Trip parameters: {json.dumps(state['trip_parameters'])}\n"
        f"Retrieved knowledge (RAG):\n{knowledge_block}\n\n"
        f"MANDATORY tool use: call get_weather for current seasonal warnings, and web_search "
        f"for recent traveller reports or pricing not covered by the RAG content. "
        f"Do NOT call search_places for hotels or restaurants — those have already been fetched. "
        f"After all tool calls, produce the synthesis JSON."
    )
    try:
        from tools import TOOL_SCHEMAS
        research_synthesis = _call_llm_with_tools(
            RESEARCH_SYNTHESIS_SYSTEM, synthesis_prompt, tools=TOOL_SCHEMAS,
            max_tokens=4096, task="synthesis",
        )
    except Exception as e:
        logger.warning("tool-calling synthesis failed (%s) — falling back to plain synthesis", e)
        try:
            research_synthesis = _call_llm(RESEARCH_SYNTHESIS_SYSTEM, synthesis_prompt, max_tokens=4096, task="synthesis")
        except Exception as e2:
            return {"error": f"destination_intelligence_failed: {e2}", "current_node": "error"}

    if rag_failed:
        warnings = research_synthesis.get("implicit_warnings", [])
        warnings.insert(0, (
            "Local knowledge base returned no results for this destination — "
            "recommendations are based on general knowledge only. "
            "Verify local risks, pricing, and logistics independently before booking."
        ))
        research_synthesis["implicit_warnings"] = warnings

    # Retrieval quality gate: if synthesis returned < 2 local_risks, re-query with
    # targeted risk/scam/seasonal queries and supplement the synthesis.
    if len(research_synthesis.get("local_risks", [])) < 2 and query_engine is not None:
        _risk_queries = [
            f"scam tourist trap warning {state['destination']}",
            f"seasonal monsoon closure risk {state['destination']}",
            f"safety concern travel advisory {state['destination']}",
        ]
        _risk_content = []
        try:
            with ThreadPoolExecutor(max_workers=len(_risk_queries)) as _pool:
                _risk_content = [
                    t for t in _pool.map(lambda q: str(query_engine.query(q)).strip(), _risk_queries) if t
                ]
        except Exception as e:
            logger.warning("retrieval quality gate query failed: %s", e)

        if _risk_content:
            _risk_gate_system = (
                "You are a travel safety analyst. Extract local risks, scams, and seasonal warnings "
                "from the retrieved content below. Return ONLY valid JSON: "
                "{\"local_risks\": [\"...\"], \"implicit_warnings\": [\"...\"]}"
            )
            _risk_prompt = (
                f"Destination: {state['destination']}\n"
                f"Traveller profile: {json.dumps(state['user_profile'])}\n"
                f"Existing risks already identified (do NOT repeat these): "
                f"{json.dumps(research_synthesis.get('local_risks', []))}\n"
                f"Retrieved content:\n" + "\n\n---\n\n".join(_risk_content)
            )
            try:
                _supplement = _call_llm(_risk_gate_system, _risk_prompt, max_tokens=1024, task="synthesis")
                if isinstance(_supplement, dict):
                    _existing = research_synthesis.get("local_risks", [])
                    _new_risks = [r for r in _supplement.get("local_risks", []) if r not in _existing]
                    _existing_warn = research_synthesis.get("implicit_warnings", [])
                    _new_warn = [w for w in _supplement.get("implicit_warnings", []) if w not in _existing_warn]
                    research_synthesis["local_risks"] = _existing + _new_risks
                    research_synthesis["implicit_warnings"] = _existing_warn + _new_warn
                    logger.info(
                        "retrieval_quality_gate destination=%s added_risks=%d added_warnings=%d",
                        state["destination"], len(_new_risks), len(_new_warn),
                    )
            except Exception as e:
                logger.warning("retrieval quality gate synthesis failed: %s", e)

    return {
        "research_synthesis": research_synthesis,
        "prefetched_hotels": prefetched_hotels,
        "prefetched_restaurants": prefetched_restaurants,
        "current_node": "plan_assembly",
        "stage_label": "Generating your itinerary",
        "error": None,
    }


@_timed_node
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
            new_plan = _call_llm(PLAN_REGENERATE_SYSTEM, regen_prompt, task="plan")
        except Exception as e:
            logger.warning("plan_assembly regeneration failed (%s) — retrying with reduced budget", e)
            try:
                new_plan = _call_llm(PLAN_REGENERATE_SYSTEM, regen_prompt, max_tokens=2048, task="plan")
            except Exception as e2:
                return {"error": f"plan_assembly_failed: {e2}", "current_node": "error"}
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
            updated_plan = _call_llm(PLAN_REFINEMENT_SYSTEM, refinement_prompt, task="plan")
        except Exception as e:
            logger.warning("plan_assembly refinement failed (%s) — retrying with reduced budget", e)
            retry_history = state.get("refinement_history", [])[-1:]
            retry_refinement_prompt = (
                f"Current plan: {json.dumps(state.get('plan'))}\n"
                f"User change request: {feedback}\n"
                f"Previous changes: {json.dumps(retry_history)}\n"
                f"User profile: {json.dumps(state.get('user_profile'))}\n"
                f"Trip parameters: {json.dumps(state['trip_parameters'])}"
                + (f"\nRAG risks — preserve verbatim in refined plan: {json.dumps(rag_risks)}" if rag_risks else "")
            )
            try:
                updated_plan = _call_llm(PLAN_REFINEMENT_SYSTEM, retry_refinement_prompt, max_tokens=2048, task="plan")
            except Exception as e2:
                # Non-fatal: keep current plan, surface error as warning
                return {
                    "user_feedback": None,
                    "error": f"refinement_failed: {e2}",
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
        ranked_block = "\n\nRANKED CANDIDATES (pre-scored against traveller taste — use as your primary selection pool):"
        if activities:
            ranked_block += f"\nActivities/experiences:\n{_fmt(activities, 12)}"
        ranked_block += "\nPrioritise higher-scored items. Include a lower-scored item only if logistically essential."

    # Verified places block — pre-fetched from Google Maps in parallel during destination_intelligence.
    # These are live data and must take precedence over LLM training knowledge.
    search_hotels = state.get("prefetched_hotels") or []
    search_restaurants = state.get("prefetched_restaurants") or []
    verified_block = ""
    if search_hotels:
        hotel_lines = "\n".join(
            f"  - {h['name']} | {h.get('rating', '?')}/5 | {h.get('address', '')}"
            for h in search_hotels
        )
        verified_block += (
            f"\n\nVERIFIED HOTELS from Google Maps (use ONLY these names in the hotels array — "
            f"do NOT invent hotel names from training knowledge):\n{hotel_lines}"
        )
    if search_restaurants:
        rest_lines = "\n".join(
            f"  - {r['name']} | {r.get('rating', '?')}/5 | {r.get('address', '')}"
            for r in search_restaurants
        )
        verified_block += (
            f"\n\nVERIFIED RESTAURANTS from Google Maps (prefer these names for meal recommendations — "
            f"do NOT invent restaurant names from training knowledge):\n{rest_lines}"
        )

    generation_prompt = (
        f"Destination: {state['destination']}\n"
        f"User profile: {json.dumps(state.get('user_profile'))}\n"
        f"Trip parameters: {json.dumps(state['trip_parameters'])}"
        f"{notes_block}"
        f"{req_block}"
        f"{toddler_block}"
        f"{ranked_block}"
        f"{verified_block}"
        f"\nResearch: {json.dumps(state.get('research_synthesis'))}"
        f"\n\nHOTEL REQUIREMENT (non-negotiable): the hotels array MUST contain at least 3 entries. "
        f"Use hotels from the VERIFIED HOTELS list above. If that list has fewer than 3 entries, "
        f"supplement with general knowledge to reach 3–5 hotels spanning budget tiers."
    )
    try:
        plan = _call_llm(PLAN_GENERATION_SYSTEM, generation_prompt, task="plan")
    except Exception as e:
        logger.warning("plan_assembly initial generation failed (%s) — retrying with reduced budget", e)
        _synth = state.get("research_synthesis") or {}
        _slim_synth = {
            "local_risks": _synth.get("local_risks", []),
            "routing": _synth.get("routing", ""),
        }
        retry_generation_prompt = (
            f"Destination: {state['destination']}\n"
            f"User profile: {json.dumps(state.get('user_profile'))}\n"
            f"Trip parameters: {json.dumps(state['trip_parameters'])}"
            f"{notes_block}"
            f"{req_block}"
            f"{toddler_block}"
            f"{ranked_block}"
            f"\nResearch (condensed): {json.dumps(_slim_synth)}"
        )
        try:
            plan = _call_llm(PLAN_GENERATION_SYSTEM, retry_generation_prompt, max_tokens=2048, task="plan")
        except Exception as e2:
            return {"error": f"plan_assembly_failed: {e2}", "current_node": "error"}
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
    """Mark plan as done, persist taste deltas, and log session cost."""
    t0 = time.perf_counter()
    _persist_taste_deltas(state)
    node_tokens = _drain_tokens()
    total_tokens = state.get("session_tokens", 0) + node_tokens
    elapsed_ms = (time.perf_counter() - t0) * 1000
    cost_usd = total_tokens * _COST_PER_1M / 1_000_000
    logger.info(
        "node=finalize elapsed_ms=%.0f tokens=%d | session destination=%s "
        "total_tokens=%d estimated_cost_usd=%.4f estimated_cost_inr=%.2f",
        elapsed_ms, node_tokens,
        state.get("destination", "?"), total_tokens, cost_usd, cost_usd * 84,
    )
    return {
        "session_tokens": total_tokens,
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


@_timed_node
def candidate_gen(state: TripSathiState) -> dict:
    """Extract a structured item pool from research_synthesis using the LLM."""
    synthesis = state.get("research_synthesis") or {}
    extraction_input = (
        f"Destination: {state['destination']}\n"
        f"User profile: {json.dumps(state.get('user_profile'))}\n"
        f"Trip parameters: {json.dumps(state['trip_parameters'])}\n"
        f"Key places: {json.dumps(synthesis.get('key_places', []))}\n"
        f"Routing: {synthesis.get('routing', '')}\n"
        f"Seasonal context: {synthesis.get('seasonal_context', '')}"
    )
    try:
        # 4096 (not 2048): the prompt asks for 15-25 items × ~10 fields each,
        # which overflows a 2048 cap and truncates the JSON mid-string. Retries
        # can't recover a hard length cap, so the pool ended up empty.
        raw = _call_llm(CANDIDATE_GEN_SYSTEM, extraction_input, max_tokens=4096, task="candidate_gen")
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


@_timed_node
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
        result = _call_llm(CLARIFY_SYSTEM, prompt, max_tokens=1024, task="default")
        if isinstance(result, list):
            return [str(q) for q in result[:2] if q]
    except Exception:
        pass
    return []


@_timed_node
def critic(state: TripSathiState) -> dict:
    """Red-team the assembled plan against the user's taste + constraints."""
    plan = state.get("plan")
    if not plan:
        return {"current_node": "human_feedback", "stage_label": "Review your plan", "error": None}

    critic_input = (
        f"User profile: {json.dumps(state.get('user_profile'))}\n"
        f"Taste profile: {json.dumps(state.get('taste_profile'))}\n"
        f"Trip parameters: {json.dumps(state['trip_parameters'])}\n"
        f"Seasonal context: {json.dumps((state.get('research_synthesis') or {}).get('seasonal_context', ''))}\n"
        f"Plan: {json.dumps(plan)}"
    )
    try:
        result = _call_llm(CRITIC_SYSTEM, critic_input, max_tokens=1024, task="critic")
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
        deltas = _call_llm(TASTE_DELTA_SYSTEM, f"Refinements:\n{refinement_text}", max_tokens=512, task="default")
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


def error_node(state: TripSathiState) -> dict:
    raw = state.get("error", "")
    logger.error("graph_error node=%s error=%s", state.get("current_node"), raw)
    if "rate-limited" in raw or "quota" in raw.lower():
        friendly = "All AI providers are temporarily at capacity. Please wait a minute and try again."
    elif "exhausted" in raw:
        friendly = "Could not generate a valid response after multiple attempts. Please try again."
    elif raw:
        friendly = f"Planning failed: {raw}"
    else:
        friendly = "An unexpected error occurred. Please try again."
    return {
        "error": friendly,
        "stage_label": "Planning could not complete",
        "awaiting_feedback": False,
    }


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
