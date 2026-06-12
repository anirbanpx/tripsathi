# TripSathi — Backend Architecture

A deep-dive into what was built, why each technical choice was made, and how the system fits together. Written as a reference for portfolio review and engineering discussions.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [LangGraph State Machine](#2-langgraph-state-machine)
3. [LLM Provider Architecture](#3-llm-provider-architecture)
4. [RAG Knowledge Pipeline](#4-rag-knowledge-pipeline)
5. [API Architecture and SSE Streaming](#5-api-architecture-and-sse-streaming)
6. [Data Persistence](#6-data-persistence)
7. [Auth Flow](#7-auth-flow)
8. [Technology Decisions — The WHY](#8-technology-decisions--the-why)
9. [Agentic Patterns Used](#9-agentic-patterns-used)
10. [Known Trade-offs and Gaps](#10-known-trade-offs-and-gaps)

---

## 1. System Overview

TripSathi is a conversational AI agent that takes a natural-language trip description ("5 days in Kerala, family with a toddler, mid-range budget") and produces a personalised day-by-day itinerary with hotel recommendations, safety warnings, and a human-in-the-loop refinement loop. It is deployed as a FastAPI server on Railway, serving a React frontend on Vercel.

The architecture is deliberately agentic rather than monolithic. Each stage of trip planning — profiling the traveller, researching the destination, generating candidates, assembling the plan, self-reviewing, and collecting human feedback — is a discrete graph node with explicit state transitions. This makes the pipeline inspectable, retryable, and pausable (for human feedback) in ways a single LLM call cannot be.

```
User (Browser)
    │
    │  HTTPS + SSE
    ▼
Vercel CDN  (React 19 + TypeScript SPA)
    │
    │  REST / SSE  →  VITE_API_URL (Railway URL)
    ▼
Railway — FastAPI + Uvicorn  (Python 3.12)
    │
    ├─ Google OAuth ──────────────────────────► Google Identity Platform
    │
    ├─ LangGraph State Machine
    │       │
    │       ├─ Groq API ───────────────────────► openai/gpt-oss-120b  (primary)
    │       ├─ Cerebras API ──────────────────► gpt-oss-120b          (fallback 1)
    │       ├─ Gemini API ────────────────────► gemini-2.5-flash      (fallback 2)
    │       └─ OpenRouter API ───────────────► 6 free models          (fallback 3)
    │
    ├─ Qdrant Cloud ─────────────────────────► Vector store (RAG)
    ├─ Tavily / DuckDuckGo ──────────────────► Web search tool
    ├─ OpenWeather API ──────────────────────► Weather tool
    ├─ Google Maps Places API ───────────────► Place search tool
    ├─ Voyage / Cohere Rerank ───────────────► Candidate reranking
    └─ Mem0 Cloud ───────────────────────────► Long-term user memory

Local state (Railway ephemeral disk):
    ├─ checkpoints.db   LangGraph HITL session state  (SQLite)
    └─ taste.db         User taste profiles           (SQLite)
```

---

## 2. LangGraph State Machine

### Why a state machine?

Trip planning is inherently multi-stage: research a destination, generate candidates, build an itinerary, self-review it, collect human feedback, refine. A single LLM call cannot express retries, checkpoints, or mid-execution pauses. LangGraph models each stage as a node with explicit edges and checkpoints the full state to SQLite after every node — this is what enables the human-in-the-loop pattern: the graph pauses at `human_feedback`, the server returns the plan to the client, and when the user submits a change request the graph resumes from exactly where it stopped.

### State schema

Every node reads from and writes to a shared `AgentState` TypedDict. Nothing is passed as function arguments between nodes — all communication is through state.

| Field | Type | Set by | Purpose |
|---|---|---|---|
| `destination` | str | FastAPI | Input: where the user wants to go |
| `trip_parameters` | dict | FastAPI | Duration, budget, dates, group size, kid ages |
| `onboarding_answers` | list[dict] | FastAPI | Q&A from onboarding wizard |
| `user_profile` | dict | persona_classification | Persona type, constraints, autonomy mode |
| `research_synthesis` | dict | destination_intelligence | Key places, routing, risks, seasonal context |
| `candidates` | list | candidate_gen | 15–25 structured activity/hotel candidates with accessibility tags |
| `ranked_candidates` | list | ranker | Taste-scored and filtered candidates |
| `plan` | dict | plan_assembly | Day-by-day itinerary + hotels + budget + warnings |
| `user_feedback` | str | human_feedback | User's change request text (HITL) |
| `refinement_history` | list[str] | plan_assembly | All feedback messages this session |
| `critic_passes` | int | critic | Loop counter, capped at 2 |
| `awaiting_feedback` | bool | plan_assembly | HITL gate: True after plan generated |
| `taste_profile` | dict | FastAPI (pre-loaded) | Serialised TasteProfile from SQLite |
| `session_tokens` | int | every node | Token accumulator for cost estimate |
| `stage_label` | str | every node | Human-readable stage for frontend progress UI |
| `error` | str | error_node | Error message; triggers routing to error_node |

### Full graph topology

```
START
  │
  ▼
┌─────────────────────────────────┐
│  persona_classification         │
│                                 │
│  LLM: PERSONA_CLASSIFICATION    │
│  Inputs: onboarding Q&A,        │
│    destination, traveler_notes  │
│  Optional: Mem0 past memories   │
│                                 │
│  Outputs: user_profile          │
│    persona_type: family_with_   │
│      kids | solo | friend_group │
│      | pilgrimage | weekend_    │
│      escapee                    │
│    autonomy_mode: L1 | L2 | L3  │
│    constraints: kid_ages,       │
│      elderly, dietary, budget   │
└──────────────┬──────────────────┘
    error ◄────┤
               │ success
               ▼
┌─────────────────────────────────┐
│  destination_intelligence       │
│                                 │
│  Step 1: QUERY_EXPANSION (LLM)  │
│    → 5–7 persona-specific       │
│      retrieval queries          │
│                                 │
│  Step 2: parallel pre-fetch     │
│    ThreadPoolExecutor (3):      │
│    • Tavily web search ×2       │──► Tavily API
│    • OpenWeather forecast       │──► OpenWeather API
│                                 │
│  Step 3: parallel RAG           │
│    ThreadPoolExecutor (≤7):     │
│    • Qdrant filtered queries    │──► Qdrant Cloud
│      (7 queries, top_k=12 ea)  │
│                                 │
│  Step 4: RESEARCH_SYNTHESIS     │
│    (LLM, tool-calling mode)     │
│                                 │
│  Quality gate: if local_risks   │
│  < 2, re-query with safety      │
│  terms and supplement           │
│                                 │
│  Outputs: research_synthesis    │
│    {routing, key_places,        │
│     local_risks, seasonal_      │
│     context, implicit_warnings} │
└──────────────┬──────────────────┘
    error ◄────┤
               │
               ▼
┌─────────────────────────────────┐
│  candidate_gen                  │
│                                 │
│  LLM: CANDIDATE_GEN_SYSTEM      │
│  Extracts 15–25 structured      │
│  items from synthesis:          │
│    activities, hotels,          │
│    restaurants                  │
│  Each item tagged:              │
│    toddler_ok, elderly_ok,      │
│    indoor/outdoor, terrain,     │
│    cost_tier, duration_hours    │
│                                 │
│  max_tokens=4096 (lower budgets │
│  truncate JSON mid-array)       │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  ranker                         │
│                                 │
│  1. Filter hard_avoids          │
│  2. Check kid/elderly flags     │
│  3. Build taste query string    │
│     (pace, crowd, interests,    │
│      dietary, accessibility)    │
│  4. Cross-encoder reranking:    │
│     • Voyage rerank-2.5-lite    │──► Voyage API
│     • Cohere rerank-english-v3  │──► Cohere API
│     • Identity fallback         │
│                                 │
│  Outputs: ranked_candidates     │
│    (sorted by match_score)      │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐◄──────────────────────┐
│  plan_assembly                  │◄── critic retry        │
│                                 │◄── HITL refine/regen   │
│  Routes by context:             │                        │
│  • Initial gen: PLAN_GENERATION │                        │
│  • Refinement:  PLAN_REFINEMENT │                        │
│    (last 3 feedbacks in ctx)    │                        │
│  • Regenerate:  PLAN_REGENERATE │                        │
│                                 │                        │
│  Post-processing:               │                        │
│  _enforce_plan_quality():       │                        │
│  • Toddler: inject nap blocks   │                        │
│  • Houseboat swap (Kerala)      │                        │
│  • Elderly: midday rest         │                        │
│  • RAG risk carryover           │                        │
│  • Destination-specific rules   │                        │
│    (Jaisalmer camel scam,       │                        │
│     Manali photo tout)          │                        │
│                                 │                        │
│  Outputs: plan                  │                        │
│    {days[], hotels[], budget,   │                        │
│     warnings[], personalization_│                        │
│     notes[]}                    │                        │
└──────────────┬──────────────────┘                        │
    error ◄────┤                                           │
               │                                           │
               ▼                                           │
┌─────────────────────────────────┐                        │
│  critic                         │                        │
│                                 │                        │
│  LLM: CRITIC_SYSTEM             │                        │
│  Red-teams plan vs:             │                        │
│    taste profile, constraints,  │                        │
│    crowd/pace/food preferences  │                        │
│                                 │                        │
│  verdict: pass | fail           │                        │
│  if fail AND passes ≤ 2:        │────── retry ───────────┘
│    → plan_assembly with issues  │
│  if pass OR passes > 2:         │
│    → human_feedback             │
└──────────────┬──────────────────┘
    error ◄────┤
               │ pass
               ▼
┌─────────────────────────────────┐
│  human_feedback   ⚡ HITL        │
│                                 │
│  interrupt({plan, status,       │
│    stage_label, refinements})   │
│                                 │
│  Graph pauses here.             │
│  State checkpointed to SQLite.  │
│  API returns plan to client.    │
│                                 │
│  Resumes when:                  │
│  POST /api/refine               │
│    → Command(resume=feedback)   │
│  POST /api/regenerate           │
│    → Command(resume={regen:T})  │
└──────────────┬──────────────────┘
               │
       ┌───────┼────────┐
       ▼       ▼        ▼
    refine   regen   approve
       │       │        │
       └───┬───┘        │
           ▼            ▼
     plan_assembly  ┌─────────────────┐
                    │  finalize       │
                    │                 │
                    │  LLM: extract   │
                    │  taste deltas   │
                    │  from history   │
                    │                 │
                    │  merge_taste()  │
                    │  → save_taste() │
                    │  → write_memory │──► Mem0 Cloud
                    │                 │
                    │  Log: tokens,   │
                    │  cost (INR+USD) │
                    └────────┬────────┘
                             │
                             ▼
                            END

┌─────────────────────────────────┐
│  error  (terminal node)         │
│  Reached when any node sets     │
│  state["error"]                 │
│  Detects: rate-limited,         │
│  quota-exhausted, parse-failed  │
│  Returns user-friendly message  │
└─────────────────────────────────┘
```

---

## 3. LLM Provider Architecture

### Task-aware provider routing

Not all LLM tasks are equal. Research synthesis needs long context windows (Gemini handles this better). Planning and critic loops need tight instruction following and JSON output (Groq's reasoning model excels here). Routing is encoded in `_TASK_CHAINS`:

| Task | Provider order | Reasoning |
|---|---|---|
| `plan`, `critic` | Groq → Cerebras → Gemini → OpenRouter | Reasoning-heavy, short-to-medium context |
| `synthesis`, `candidate_gen` | Gemini → Groq → Cerebras | Long-context synthesis |
| `default` | Groq → Cerebras → Gemini | General tasks |

### Failover mechanics

```
Request arrives  (e.g. task="plan")
        │
        ▼
 Task Router (_TASK_CHAINS)
 ──────────────────────────────────────────────────────────
 plan / critic    ──► [Groq → Cerebras → Gemini → OpenRouter]
 synthesis        ──► [Gemini → Groq → Cerebras]
 default          ──► [Groq → Cerebras → Gemini]
 ──────────────────────────────────────────────────────────
        │
        ▼  try first provider in chain
  ┌────────────────────────────────────┐
  │  Provider attempt  (≤ 3 retries)   │
  │                                    │
  │  ✓ Success  → return response      │
  │                                    │
  │  429 Rate limit                    │
  │    → _disabled_until[provider]     │
  │      = now + 600s                  │
  │    → skip, try next provider       │
  │                                    │
  │  Context length overflow           │
  │    → skip, try next provider       │
  │                                    │
  │  Other error                       │
  │    → retry with 8s / 16s delay     │
  └────────────────────────────────────┘
        │
        ▼  all providers exhausted
  RuntimeError → error_node
  User sees: "All providers rate-limited. Try again in a few minutes."

Gemini special case:
  Uses native google-genai SDK (not OpenAI-compat).
  Gemini API keys reject Bearer auth on the OpenAI-compat endpoint.
  _call_gemini_with_tools() converts OpenAI tool schemas to Gemini
  function_declarations format.

Cost reference (Groq pricing):
  ~22,300 tokens per full plan run ≈ ₹1.70 / $0.02
  Groq free tier: 200k tokens/day → ~9 full runs/day
```

---

## 4. RAG Knowledge Pipeline

### Why RAG?

LLM training data under-represents India travel specifics: exact pricing at tourist sites, seasonal road closures, local scam patterns, which ghats are safe at night. Curated destination markdown files encode this knowledge; retrieval grounds every plan in verified facts rather than hallucinated generalities.

### Index phase (run once with `python reindex.py`)

```
knowledge/*.md  (18 destination files, manually curated)
  Each covers: overview, best time, must-sees, food,
  travel tips, budget guidance, safety notes
        │
        ▼  LlamaIndex document parser
  text chunks  (~512 tokens each, with overlap)
        │
        ▼  Embedding model  (priority order)
        │  1. Voyage voyage-3.5-lite    (1024-dim)  if VOYAGE_API_KEY
        │  2. Cohere embed-english-v3.0 (1024-dim)  if COHERE_API_KEY
        │
        ▼
  Qdrant Cloud  collection "tripsathi"
  payload per chunk: {destination: "goa", source_file: "goa.md"}
  keyword index on `destination` field  (idempotent, created at startup)
```

### Query phase (per request, inside `destination_intelligence` node)

```
user_profile + destination
        │
        ▼  QUERY_EXPANSION_SYSTEM  (LLM)
  5–7 targeted queries, persona-specific:
  e.g. "toddler-friendly morning activities Goa beaches"
       "monsoon flooding risk Goa transport safety"
       "temple entry dress code rules Goa tourist"
        │
        ▼  ThreadPoolExecutor  (parallel, max 7 workers)
  Qdrant filtered queries
    MetadataFilter(key="destination", value="goa")
    similarity_top_k=12 per query
        │
        ▼  Deduplicate + concatenate
  retrieved context  (~3,000–5,000 tokens)
        │
        ▼  RESEARCH_SYNTHESIS_SYSTEM  (LLM, tool-calling mode)
  research_synthesis = {
    routing:          "Day 1 North Goa → Day 3 South Goa..."
    key_places:       [{name, why, cost, duration, notes}]
    local_risks:      [{risk, mitigation, pricing}]
    seasonal_context: "Post-monsoon October: beaches open..."
    implicit_warnings: ["Photo touts near Basilica..."]
  }

QUALITY GATE:
  if len(local_risks) < 2:
    re-query with ["scam warning {dest}", "seasonal risk {dest}",
                   "safety concern {dest}"]
    supplement synthesis with additional findings
```

### Coverage

18 destinations indexed in Qdrant: Andaman, Coorg, Darjeeling, Goa, Guwahati, Hampi, Jaisalmer, Kerala, Ladakh, Manali, Mysore, Pondicherry, Puri, Rajasthan, Rishikesh, Shimla, Udaipur, Varanasi. Remaining 36 of 54 destinations fall back to LLM general knowledge (known gap, see §10).

---

## 5. API Architecture and SSE Streaming

### Endpoints by function

```
Auth & User
  POST /api/auth/google            Google OAuth id_token → JWT app token
  GET  /api/profile                User profile + taste summary  [JWT required]
  POST /api/onboard                Save onboarding answers + classify persona
  GET  /api/taste/{user_id}        Raw TasteProfile

Planning  (core flow)
  POST /api/plan/stream            Start plan → SSE stream of stages + final plan
  POST /api/refine                 Resume graph: user change request  (HITL)
  POST /api/regenerate/stream      Resume graph: regenerate flag → SSE stream

Places & Media
  POST /api/places/stream          Stream hotel + meal cards for a plan → SSE
  GET  /api/youtube/{destination}  Video metadata (cached JSON or live YT API)

Supporting
  POST /api/parse                  NL trip description → structured parameters
  GET  /api/clarify/questions      Adaptive clarification questions
  POST /api/transcribe             Audio file → text  (Groq Whisper large-v3-turbo)
  POST /api/parse-taste            NL preference text → TasteProfile fields
  POST /api/book                   Demo booking confirmation (no real booking)

Saves  (auth required)
  POST   /api/saves/trips          Save completed trip plan
  GET    /api/saves/trips          List saved trips
  DELETE /api/saves/trips/{id}     Delete saved trip
  POST   /api/saves/wishlist       Toggle wishlist item
  GET    /api/saves/wishlist       List wishlist
  DELETE /api/saves/wishlist/{id}  Delete wishlist item
  POST   /api/saves/hotels         Toggle saved hotel
  GET    /api/saves/hotels         List saved hotels
  DELETE /api/saves/hotels/{id}    Delete saved hotel
```

### SSE streaming architecture

SSE (Server-Sent Events) streams graph progress and final results to the React frontend. The graph runs synchronously in a `ThreadPoolExecutor` worker; an `asyncio.Queue` bridges it to the async FastAPI handler.

```
Client                      FastAPI (async)            Worker Thread
  │                              │                          │
  │  POST /api/plan/stream        │                          │
  │─────────────────────────────►│                          │
  │                              │  asyncio.Queue           │
  │                              │─ executor.submit() ─────►│
  │                              │                     graph.stream()
  │◄── event: thread_id ─────────│◄── queue.put() ──────────│
  │    "abc123"                  │                          │
  │◄── event: stage_label ───────│◄── queue.put() ──────────│
  │    "Profiling your style..."  │                          │
  │◄── event: stage_label ───────│◄── queue.put() ──────────│
  │    "Researching Goa..."       │                          │
  │◄── event: detail ────────────│◄── queue.put() ──────────│
  │    "Found 14 RAG chunks..."   │                          │
  │◄── event: stage_label ───────│◄── queue.put() ──────────│
  │    "Building your plan..."    │                          │
  │◄── event: done ──────────────│◄── queue.put("DONE") ────│
  │    { full plan JSON }         │                          │

Why SSE over WebSockets:
  • One-directional push is all that's needed (server → client)
  • No WS upgrade required — works through Vercel CDN and Railway reverse proxy
  • EventSource API is browser-native; no client library needed
  • Simpler error recovery: browser auto-reconnects on disconnect
```

---

## 6. Data Persistence

Three SQLite databases run locally on Railway's ephemeral disk. They are intentionally separated by concern.

### checkpoints.db — LangGraph session state

Managed automatically by LangGraph's `SqliteSaver`. Enables HITL: the graph serialises full state after every node, so `/api/refine` can resume the graph from the `human_feedback` interrupt point hours later.

```
tables:
  thread_registry   (thread_id TEXT PK, created_at REAL)
  checkpoints       (LangGraph internal: serialised node state per step)
  writes            (LangGraph internal)

TTL: 24 hours
Cleanup: background coroutine runs hourly, deletes threads older than 24h
```

### taste.db — user taste profiles

```
table: taste_profiles
  user_id     TEXT PRIMARY KEY
  profile_json TEXT  (serialised TasteProfile)
  updated_at  TEXT

TasteProfile fields:
  Scalar dimensions (1–5 scale):
    pace                  1=leisurely  5=packed
    crowd_tolerance       1=avoid      5=fine with crowds
    immersion_style       1=local      5=curated comfort
    food_adventurousness  1=safe       5=adventurous
    walking_tolerance     1=minimal    5=10km+/day
    planning_density      1=unplanned  5=hourly schedule
    accommodation_taste   1=boutique   5=chain resort

  Interest scores (0.0–1.0 each):
    nature, heritage, food, adventure, photography,
    spiritual, wildlife, shopping, wellness, nightlife

  Other:
    dietary_restrictions  list[str]
    hard_avoids           list[str]
    decision_style        L1 | L2 | L3
    persona_type          family_with_kids | solo | ...
    mobility_limited      bool
    confidence            dict[dimension → 0.0–1.0]
      starts at 0.1, grows +0.2 per refinement session
      clarify questions target dims with confidence < 0.5
```

### saves.db — user-saved content

```
tables:
  users         (user_id PK, google_sub UNIQUE, email, name, avatar_url)
  saved_trips   (id PK, user_id FK, thread_id, destination, plan_json)
  wishlist      (id PK, user_id FK, item_type, name, location, metadata_json)
  saved_hotels  (id PK, user_id FK, name, location, approx_cost_per_night)
```

### Taste learning loop

Every user action that reveals a preference updates the taste profile automatically:

```
Hotel saved  (cost > ₹8k)     → accommodation_taste pulled toward 4.5  (30% blend)
Hotel saved  (cost < ₹2.5k)   → accommodation_taste pulled toward 2
Hotel saved  (source = "rag") → immersion_style pulled toward 2  (local preference)

Wishlist add  ("trek")         → adventure interest +0.1  (keyword map match)
Wishlist add  (destination:    → top 2 destination interest tags +0.1
               Kerala)           e.g. nature, wellness, food

Plan saved    (destination)    → top 2 interest tags +0.08  (20% blend)

Plan refined  (any feedback)   → TASTE_DELTA_SYSTEM extracts explicit signals
                                  merge_taste() updates dims + bumps confidence

Session end   (finalize node)  → write_memory(Mem0) for cross-device sync
```

---

## 7. Auth Flow

```
Browser                   FastAPI                      Google
  │                           │                            │
  │  Click "Sign in"           │                            │
  │──────────────────────────────────────────────────────►  │
  │◄── id_token ──────────────────────────────────────────── │
  │                           │                            │
  │  POST /api/auth/google     │                            │
  │  { id_token }             │                            │
  │──────────────────────────►│                            │
  │                           │  verify_oauth2_token()     │
  │                           │───────────────────────────►│
  │                           │◄── {sub, email, name} ──── │
  │                           │                            │
  │                           │  upsert_user() → saves.db  │
  │                           │  create_app_token()        │
  │                           │  JWT(sub, email, exp=7d)   │
  │◄── {access_token, user} ──│                            │
  │                           │
  │  GET /api/profile          │
  │  Authorization: Bearer JWT │
  │──────────────────────────►│
  │                           │  get_current_user()        │
  │                           │  decode_app_token() → HS256│
  │◄── {profile, taste} ──────│

Token details:
  Algorithm: HS256
  Secret:    JWT_SECRET env var  (default "change-me-in-production")
  Expiry:    7 days  (JWT_EXPIRE_MINUTES=10080)
  Claims:    {sub: user_id, email: email, exp: timestamp}
```

---

## 8. Technology Decisions — The WHY

This section explains why each major technology was chosen and what was considered and rejected.

| Technology | Chosen for | Alternative considered | Trade-off accepted |
|---|---|---|---|
| **LangGraph** | State machine with SQLite checkpointing enables HITL; conditional edges encode retry logic; graph is inspectable at every stage | LangChain Agents (no persistent state), CrewAI (too opinionated, fixed roles), raw Python (no checkpointing built in) | Steeper learning curve; debugging conditional routing is harder than linear code; LangGraph v0.3 has breaking API changes between minor versions |
| **Groq openai/gpt-oss-120b** | Fastest free-tier inference for a reasoning model; 200k tokens/day; OpenAI-compat API eases multi-provider failover wiring | GPT-4o (costly, no free tier at scale), Llama 3.3-70b (weaker on structured JSON planning tasks), Claude Haiku (great but no free tier) | 200k TPD limit exhausted in ~9 plan runs — necessitates the 4-provider failover chain |
| **LlamaIndex + Qdrant** | LlamaIndex handles chunking, embedding abstraction, and query engine in ~30 lines; Qdrant supports server-mode metadata filtering (filter by destination before vector search reduces noise dramatically) | ChromaDB (embedded-only, no cloud free tier for prod), Pinecone (paid), Weaviate (complex config for a simple use case) | Qdrant Cloud free tier has low storage (1GB); Voyage API key needed for best embeddings — Cohere as fallback degrades quality slightly |
| **SSE over WebSockets** | One-directional push is all that's needed; EventSource is browser-native; no handshake overhead; works through Vercel CDN and Railway reverse proxy without extra config | WebSockets (bidirectional — overcomplicated for read-mostly streaming), long-polling (high server load) | SSE connections hold open for the full plan generation (~30–45s); requires Railway idle timeout tuning |
| **SQLite for HITL checkpoints** | LangGraph's SqliteSaver is the native solution; zero infra; sessions persist across browser refreshes within a 24h TTL | Redis (overkill + cost for single instance), Postgres (managed DB adds complexity and cost) | Not horizontally scalable — fine for single Railway instance, but a constraint if load increases |
| **Multi-provider LLM failover** | Free-tier limits exhaust quickly; task-aware routing (Gemini for long-context, Groq for reasoning) optimises quality vs cost | Single provider + user-facing error on rate limit (bad UX), OpenRouter only (loses task routing control) | Adds ~200ms per failover; JSON format differences between providers require normalisation; Gemini needs its own SDK (native google-genai, not OpenAI-compat) |
| **Voyage/Cohere cross-encoder reranking** | Cross-encoders improve retrieval relevance 20–30% over pure vector similarity for taste-aware queries ("quiet homestay walking distance temples") | BM25 + vector hybrid (higher latency), pure vector similarity (misses nuanced preference alignment), no reranking (worse candidate quality) | Requires API keys; identity-order fallback silently degrades quality when keys unavailable |
| **Mem0 Cloud** | Cross-device persistence of taste learnings; managed; write_memory/read_memory abstraction is clean; no custom memory schema to maintain | Custom SQLite memory table (no cross-device), LangMem (less mature in 2025), building on LangGraph's own memory (tied to session TTL) | P0 gap: implemented but not wired in nodes.py — every session currently starts cold (fixing this is next sprint) |
| **FastAPI** | Async-native (needed for SSE), Pydantic type safety, auto-OpenAPI docs, lighter than Django for a pure API service | Flask (no async), Django REST Framework (heavy for an agent API), Express/Node (Python ecosystem alignment important for ML deps) | Python's GIL means true parallelism requires `ThreadPoolExecutor` for CPU/IO-bound tasks — done for RAG, places, and graph execution |
| **DeepEval** | LLM-as-judge evaluation with structured metrics (answer relevancy, RAG faithfulness, hallucination detection); supports CSV-driven batch test runs | Manual review (not repeatable), RAGAS (less Python-native), custom pytest assertions (misses semantic quality) | Groq rate limits exhaust during eval runs — need 60–90s gaps between runs; eval itself costs tokens |

---

## 9. Agentic Patterns Used

### 1. State Machine Orchestration

Each pipeline stage is a discrete LangGraph node with an explicit input/output contract via `AgentState`. Conditional edges encode business logic (critic retry, HITL routing, error fallback) as pure Python functions that inspect state. The graph is deterministic given the same state — unlike agent loop approaches where the LLM decides what to do next, here the LLM's role is bounded to each node's task.

### 2. Human-in-the-Loop (HITL)

`interrupt()` in the `human_feedback` node pauses graph execution after the plan has been generated and critic-reviewed. The full state checkpoints to SQLite. The FastAPI handler returns the plan to the client immediately. When the user submits a change request, `/api/refine` calls `graph.invoke(Command(resume=user_feedback))` — the graph resumes from the interrupt point with no state loss, even across browser sessions (within 24h TTL).

### 3. Self-Evaluation / Critic Loop

The `critic` node red-teams the generated plan against the user's taste profile, flagging mismatches (wrong pace, skipped dietary needs, overcrowded venues). If it returns `verdict: fail`, plan_assembly is retried with the critic's issues as additional `user_feedback`. The loop is capped at 2 passes to prevent infinite cycles. This pattern means the human always reviews a plan that has already passed an automated quality gate.

### 4. Retrieval-Augmented Generation (RAG)

Knowledge is retrieved before the synthesis LLM call rather than embedded in the system prompt. This keeps prompts short, allows destination-specific filtering, and grounds the plan in verified facts. Query expansion generates persona-specific retrieval queries (a toddler family gets different queries than a solo backpacker for the same destination). A retrieval quality gate re-runs risk-focused queries if the initial synthesis lacks safety content.

### 5. Parallel Tool Pre-fetching

Web search and weather API calls are dispatched in a `ThreadPoolExecutor` before the synthesis LLM call. This hides ~6s of I/O latency behind parallel execution. The same pattern is used for RAG queries (up to 7 parallel Qdrant requests) and place search (up to 32 parallel Google Maps requests for the booking funnel).

### 6. Graceful Degradation

Every external dependency has a defined fallback:
- RAG failure → proceeds with "No destination-specific content" message
- Tavily rate limit → DuckDuckGo fallback
- Voyage/Cohere unavailable → identity-order fallback for candidates
- Mem0 unavailable → session starts without past memories
- All LLM providers exhausted → `error_node` with user-friendly message

The system always produces a plan. Degraded quality is acceptable; total failure is not.

### 7. Taste Profile Learning with Confidence Tracking

The taste model is 7 scalar dimensions plus 10 interest scores, each with a per-dimension confidence (0.0–1.0, starts at 0.1, grows +0.2 per refinement session). This enables targeted clarification: the `clarify` node generates questions only for dimensions with confidence below 0.5. Signals accumulate from every user action — saves, refinements, wishlist adds — so the profile improves passively without explicit preference surveys.

### 8. Task-Aware Multi-Provider Routing

Rather than a simple fallback chain, provider selection is task-aware. Long-context synthesis tasks route to Gemini first (better at 10k+ token contexts). Reasoning-heavy tasks (plan assembly, critic) route to Groq first. This means the system uses the best tool for each job while still degrading gracefully when any provider is rate-limited.

---

## 10. Known Trade-offs and Gaps

Being explicit about gaps is part of good engineering practice — it demonstrates that the design was deliberate, not accidental.

| Gap | Priority | User impact | Root cause | Fix |
|---|---|---|---|---|
| **Mem0 not wired in nodes.py** | P0 | Every session starts cold; no cross-session personalisation despite the infrastructure being built | `memory.py` is complete but `read_memories()` never called in `persona_classification` | One-line call in persona_classification node; already wired in finalize |
| **similarity_top_k=5 in tools.py** | P1 | 75% of indexed knowledge hidden on tool-calling path; retrieval recall poor | tools.py `knowledge_base_query()` uses top_k=5; indexer.py uses top_k=12 (inconsistency) | Update tools.py to match indexer.py |
| **36 destinations unindexed** | P2 | Those 36 destinations fall back to LLM general knowledge — lower quality plans | Knowledge file creation is manual; only 18 of 54 destinations have curated docs | Batch-generate via Cerebras using `generate_knowledge_prompt.txt` template |
| **Taste learning is end-of-session only** | P2 | Ranker uses initial taste profile; within-session refinement signals ignored by candidate scoring | `finalize` node extracts deltas after HITL loop, too late to affect ranking | Wire `merge_taste()` after each plan refinement inside `plan_assembly` |
| **No error terminal node in original design** | P2 | When a node sets `state["error"]`, downstream nodes receive empty state → garbage output; now fixed | Original graph had no explicit error routing | Error node added; `_error_router` decorator intercepts at conditional edges |
| **CORS origins hardcoded** | P3 | Production URLs must be kept in sync with `FRONTEND_URL` env var manually | `allow_origins` list constructed at startup from env | Low risk for single-domain deployment |
| **Reranking requires paid API keys** | P3 | Without Voyage/Cohere keys, candidates served in identity order — reduces itinerary quality | Cross-encoder reranking is the best quality option but has no free tier | Identity fallback is functional; add open-source cross-encoder (e.g. BGE-Reranker) as second fallback |
| **No token-size pre-check** | P3 | Context overflow wastes one provider attempt before failing over | `_call_llm` doesn't estimate prompt size before sending | Rough pre-check: if `len(prompt) > provider_limit * 3`, skip to next provider |

---

*Generated 2026-06-12. Stack versions: LangGraph 0.3.x, LlamaIndex 0.10.x, FastAPI 0.115.x, Python 3.12.*
