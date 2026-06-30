# Claude Instructions — Anirban's AI Agent Workspace

## Participant Context

**Who:** Anirban — Product Manager based in India, former full-stack developer (6 years ago). Advanced with OpenAI API and prompt engineering, built toy RAG apps, comfortable reading Python. New to hands-on LangGraph, LlamaIndex, and multi-agent architectures.

**How to calibrate explanations:**
- Treat him as technically fluent — he understands APIs, system design, and code structure
- He can read Python but isn't writing it day-to-day — show code with brief explanation of what each block does, don't over-explain basics
- Frame new agent concepts (LangGraph state machines, LlamaIndex indexing, MCP tool routing) in terms of familiar patterns: API design, request/response flows, middleware

---

## Active Project

**Personal Travel Multi-Agent System** — a conversational agent that helps users research, plan, and book trips through an agentic chat interface.

**Tech stack:**
| Layer | Tech |
|---|---|
| LLM | Groq (openai/gpt-oss-120b, OpenAI-compatible API) |
| RAG / Indexing | LlamaIndex |
| Orchestration | LangGraph (overall) + LangChain DeepAgents (research subagent) |
| Tool integration | MCP servers (web search, Google Maps, weather, Brave/Tavily) |
| Memory | LangGraph built-in + Mem0 / Zep (long-term) |
| Human-in-the-loop | LangGraph interrupt/breakpoints |
| Voice | Whisper (STT) + ElevenLabs / Deepgram (TTS) |
| Evaluation | DeepEval |
| Chat UI | Chainlit (now) → AG-UI / CopilotKit (later) |
| Vector DB | TBD (Chroma, Qdrant, or Pinecone) |

**Sprint plan:**
- **Sprint 2 (by May 31):** RAG module + LangGraph agent orchestration + Chainlit chat UI + basic DeepEval eval set
- **Sprint 3 (by Jun 14):** Memory + HITL + voice interface + observability
- **Final (by Jun 19):** Both projects polished and live on public portfolio website

When suggesting implementations, default to this stack. If recommending alternatives, explain the trade-off relative to these tools specifically.

---

## Goals & Success Criteria

1. Stay at the forefront of AI agent tech — fluent enough to have deep technical conversations with engineering teams and scope/evaluate agent projects confidently
2. Build 2–3 portfolio-ready projects on a public-facing website by end of bootcamp

**Personal definition of success:** Two portfolio-ready projects demonstrating hands-on mastery of cutting-edge agent technologies, backed by evaluation suites and deployed publicly.

**Time commitment:** ~3 hours/day, ~21 hours/week

---

## Known Issues & Gotchas

Keep this section updated. Before starting any task, check here first to avoid repeating known dead ends.

### Unsplash image download (`backend/download_destination_images.py`)
- **Free tier limit:** 50 requests/hour. A full run of 54 destinations exhausts this in one shot. **403 Forbidden = rate limit hit**, not an auth error. Wait ~60 min after the first run before retrying the failures. The script skips already-downloaded files so re-running is safe.
- **No-results queries:** `Kochi`, `Thekkady`, `Pondicherry`, `Darjeeling`, and `Havelock` returned 0 results with original query strings. All fixed in the script — use city-landmark combos without "India" suffix, e.g. `"Fort Kochi Chinese fishing nets Kerala waterfront"`, `"Periyar wildlife sanctuary lake boat Kerala"`, `"Puducherry French colonial architecture promenade beach"`, `"Darjeeling tea plantation hills mountain West Bengal"`, `"Radhanagar beach Andaman Islands turquoise water"`.
- **Image location:** Vite serves static files from `frontend/public/` — images MUST be in `frontend/public/images/destinations/`. The script now writes there directly. Old copies in `backend/static/images/destinations/` are unused.
- **API key:** Stored in `backend/.env` as `UNSPLASH_ACCESS_KEY`. Run as: `python download_destination_images.py --key $UNSPLASH_ACCESS_KEY`

### Map tile rate limits
- **Don't use Mapbox/Google Maps** — both require billing setup and hit rate limits on free tier quickly.
- **Use CARTO tiles** (`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`) — free, no API key, no rate limit for dev use.
- Current `MapView.tsx` and `IndiaDestinationsMap.tsx` both use CARTO. Keep it this way.

### Groq + reasoning model (`openai/gpt-oss-120b`)
- Uses 600+ internal tokens before producing output. Any `max_tokens < 1024` for query expansion returns empty string. Synthesis needs 4096.
- `response_format={"type": "json_object"}` causes `json_validate_failed` on Unicode chars — don't use it, rely on prompt + retry.
- Rate limits exhaust fast — wait 60–90s between full pipeline runs in eval scripts.
- **Free tier = 200k tokens/day (TPD).** A few full pipeline runs exhaust it; surfaces as `429 ... tokens per day: Limit 200000, Used 200000`. The app now auto-fails over: Groq → Cerebras (`gpt-oss-120b`, 1M tok/day) → Gemini (`gemini-2.5-flash`, 1500 req/day). Enable via env vars — see `.env.example` for `FALLBACK1_*` / `FALLBACK2_*` keys.

### Leaflet in Vite
- Default icon paths break in Vite. Fix already applied in both map components: delete `_getIconUrl` and call `L.Icon.Default.mergeOptions(...)` with unpkg URLs.

### Python — always use the venv
- **Never run bare `python`, `python3`, or `py` for backend commands.** The system Python on this machine is 3.14, which breaks pydantic v1, langchain_core, and several other dependencies.
- Always use the venv interpreter: `backend/venv/Scripts/python.exe`
- Examples: `backend/venv/Scripts/python.exe -m pytest ...`, `backend/venv/Scripts/python.exe -m uvicorn main:app ...`, `backend/venv/Scripts/python.exe script.py`
- The venv Python is 3.12.10 — that's the version everything was built and tested against.

### Input guardrails (`backend/guardrails.py`)
- Two-tier check on raw free-text user input (onboarding answers + refinement feedback), wired into `persona_classification` and `human_feedback` in `nodes.py`. Tier 1 = regex/keyword checks (free, no LLM call). Tier 2 = `openai/gpt-oss-safeguard-20b` via Groq, only called if tier 1 passes.
- **`meta-llama/llama-guard-4-12b` is decommissioned on Groq** — don't use it, it 400s with `model_decommissioned`. Use `openai/gpt-oss-safeguard-20b` instead (override via `GUARDRAILS_MODEL` env var if Groq changes this again).
- `gpt-oss-safeguard-20b` is a reasoning model — same gotcha as `gpt-oss-120b`: needs `max_tokens >= 1024` or returns an empty string.
- Tier 2 fails open on any exception (network error, rate limit, etc.) — a moderation-call hiccup shouldn't block a legitimate user since tier 1 already screened the obvious cases.

---

## Change Workflow

**Every feature addition or change must follow this sequence — no skipping steps:**

1. **Requirements first** — Open `specs/requirements.md` and add or update the relevant UC-XX entry. If it's a new use case, assign the next number. If it changes an existing one, update Status, Code, Design, and Tests fields.

2. **Design doc second** — Update the relevant design doc to reflect the change:
   - Backend logic → `specs/backend_architecture.md`
   - UX or frontend → `specs/user_experience_spec.md`
   - Both if needed

3. **Code third** — Write or update code in `backend/` (or `frontend/`).

4. **Verify last** — Run the test suite using the venv Python (system Python 3.14 breaks deps):
   ```
   backend/venv/Scripts/python.exe -m pytest backend/tests/ -v
   ```
   For a focused run on just the affected module:
   ```
   backend/venv/Scripts/python.exe -m pytest backend/tests/test_<module>.py -v
   ```
   LLM eval (`run_eval.py`) is rate-limited — run it periodically, not on every change.
