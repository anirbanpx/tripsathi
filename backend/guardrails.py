"""Two-tier input safety guard for raw free-text user input (onboarding answers,
refinement requests).

Tier 1 — regex/keyword checks, no LLM call, costs nothing: catches obvious
prompt-injection phrasing and a short banned-topic list.
Tier 2 — only runs if tier 1 passes: Llama Guard via Groq classifies anything
the regex layer doesn't catch (nuanced jailbreaks, hate speech, self-harm, etc).
"""
import logging
import os
import re

from openai import OpenAI

logger = logging.getLogger(__name__)

_INJECTION_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r"ignore (all |any )?(previous|prior|above) instructions",
        r"disregard (all |any )?(previous|prior|above) instructions",
        r"reveal (your|the) (system )?prompt",
        r"you are now (in )?(dan|jailbreak|unrestricted)",
        r"act as (an?|the) unrestricted",
        r"\bjailbreak\b",
        r"\bDAN mode\b",
        r"forget (everything|all)( you('ve| have))? (been told|learned)",
    ]
]

_BANNED_KEYWORDS = [
    "bomb", "explosive device", "make a weapon", "child sexual",
    "suicide method", "synthesize drugs", "credit card dump",
]

_GUARD_MODEL = os.environ.get("GUARDRAILS_MODEL", "openai/gpt-oss-safeguard-20b")
_GUARD_POLICY = (
    "You are a content safety classifier for a travel-planning chat assistant.\n"
    "Classify the user message below as SAFE or UNSAFE.\n"
    "UNSAFE categories: violent content, instructions for illegal activity or weapons,\n"
    "sexual content involving minors, self-harm encouragement, hate speech, csam.\n"
    'Respond with exactly one line: either "SAFE" or "UNSAFE: <category>".'
)
_client: OpenAI | None = None
_client_built = False


def _get_client() -> OpenAI | None:
    global _client, _client_built
    if _client_built:
        return _client
    _client_built = True
    key = os.environ.get("LLM_API_KEY")
    if key:
        _client = OpenAI(base_url=os.environ.get("LLM_BASE_URL"), api_key=key, max_retries=0)
    return _client


def _tier1_check(text: str) -> str | None:
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(text):
            return f"prompt_injection_pattern: {pattern.pattern}"
    lowered = text.lower()
    for kw in _BANNED_KEYWORDS:
        if kw in lowered:
            return f"banned_topic: {kw}"
    return None


def _tier2_check(text: str) -> str | None:
    client = _get_client()
    if client is None:
        return None
    try:
        response = client.chat.completions.create(
            model=_GUARD_MODEL,
            messages=[
                {"role": "system", "content": _GUARD_POLICY},
                {"role": "user", "content": text},
            ],
            # gpt-oss-safeguard is a reasoning model — needs >=1024 or returns
            # an empty string (same gotcha as the main gpt-oss-120b model).
            max_tokens=1024,
        )
        verdict = (response.choices[0].message.content or "").strip()
        if verdict.upper().startswith("UNSAFE"):
            return f"safety_classifier: {verdict}"
        return None
    except Exception as e:
        # Fail open — a moderation-call hiccup shouldn't block a legitimate user.
        # Tier 1 has already screened for the obvious cases.
        logger.warning("safety_classifier_check_failed — failing open: %s", e)
        return None


def check_input_safety(text: str) -> tuple[bool, str | None]:
    """Two-tier safety check on raw free-text user input.

    Returns (is_safe, reason). Tier 1 (regex) is free and runs first; only
    text that clears it goes to tier 2 (Llama Guard via Groq).
    """
    if not text or not text.strip():
        return True, None

    reason = _tier1_check(text)
    if reason:
        logger.warning("input_blocked tier=1 reason=%s", reason)
        return False, reason

    reason = _tier2_check(text)
    if reason:
        logger.warning("input_blocked tier=2 reason=%s", reason)
        return False, reason

    return True, None
