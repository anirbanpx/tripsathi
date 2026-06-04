from typing import TypedDict, Optional


class TripSathiState(TypedDict):
    # Input-only (set by FastAPI, never mutated by nodes)
    destination: str
    trip_parameters: dict           # {duration_nights, budget_total, travel_dates, group_size}
    onboarding_answers: list[dict]  # [{question, answer}, ...]

    # Agent-owned (written progressively by nodes)
    user_profile: Optional[dict]        # written by persona_classification
    research_synthesis: Optional[dict]  # written by destination_intelligence
    plan: Optional[dict]                # updated by plan_assembly each iteration

    # HITL refinement state
    user_feedback: Optional[str]        # latest change request; None after each refine
    refinement_count: int               # increments each plan generation
    refinement_history: list[str]       # all feedback messages in session
    regenerate_requested: bool          # True when user taps "Regenerate"

    # Personalization
    taste_profile: Optional[dict]       # serialised TasteProfile; None if not loaded
    traveler_notes: Optional[str]       # verbatim NL input from user; None if stepper mode
    candidates: Optional[list]          # raw candidate pool from candidate_gen
    ranked_candidates: Optional[list]   # taste-scored pool from ranker

    # Critic loop control
    critic_passes: int                  # increments each critic pass; caps at 2

    # Control/meta
    awaiting_feedback: bool
    current_node: str                   # internal id
    stage_label: str                    # human-readable label for React
    error: Optional[str]

    # Observability
    session_tokens: int                 # cumulative tokens across all LLM calls this session
