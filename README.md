# TripSathi — AI Travel Planning Agent

A conversational AI agent that helps users research, plan, and book trips across India. Built as a portfolio project for the AI Agent Bootcamp.

**Live demo:** [tripsathi-app.vercel.app](https://tripsathi-app.vercel.app)

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | Groq (`openai/gpt-oss-120b`) with Cerebras → Gemini → OpenRouter fallback |
| RAG / Indexing | LlamaIndex + ChromaDB |
| Orchestration | LangGraph state machine |
| Tools | Tavily (web search), OpenWeatherMap, Google Maps |
| Auth | Google OAuth + JWT |
| Voice | Whisper STT |
| Evaluation | DeepEval |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Backend | FastAPI + Python 3.12 |
| Deployment | Railway (backend) + Vercel (frontend) |

---

## Architecture

```
User input
    │
    ▼
TripInputStepper (React)
    │  SSE stream
    ▼
FastAPI /api/plan/stream
    │
    ▼
LangGraph state machine
    ├── input_processor   — parse intent, expand query
    ├── research          — parallel RAG + web search + weather
    ├── synthesis         — persona-aware destination ranking
    ├── plan_assembly     — day-by-day itinerary generation
    ├── critic            — self-review + retry if quality low
    └── done              — stream plan to client
```

RAG knowledge base covers 54 destinations with curated markdown docs and 50 YouTube video transcripts indexed into ChromaDB.

### Key design decisions

| Decision | Choice | Why |
|---|---|---|
| Orchestration | LangGraph state machine | SQLite checkpointing enables HITL pause/resume; conditional edges encode retry logic cleanly |
| LLM | Groq + 3-provider failover | 200k tok/day free tier; task-aware routing (Groq for reasoning, Gemini for long-context synthesis) |
| Vector store | LlamaIndex + Qdrant Cloud | Metadata filtering by destination before vector search; cloud free tier; no self-hosted infra |
| Streaming | SSE over WebSockets | One-directional push; browser-native EventSource; works through Vercel CDN without WS upgrade |
| Memory | 3-layer model | LangGraph checkpoints (session HITL), TasteProfile SQLite (permanent preferences), Mem0 Cloud (cross-device) |
| Eval | DeepEval + GEval | GEval (plan quality, 4–7 criteria/case) + RAG metrics (Faithfulness, AnswerRelevancy, ContextualRelevancy) + 3 custom BaseMetric (PersonalizationDelta, TasteAdherence, ConstraintAdherence) |
| Observability | Arize Phoenix | OpenInference auto-instrumentors for LangGraph + LlamaIndex + OpenAI; manual OTel spans for tool calls |

Full architecture document with state machine diagrams, RAG pipeline, failover chain, auth flow, and known trade-offs: **[specs/backend_architecture.md](specs/backend_architecture.md)**

---

## Quick Start

**Prerequisites:** Python 3.12, Node.js 18+, API keys (see `backend/.env.example`)

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example .env         # fill in your API keys
uvicorn main:app --reload
```

API available at `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

UI available at `http://localhost:5173`.

---

## Project Structure

```
Agent/
├── backend/          # FastAPI + LangGraph agent server
│   ├── rag/         # RAG indexing + destination knowledge base
│   └── tests/       # Unit + integration test suite (8 files, ~150 tests)
├── frontend/         # React + Vite chat UI
│   └── src/
│       ├── components/  # UI components organized by feature
│       ├── pages/       # Route-level pages
│       ├── lib/         # Utilities + static data maps
│       └── services/    # API client
├── specs/            # Architecture, MVP, and UX specifications
└── data/             # DeepEval evaluation datasets
```

---

## Evaluation

Three-tier eval suite — regex smoke tests, LLM-as-judge GEval, and RAG-layer metrics:

```bash
cd backend

# Run a single case
python run_eval_deepeval.py BASE-KL

# Run specific cases
python run_eval_deepeval.py BASE-KL A-KL-01 B-PU-01

# Run all 10 cases
python run_eval_deepeval.py

# Named suites
python run_eval_deepeval.py --suite personalization   # PersonalizationDelta, TasteAdherence, ConstraintAdherence
python run_eval_deepeval.py --suite refinement        # HITL loop: plan v1 → user feedback → plan v2
python run_eval_deepeval.py --suite all               # everything above + all 10 cases
```

**Metrics per case:**
- GEval (4–7 criteria, `GroqJudge` / `gpt-oss-120b`) — semantic plan quality: routing, constraints, implicit local knowledge
- `FaithfulnessMetric` — plan does not contradict retrieved RAG context (hallucination check)
- `AnswerRelevancyMetric` — plan addresses the user's actual request
- `ContextualRelevancyMetric` — retrieved RAG chunks are relevant to the query (retriever quality signal)

RAG metrics use `SimpleGroqJudge` (`llama-3.3-70b-versatile`) — required for schema-structured output that DeepEval's built-in metrics expect.

**10 test cases** across Kerala, Puri, and Guwahati: BASE (baseline), A-series (explicit constraints), B-series (implicit local knowledge).

Fast regex smoke test (no API keys, offline):
```bash
python run_eval.py            # BASE-PU and BASE-GW
python run_eval.py BASE-PU    # specific case
```

---

## Deployment

- **Backend:** Railway — root directory `Agent/backend`, builds from `Procfile`
- **Frontend:** Vercel — pre-built deploy (see `frontend/README.md` for the exact commands)
