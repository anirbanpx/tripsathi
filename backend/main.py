import logging
import os
from dataclasses import asdict
from uuid import uuid4

from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s — %(message)s")
import asyncio
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from langgraph.types import Command

load_dotenv()

if os.getenv("PHOENIX_ENABLED") == "true":
    try:
        from phoenix.otel import register
        from openinference.instrumentation.langchain import LangChainInstrumentor
        from openinference.instrumentation.llama_index import LlamaIndexInstrumentor
        from openinference.instrumentation.openai import OpenAIInstrumentor
        _phoenix_kwargs = dict(
            project_name="tripsathi",
            endpoint=os.getenv("PHOENIX_COLLECTOR_ENDPOINT", "http://localhost:6006/v1/traces"),
        )
        if os.getenv("PHOENIX_API_KEY"):
            _phoenix_kwargs["headers"] = {"api_key": os.getenv("PHOENIX_API_KEY")}
        register(**_phoenix_kwargs)
        LangChainInstrumentor().instrument()
        LlamaIndexInstrumentor().instrument()
        OpenAIInstrumentor().instrument()
    except ImportError:
        pass

if not os.getenv("LLM_API_KEY"):
    raise RuntimeError("LLM_API_KEY not set in .env.")

from graph import graph  # noqa: E402 — import after env check

app = FastAPI(title="TripSathi API")

_cors_origins = ["http://localhost:5173", "http://localhost:5174"]
_frontend_url = os.getenv("FRONTEND_URL")
if _frontend_url:
    _cors_origins.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ────────────────────────────────────────────────

class ParseRequest(BaseModel):
    text: str


class OnboardRequest(BaseModel):
    onboarding_answers: list[dict] = []
    destination_hint: str = ""
    taste_data: dict = {}
    user_id: str = ""


class PlanRequest(BaseModel):
    destination: str
    trip_parameters: dict  # {duration_nights, budget_total, travel_dates, group_size}
    onboarding_answers: list[dict]
    traveler_notes: str = ""  # verbatim NL input; empty string when stepper mode


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


def _build_initial_state(req: PlanRequest) -> dict:
    return {
        "destination": req.destination,
        "trip_parameters": req.trip_parameters,
        "onboarding_answers": req.onboarding_answers,
        "traveler_notes": req.traveler_notes or None,
        "taste_profile": None,
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
    """Classify user persona from onboarding answers and persist taste profile."""
    from taste import TasteProfile, save_taste

    user_id = req.user_id.strip() if req.user_id.strip() else f"anon_{uuid4().hex[:12]}"

    user_profile = None
    if req.onboarding_answers:
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

    taste_profile_dict = None
    if req.taste_data:
        profile_data = {"user_id": user_id, **req.taste_data}
        profile = TasteProfile(**{
            k: v for k, v in profile_data.items()
            if k in TasteProfile.__dataclass_fields__
        })
        save_taste(profile)
        taste_profile_dict = asdict(profile)

    return {
        "user_id": user_id,
        "user_profile": user_profile,
        "taste_profile": taste_profile_dict,
    }


@app.get("/api/taste/{user_id}")
async def get_taste(user_id: str):
    """Return the stored taste profile for a user (404 if not found)."""
    from taste import load_taste

    profile = load_taste(user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Taste profile not found")
    return asdict(profile)


@app.get("/api/clarify/questions")
async def clarify_questions(user_id: str = "", destination: str = ""):
    """Return 1-2 adaptive clarifying questions based on the user's taste profile gaps."""
    from nodes import get_clarify_questions
    questions = get_clarify_questions(user_id, destination)
    return {"questions": questions}


@app.post("/api/plan")
async def start_plan(req: PlanRequest):
    """Start a new planning session. Runs the full pipeline and interrupts at plan review."""
    thread_id = str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    graph.invoke(_build_initial_state(req), config=config)
    state = _get_state(config)
    return _plan_response(state, thread_id)


@app.post("/api/plan/stream")
async def stream_plan(req: PlanRequest):
    """SSE stream for plan generation — emits stage labels as nodes complete, then the final plan."""
    thread_id = str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    async def generate():
        yield f"data: {json.dumps({'type': 'thread_id', 'thread_id': thread_id})}\n\n"
        try:
            async for chunk in graph.astream(_build_initial_state(req), config=config, stream_mode="updates"):
                for _node, update in chunk.items():
                    stage = update.get("stage_label")
                    if stage:
                        yield f"data: {json.dumps({'type': 'stage', 'stage_label': stage})}\n\n"
                        await asyncio.sleep(0)
        except Exception:
            pass  # graph interrupted at human_feedback — read final state below

        state = _get_state(config)
        if state.get("error"):
            yield f"data: {json.dumps({'type': 'error', 'detail': state['error']})}\n\n"
        else:
            yield f"data: {json.dumps({'type': 'done', 'plan': state.get('plan'), 'thread_id': thread_id, 'stage_label': state.get('stage_label', ''), 'refinement_count': state.get('refinement_count', 0)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
