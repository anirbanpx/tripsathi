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

DeepEval test suite covering query expansion, RAG retrieval quality, and plan synthesis:

```bash
cd backend
python run_eval_deepeval.py
```

Results: 6/6 on A-KL-01 (Kerala), 5/6 on BASE-PU (Puri), 7/7 on BASE-GW (Gateway).

---

## Deployment

- **Backend:** Railway — root directory `Agent/backend`, builds from `Procfile`
- **Frontend:** Vercel — pre-built deploy (see `frontend/README.md` for the exact commands)
