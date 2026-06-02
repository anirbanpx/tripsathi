# Sprint 3 — TripSathi
**Demo deadline:** Jun 14, 2026 · **Daily budget:** 3–4h · **~12 days remaining from Jun 2**

---

## Quick fixes (do these first — total ~3h)

- [x] **`_enforce_plan_quality` bug** (`backend/nodes.py`)
  - Fixed: houseboat hotel swap + `HOUSEBOAT_TODDLER_WARNING` moved inside `if toddler:` block only.

- [x] **Token/cost logging in `_call_llm`** (`backend/nodes.py`)
  - Python `logging` added. Logs `model`, `prompt_tokens`, `completion_tokens`, `total_tokens` per call.

- [x] **Phoenix Arize observability** (`backend/main.py` + `backend/requirements.txt`)
  - Chose Phoenix over LangSmith: runs locally, no account, native LlamaIndex + LangChain instrumentation.
  - Code added to `main.py` (try/except so backend starts cleanly before install).
  - Run: `pip install arize-phoenix openinference-instrumentation-langchain openinference-instrumentation-llama-index`
  - Phoenix UI at http://localhost:6006 once backend starts.

- [ ] **CORS production URLs** (`backend/main.py` line ~28)
  - Currently only `localhost:5173` and `localhost:5174`.
  - Add Railway backend URL + Vercel/Netlify frontend URL once deployment is done.

- [x] **`research_synthesis` in refinement prompt** (`backend/nodes.py`)
  - `rag_risks` from `local_risks + implicit_warnings` now injected into refinement prompt with "preserve verbatim" instruction.

---

## Sprint 3 backlog (priority order)

### Must-have — bootcamp deliverables

- [ ] **Scaled eval with LLM-as-judge** (~6–8h)
  - Wire `data/evaluations_data.csv` test cases to LangGraph via DeepEval.
  - Use LLM-as-judge to auto-score all 10 cases (currently manual-only).
  - Target: 3–5× eval coverage from Sprint 2.
  - Bootcamp curriculum explicitly requires this for Sprint 3.

- [x] **Deploy backend to Railway** — `https://tripsathi-production.up.railway.app`
  - FastAPI app + SQLite checkpoints.
  - Add `railway.toml` or `Procfile`.
  - Update CORS in `main.py` with Railway URL.
  - Update `frontend/src/services/api.ts` to point at Railway URL in production.

- [x] **Deploy frontend to Vercel** — `https://frontend-agent-demo-s-projects.vercel.app`

- [ ] **Cost analysis** (~2–3h)
  - After token logging is added: run all 3 baseline eval cases, capture token counts.
  - Calculate ₹ cost per plan generation (Groq pricing).
  - Document in a `reports/cost_analysis.md`.

### High-value — portfolio differentiators

- [ ] **Long-term memory with Mem0** (~4–6h)
  - Store: user_profile, destinations visited, budget tier, group composition after each approved plan.
  - Read back into Call 1 (persona_classification) and Call 4 (plan_generation) for personalization.
  - Mem0 Python SDK: `pip install mem0ai`.
  - Key insight from docs: "cross-trip user preferences" — the memory is between trips, not within a trip.

- [x] **RAG corpus expansion**
  - Added: `goa.md`, `rajasthan.md`, `ladakh.md`, `coorg.md`, `shimla.md`, `andaman.md` (Munnar skipped — already in `kerala.md`).
  - Switched to local HuggingFace embeddings (`BAAI/bge-small-en-v1.5`) — no OpenAI key needed.
  - ChromaDB rebuilt via `backend/reindex.py` — 9 files indexed.
  - `llama-index-embeddings-huggingface` added to `requirements.txt`.

- [ ] **Retrieval quality check loop** (~3–4h)
  - Promotes Destination Intelligence from service node to agent.
  - After retrieval: if `local_risks` is empty in synthesis → re-query with refined terms before proceeding.
  - Architecture spec calls this the "Angle B quality gate".

### Stretch goals (do if time allows)

- [ ] **SSE real streaming** (~4–5h)
  - Replace fake `setTimeout` progress UI with real `graph.astream_events`.
  - Frontend: `EventSource` or `fetch` with `ReadableStream`.
  - Removes the hardcoded fake stage durations in `frontend/src/lib/fakeProgress.ts`.

- [ ] **Voice input (Whisper STT only)** (~6–8h)
  - Whisper API (OpenAI) or local Whisper for transcription.
  - Add mic button to the journal textarea in `TripInputStepper.tsx`.
  - No TTS needed for demo — just input transcription.
  - Every doc defers this but it's the biggest demo differentiator.

- [ ] **PDF export** (~2–3h)
  - `window.print()` already wired in `BookingSection.tsx`.
  - Add a print stylesheet (`@media print`) to hide nav, CTAs, and format plan cleanly.

---

## Key context for next session

### Stack reality (docs are stale on this)
- **LLM is Groq** via OpenAI-compatible API, NOT Anthropic SDK.
- Env vars: `LLM_API_KEY` (Groq key), `LLM_BASE_URL` (Groq endpoint), `LLM_MODEL`.
- `ANTHROPIC_API_KEY` mentioned in architecture docs is wrong — ignore.

### What was completed in Sprint 2
- LangGraph pipeline: persona_classification → destination_intelligence → plan_assembly → human_feedback → finalize
- SqliteSaver checkpointer (already migrated from MemorySaver)
- React frontend: entry page, stepper, plan display, booking screen, map view
- 3 RAG destinations indexed in ChromaDB
- 10 eval cases scored manually (6/7 variation cases passed)
- All 7 UX audit minor items fixed (committed Jun 2)

### Files to know
| File | What it does |
|---|---|
| `backend/nodes.py` | All LLM calls + `_enforce_plan_quality` post-processor |
| `backend/graph.py` | LangGraph graph definition (SqliteSaver) |
| `backend/main.py` | FastAPI endpoints — env var is `LLM_API_KEY` not `ANTHROPIC_API_KEY` |
| `backend/prompts.py` | All 6 system prompts |
| `backend/rag/knowledge/` | Kerala, Puri, Guwahati destination docs |
| `data/evaluations_data.csv` | 10 eval test cases |
| `frontend/src/components/planner/` | Core UI components |
| `frontend/src/styles/ds.css` | Design system CSS |
| `frontend/UX_AUDIT.md` | Audit log — all items now fixed |

### Known gotchas (from CLAUDE.md)
- Groq reasoning model needs `max_tokens >= 1024` or returns empty string
- `response_format={"type": "json_object"}` breaks on Unicode — don't use it
- CARTO tiles for maps (no Mapbox billing for dev)
- Unsplash: 50 req/hour free tier limit
