import logging
import os
import sqlite3
import time
from contextlib import asynccontextmanager
from dataclasses import asdict
from uuid import uuid4

from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s — %(message)s")
import asyncio
import json
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from langgraph.types import Command

load_dotenv()

from auth import get_current_user  # noqa: E402 — import after load_dotenv so env vars are set

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

_logger = logging.getLogger(__name__)
_CHECKPOINTS_DB = "checkpoints.db"
_SESSION_TTL_SECONDS = 86400  # 24 hours


def _init_thread_registry() -> None:
    conn = sqlite3.connect(_CHECKPOINTS_DB)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS thread_registry "
        "(thread_id TEXT PRIMARY KEY, created_at REAL NOT NULL)"
    )
    conn.commit()
    conn.close()


def _register_thread(thread_id: str) -> None:
    try:
        conn = sqlite3.connect(_CHECKPOINTS_DB)
        conn.execute(
            "INSERT OR IGNORE INTO thread_registry (thread_id, created_at) VALUES (?, ?)",
            (thread_id, time.time()),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        _logger.warning("thread_registry insert failed: %s", e)


def _cleanup_expired_threads() -> None:
    cutoff = time.time() - _SESSION_TTL_SECONDS
    try:
        conn = sqlite3.connect(_CHECKPOINTS_DB)
        cur = conn.cursor()
        cur.execute("SELECT thread_id FROM thread_registry WHERE created_at < ?", (cutoff,))
        expired = [row[0] for row in cur.fetchall()]
        for tid in expired:
            cur.execute("DELETE FROM checkpoints WHERE thread_id = ?", (tid,))
            cur.execute("DELETE FROM writes WHERE thread_id = ?", (tid,))
            cur.execute("DELETE FROM thread_registry WHERE thread_id = ?", (tid,))
        conn.commit()
        conn.close()
        if expired:
            _logger.info("ttl_cleanup expired_threads=%d", len(expired))
    except Exception as e:
        _logger.warning("ttl_cleanup failed: %s", e)


async def _cleanup_loop() -> None:
    while True:
        await asyncio.sleep(3600)  # run hourly
        _cleanup_expired_threads()


@asynccontextmanager
async def _lifespan(app: FastAPI):
    _init_thread_registry()
    _cleanup_expired_threads()  # clean up any lingering sessions on startup
    from saves import _ensure_saves_db
    _ensure_saves_db()
    task = asyncio.create_task(_cleanup_loop())
    yield
    task.cancel()


app = FastAPI(title="TripSathi API", lifespan=_lifespan)

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
    trip_parameters: dict
    onboarding_answers: list[dict]
    traveler_notes: str = ""


class RefineRequest(BaseModel):
    thread_id: str
    user_feedback: str


class RegenerateRequest(BaseModel):
    thread_id: str


class BookRequest(BaseModel):
    user_id: str
    item: dict


class GoogleAuthRequest(BaseModel):
    id_token: str


class SaveTripRequest(BaseModel):
    thread_id: str | None = None
    destination: str
    duration_days: int = 0
    plan_json: dict = {}


class WishlistRequest(BaseModel):
    item_type: str  # "destination" | "activity"
    name: str
    location: str | None = None
    metadata: dict = {}


class HotelSaveRequest(BaseModel):
    name: str
    location: str
    approx_cost_per_night: int | None = None
    reasoning: str | None = None
    content_source: str | None = None


class PreferencesRequest(BaseModel):
    taste_data: dict


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
        "candidates": None,
        "ranked_candidates": None,
        "user_profile": None,
        "research_synthesis": None,
        "plan": None,
        "user_feedback": None,
        "refinement_count": 0,
        "refinement_history": [],
        "regenerate_requested": False,
        "critic_passes": 0,
        "awaiting_feedback": False,
        "current_node": "persona_classification",
        "stage_label": "Understanding your profile",
        "error": None,
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/api/parse")
async def parse_intent(req: ParseRequest):
    from nodes import _call_llm
    from prompts import INTENT_PARSE_SYSTEM
    try:
        parsed = _call_llm(INTENT_PARSE_SYSTEM, req.text, max_tokens=512)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"parse_failed: {e}")
    return parsed


@app.post("/api/onboard")
async def onboard(req: OnboardRequest):
    from taste import TasteProfile, save_taste

    user_id = req.user_id.strip() if req.user_id.strip() else f"anon_{uuid4().hex[:12]}"

    user_profile = None
    if req.onboarding_answers:
        from nodes import _call_llm
        from prompts import PERSONA_CLASSIFICATION_SYSTEM
        answers_text = "\n".join(f"Q: {a['question']}\nA: {a['answer']}" for a in req.onboarding_answers)
        if req.destination_hint:
            answers_text += f"\nDestination hint: {req.destination_hint}"
        try:
            user_profile = _call_llm(PERSONA_CLASSIFICATION_SYSTEM, answers_text, max_tokens=1024)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"persona_classification_failed: {e}")

    taste_profile_dict = None
    if req.taste_data:
        profile_data = {"user_id": user_id, **req.taste_data}
        profile = TasteProfile(**{k: v for k, v in profile_data.items() if k in TasteProfile.__dataclass_fields__})
        save_taste(profile)
        taste_profile_dict = asdict(profile)

    return {"user_id": user_id, "user_profile": user_profile, "taste_profile": taste_profile_dict}


@app.get("/api/taste/{user_id}")
async def get_taste(user_id: str):
    from taste import load_taste
    profile = load_taste(user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Taste profile not found")
    return asdict(profile)


@app.get("/api/clarify/questions")
async def clarify_questions(user_id: str = "", destination: str = ""):
    from nodes import get_clarify_questions
    return {"questions": get_clarify_questions(user_id, destination)}


@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    import tempfile, groq as _groq
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="empty_audio")
    suffix = "." + (file.filename or "recording.webm").rsplit(".", 1)[-1]
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        client = _groq.Groq(api_key=os.getenv("LLM_API_KEY"))
        with open(tmp_path, "rb") as f:
            result = client.audio.transcriptions.create(
                file=(file.filename or "recording.webm", f),
                model="whisper-large-v3-turbo",
                response_format="text",
            )
        return {"text": result.strip() if isinstance(result, str) else result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"transcription_failed: {e}")
    finally:
        import os as _os
        _os.unlink(tmp_path)


@app.post("/api/plan")
async def start_plan(req: PlanRequest):
    thread_id = str(uuid4())
    _register_thread(thread_id)
    config = {"configurable": {"thread_id": thread_id}}
    graph.invoke(_build_initial_state(req), config=config)
    state = _get_state(config)
    return _plan_response(state, thread_id)


@app.post("/api/plan/stream")
async def stream_plan(req: PlanRequest):
    thread_id = str(uuid4())
    _register_thread(thread_id)
    config = {"configurable": {"thread_id": thread_id}}

    async def generate():
        yield f"data: {json.dumps({'type': 'thread_id', 'thread_id': thread_id})}\n\n"

        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()
        _SENTINEL = object()

        # graph.stream is a *sync* generator and the SqliteSaver checkpointer is
        # incompatible with astream, so we drive it in a worker thread and push
        # each chunk onto an asyncio.Queue as it's produced — yielding stage
        # events incrementally instead of buffering the whole pipeline first.
        def run_graph():
            try:
                for chunk in graph.stream(_build_initial_state(req), config=config, stream_mode="updates"):
                    loop.call_soon_threadsafe(queue.put_nowait, chunk)
            except Exception as e:  # noqa: BLE001 — surfaced to client below
                loop.call_soon_threadsafe(queue.put_nowait, e)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, _SENTINEL)

        loop.run_in_executor(None, run_graph)

        while True:
            item = await queue.get()
            if item is _SENTINEL:
                break
            if isinstance(item, Exception):
                yield f"data: {json.dumps({'type': 'error', 'detail': str(item)})}\n\n"
                return
            for _node, update in item.items():
                if not isinstance(update, dict):
                    continue
                stage = update.get("stage_label")
                if stage:
                    yield f"data: {json.dumps({'type': 'stage', 'stage_label': stage})}\n\n"
                # Emit real detail events surfacing existing node outputs
                synthesis = update.get("research_synthesis")
                if synthesis and isinstance(synthesis, dict):
                    risks = synthesis.get("local_risks", []) + synthesis.get("implicit_warnings", [])
                    if risks:
                        n = len(risks)
                        detail = f"Found {n} local insight{'s' if n != 1 else ''} for {req.destination}"
                        yield f"data: {json.dumps({'type': 'detail', 'text': detail})}\n\n"
                plan_data = update.get("plan")
                if plan_data and isinstance(plan_data, dict) and plan_data.get("days"):
                    days = len(plan_data.get("days", []))
                    hotels = len(plan_data.get("hotels", []))
                    detail = f"Drafted {days}-day plan · {hotels} hotel{'s' if hotels != 1 else ''} shortlisted"
                    yield f"data: {json.dumps({'type': 'detail', 'text': detail})}\n\n"

        state = _get_state(config)
        if state.get("error"):
            yield f"data: {json.dumps({'type': 'error', 'detail': state['error']})}\n\n"
        else:
            yield f"data: {json.dumps({'type': 'done', 'plan': state.get('plan'), 'thread_id': thread_id, 'stage_label': state.get('stage_label', ''), 'refinement_count': state.get('refinement_count', 0)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/refine")
async def refine_plan(req: RefineRequest):
    config = {"configurable": {"thread_id": req.thread_id}}
    try:
        graph.invoke(Command(resume=req.user_feedback), config=config)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Session not found or expired: {e}")
    state = _get_state(config)
    return _plan_response(state, req.thread_id)


@app.post("/api/regenerate/stream")
async def regenerate_plan_stream(req: RegenerateRequest):
    config = {"configurable": {"thread_id": req.thread_id}}

    async def generate():
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()
        _SENTINEL = object()

        def run_graph():
            try:
                for chunk in graph.stream(Command(resume={"regenerate": True}), config=config, stream_mode="updates"):
                    loop.call_soon_threadsafe(queue.put_nowait, chunk)
            except Exception as e:  # noqa: BLE001
                loop.call_soon_threadsafe(queue.put_nowait, e)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, _SENTINEL)

        loop.run_in_executor(None, run_graph)

        while True:
            item = await queue.get()
            if item is _SENTINEL:
                break
            if isinstance(item, Exception):
                yield f"data: {json.dumps({'type': 'error', 'detail': str(item)})}\n\n"
                return
            for _node, update in item.items():
                if not isinstance(update, dict):
                    continue
                stage = update.get("stage_label")
                if stage:
                    yield f"data: {json.dumps({'type': 'stage', 'stage_label': stage})}\n\n"

        state = _get_state(config)
        if state.get("error"):
            yield f"data: {json.dumps({'type': 'error', 'detail': state['error']})}\n\n"
        else:
            yield f"data: {json.dumps({'type': 'done', 'plan': state.get('plan'), 'thread_id': req.thread_id, 'stage_label': state.get('stage_label', ''), 'refinement_count': state.get('refinement_count', 0)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/regenerate")
async def regenerate_plan(req: RegenerateRequest):
    config = {"configurable": {"thread_id": req.thread_id}}
    try:
        graph.invoke(Command(resume={"regenerate": True}), config=config)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Session not found or expired: {e}")
    state = _get_state(config)
    return _plan_response(state, req.thread_id)


@app.post("/api/auth/google")
async def auth_google(req: GoogleAuthRequest):
    from auth import verify_google_token, create_app_token
    from saves import upsert_user
    info = verify_google_token(req.id_token)
    user_id = upsert_user(info["sub"], info["email"], info["name"], info.get("picture", ""))
    token = create_app_token(user_id, info["email"])
    return {
        "access_token": token,
        "user": {"user_id": user_id, "name": info["name"], "email": info["email"], "avatar_url": info.get("picture")},
    }


@app.get("/api/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    from saves import get_user, _derive_traveler_label
    from taste import load_taste, taste_to_summary
    user_id = current_user["sub"]
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="user_not_found")
    profile = load_taste(user_id)
    return {
        "user_id": user_id,
        "name": user["name"],
        "email": user["email"],
        "avatar_url": user.get("avatar_url"),
        "traveler_type_label": _derive_traveler_label(profile) if profile else "Explorer",
        "taste_summary": taste_to_summary(profile) if profile else None,
    }


@app.patch("/api/profile/preferences")
async def update_preferences(req: PreferencesRequest, current_user: dict = Depends(get_current_user)):
    from taste import TasteProfile, load_taste, save_taste, merge_taste
    user_id = current_user["sub"]
    existing = load_taste(user_id)
    if existing:
        updated = merge_taste(existing, req.taste_data)
    else:
        profile_data = {"user_id": user_id, **req.taste_data}
        updated = TasteProfile(**{k: v for k, v in profile_data.items() if k in TasteProfile.__dataclass_fields__})
    save_taste(updated)
    from dataclasses import asdict
    return asdict(updated)


@app.post("/api/saves/trips")
async def save_trip_endpoint(req: SaveTripRequest, current_user: dict = Depends(get_current_user)):
    from saves import save_trip
    trip_id = save_trip(current_user["sub"], req.thread_id, req.destination, req.duration_days, req.plan_json)
    return {"id": trip_id}


@app.get("/api/saves/trips")
async def list_trips(current_user: dict = Depends(get_current_user)):
    from saves import get_saved_trips
    return get_saved_trips(current_user["sub"])


@app.delete("/api/saves/trips/{trip_id}")
async def delete_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    from saves import delete_saved_trip
    if not delete_saved_trip(current_user["sub"], trip_id):
        raise HTTPException(status_code=404, detail="trip_not_found")
    return {"ok": True}


@app.post("/api/saves/wishlist")
async def toggle_wishlist(req: WishlistRequest, current_user: dict = Depends(get_current_user)):
    from saves import toggle_wishlist_item
    added = toggle_wishlist_item(current_user["sub"], req.item_type, req.name, req.location, req.metadata)
    return {"added": added}


@app.get("/api/saves/wishlist")
async def list_wishlist(current_user: dict = Depends(get_current_user)):
    from saves import get_wishlist
    return get_wishlist(current_user["sub"])


@app.delete("/api/saves/wishlist/{item_id}")
async def delete_wishlist(item_id: str, current_user: dict = Depends(get_current_user)):
    from saves import delete_wishlist_item
    if not delete_wishlist_item(current_user["sub"], item_id):
        raise HTTPException(status_code=404, detail="item_not_found")
    return {"ok": True}


@app.post("/api/saves/hotels")
async def toggle_hotel_endpoint(req: HotelSaveRequest, current_user: dict = Depends(get_current_user)):
    from saves import toggle_hotel
    added = toggle_hotel(current_user["sub"], req.name, req.location, req.approx_cost_per_night, req.reasoning, req.content_source)
    return {"added": added}


@app.get("/api/saves/hotels")
async def list_hotels(current_user: dict = Depends(get_current_user)):
    from saves import get_saved_hotels
    return get_saved_hotels(current_user["sub"])


@app.delete("/api/saves/hotels/{hotel_id}")
async def delete_hotel_endpoint(hotel_id: str, current_user: dict = Depends(get_current_user)):
    from saves import delete_hotel
    if not delete_hotel(current_user["sub"], hotel_id):
        raise HTTPException(status_code=404, detail="hotel_not_found")
    return {"ok": True}


@app.post("/api/parse-taste")
async def parse_taste(req: ParseRequest):
    from nodes import _call_llm
    _TASTE_PARSE_SYSTEM = (
        "Extract travel preferences from the user's text. Return JSON with any of these keys that you can infer: "
        "pace (1-5), crowd_tolerance (1-5), immersion_style (1-5), food_adventurousness (1-5), "
        "walking_tolerance (1-5), accommodation_taste (1-5), "
        "interests (object with keys: nature, heritage, food, adventure, photography, spiritual, wildlife, shopping, wellness, nightlife; values 0.0-1.0). "
        "Only include keys you are confident about. Return {} if nothing can be inferred."
    )
    try:
        result = _call_llm(_TASTE_PARSE_SYSTEM, req.text, max_tokens=512)
        return result if isinstance(result, dict) else {}
    except Exception:
        return {}


@app.post("/api/book")
async def book_item(req: BookRequest):
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
