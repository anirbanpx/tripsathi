import os
from uuid import uuid4
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langgraph.types import Command

load_dotenv()

if not os.getenv("LLM_API_KEY"):
    raise RuntimeError("LLM_API_KEY not set in .env.")

from graph import graph  # noqa: E402 — import after env check

app = FastAPI(title="TripSathi API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)



# ── Request / Response models ────────────────────────────────────────────────

class ParseRequest(BaseModel):
    text: str


class OnboardRequest(BaseModel):
    onboarding_answers: list[dict]
    destination_hint: str = ""


class PlanRequest(BaseModel):
    destination: str
    trip_parameters: dict  # {duration_nights, budget_total, travel_dates, group_size}
    onboarding_answers: list[dict]


class RefineRequest(BaseModel):
    thread_id: str
    user_feedback: str


class RegenerateRequest(BaseModel):
    thread_id: str


class BookRequest(BaseModel):
    user_id: str
    item: dict  # {item_type, name, location, approx_cost, check_in?, check_out?}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_state(config: dict) -> dict:
    snapshot = graph.get_state(config)
    return snapshot.values if snapshot else {}


def _plan_response(state: dict, thread_id: str) -> dict:
    if state.get("error"):
        raise HTTPException(status_code=500, detail=state["error"])
    return {
        "plan": state.get("plan"),
        "thread_id": thread_id,
        "status": "done" if not state.get("awaiting_feedback", True) else "awaiting_feedback",
        "stage_label": state.get("stage_label"),
        "refinement_count": state.get("refinement_count", 0),
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/api/parse")
async def parse_intent(req: ParseRequest):
    """Extract structured trip parameters from a natural language description."""
    from nodes import _call_llm
    from prompts import INTENT_PARSE_SYSTEM
    try:
        parsed = _call_llm(INTENT_PARSE_SYSTEM, req.text, max_tokens=512)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"parse_failed: {e}")
    return parsed


@app.post("/api/onboard")
async def onboard(req: OnboardRequest):
    """Classify user persona from onboarding answers only (no full graph run)."""
    from nodes import _call_llm
    from prompts import PERSONA_CLASSIFICATION_SYSTEM

    answers_text = "\n".join(
        f"Q: {a['question']}\nA: {a['answer']}" for a in req.onboarding_answers
    )
    if req.destination_hint:
        answers_text += f"\nDestination hint: {req.destination_hint}"

    try:
        user_profile = _call_llm(PERSONA_CLASSIFICATION_SYSTEM, answers_text, max_tokens=1024)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"persona_classification_failed: {e}")

    return {"user_profile": user_profile}


@app.post("/api/plan")
async def start_plan(req: PlanRequest):
    """Start a new planning session. Runs the full pipeline and interrupts at plan review."""
    thread_id = str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    initial_state = {
        "destination": req.destination,
        "trip_parameters": req.trip_parameters,
        "onboarding_answers": req.onboarding_answers,
        "user_profile": None,
        "research_synthesis": None,
        "plan": None,
        "user_feedback": None,
        "refinement_count": 0,
        "refinement_history": [],
        "regenerate_requested": False,
        "awaiting_feedback": False,
        "current_node": "persona_classification",
        "stage_label": "Understanding your profile",
        "error": None,
    }

    graph.invoke(initial_state, config=config)
    state = _get_state(config)
    return _plan_response(state, thread_id)


@app.post("/api/refine")
async def refine_plan(req: RefineRequest):
    """Continue a planning session with user feedback or approval."""
    config = {"configurable": {"thread_id": req.thread_id}}

    try:
        graph.invoke(Command(resume=req.user_feedback), config=config)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Session not found or expired: {e}")

    state = _get_state(config)
    return _plan_response(state, req.thread_id)


@app.post("/api/regenerate")
async def regenerate_plan(req: RegenerateRequest):
    """Regenerate a notably different plan without specific feedback."""
    config = {"configurable": {"thread_id": req.thread_id}}

    try:
        graph.invoke(Command(resume={"regenerate": True}), config=config)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Session not found or expired: {e}")

    state = _get_state(config)
    return _plan_response(state, req.thread_id)


@app.post("/api/book")
async def book_item(req: BookRequest):
    """Sprint 2: mock booking confirmation. Sprint 3: integrate OTA partner API."""
    confirmation_id = f"TRP-DEMO-{str(uuid4())[:8].upper()}"
    return {
        "confirmation_id": confirmation_id,
        "status": "confirmed",
        "provider": "Booking.com (DEMO)",
        "item_name": req.item.get("name"),
        "amount_charged": req.item.get("approx_cost", 0),
        "check_in": req.item.get("check_in"),
        "check_out": req.item.get("check_out"),
        "is_demo": True,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
