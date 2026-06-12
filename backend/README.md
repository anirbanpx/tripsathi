# Backend — FastAPI + LangGraph Agent

FastAPI server with a LangGraph multi-agent orchestration pipeline for trip planning.

---

## Requirements

- **Python 3.12** — hard requirement; RAG dependencies (LlamaIndex, ChromaDB) do not install cleanly on 3.13+

---

## Setup

```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example .env         # fill in API keys
uvicorn main:app --reload
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `LLM_API_KEY` | Groq API key (primary LLM) |
| `LLM_BASE_URL` | Groq OpenAI-compat endpoint |
| `LLM_MODEL` | Primary model (`openai/gpt-oss-120b`) |
| `RESEARCH_MODEL` | Faster model for tool calls |
| `FALLBACK1_LLM_*` | Cerebras fallback (1M tok/day free) |
| `FALLBACK2_LLM_*` | Gemini 2.5 Flash fallback (native google-genai SDK) |
| `FALLBACK3_LLM_*` | OpenRouter fallback (multiple free models) |
| `TAVILY_API_KEY` | Web search |
| `OPENWEATHER_API_KEY` | Weather tool |
| `GOOGLE_MAPS_API_KEY` | Places lookup |
| `UNSPLASH_ACCESS_KEY` | Destination images (download script only) |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `JWT_SECRET` | JWT signing secret (32+ random bytes) |
| `FRONTEND_URL` | Allowed CORS origin |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/plan/stream` | Generate trip plan (SSE stream) |
| `POST` | `/api/refine` | Refine existing plan |
| `POST` | `/api/regenerate/stream` | Regenerate plan (SSE stream) |
| `POST` | `/api/places/stream` | Stream place cards for a destination |
| `GET` | `/api/youtube/{destination}` | YouTube videos for a destination |
| `POST` | `/api/parse` | Parse natural language trip intent |
| `GET` | `/api/clarify/questions` | Get clarification questions |
| `POST` | `/api/transcribe` | Whisper STT voice transcription |
| `POST` | `/api/onboard` | Save user onboarding profile |
| `POST` | `/api/auth/google` | Google OAuth token exchange |
| `GET` | `/api/profile` | Get authenticated user profile |
| `GET/POST/DELETE` | `/api/saves/trips` | Saved trip CRUD |
| `GET/POST/DELETE` | `/api/saves/wishlist` | Wishlist CRUD |
| `GET/POST/DELETE` | `/api/saves/hotels` | Saved hotels CRUD |

---

## Architecture

### LangGraph State Machine

```
input_processor → research → synthesis → plan_assembly → critic → done
                                ↑                              |
                                └─────── retry (if critic fails) ┘
```

- **input_processor** — query expansion + intent parsing
- **research** — parallel RAG retrieval + Tavily web search + weather
- **synthesis** — persona-aware destination scoring + narrative
- **plan_assembly** — day-by-day itinerary with hotels, activities, logistics
- **critic** — LLM self-review; retries plan_assembly once if quality score < threshold

### LLM Failover Chain

```
Groq (200k TPD) → Cerebras (1M TPD) → Gemini 2.5 Flash (1500 RPD) → OpenRouter (free models)
```

Failover triggers on 429 (rate limit) or 403 (quota). Gemini uses the native `google-genai` SDK (not OpenAI-compat) because Gemini API keys reject Bearer auth.

### LangGraph Checkpointing

Session state is persisted to `data/checkpoints.db` (SQLite). Human-in-the-loop interrupts are supported — the graph pauses at `clarify` nodes and resumes when the user responds.

---

## Testing

```bash
# Run all tests
pytest tests/

# Run with verbose output
pytest tests/ -v

# Run a specific file
pytest tests/test_graph.py -v
```

See `tests/README.md` for test coverage details.

---

## Deployment (Railway)

- Starts via `Procfile`: `web: uvicorn main:app --host 0.0.0.0 --port $PORT`
- Railway root directory must be set to `Agent/backend` (not `backend`) because the git repo root is `D:\Workspace`, not `D:\Workspace\Agent`
