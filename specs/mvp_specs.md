# MVP Technical Specifications
# TripSathi — Sprint 2 (deadline: May 31)

## Development Requirements

### Environment

| Requirement | Version / Notes |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ (for React/Vite frontend) |
| Package manager | `pip` + `venv` for Python; `npm` for frontend |
| OS | Windows 11 (dev machine) — use PowerShell or Git Bash |

### Python Dependencies

```
anthropic>=0.25.0
langgraph>=0.2.0
langchain-core>=0.2.0
llama-index>=0.10.0
llama-index-vector-stores-chroma>=0.1.0
chromadb>=0.5.0
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
python-dotenv>=1.0.0
pydantic>=2.0.0
```

### Node / Frontend Dependencies

```json
{
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

shadcn/ui components needed: `Button`, `Input`, `Textarea`, `Card`, `Badge`, `Separator`

### Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
```

Place in `backend/.env`. Never commit.

### Project Structure

```
tripsathi/
├── backend/
│   ├── .env
│   ├── main.py              # FastAPI app
│   ├── graph.py             # LangGraph graph definition
│   ├── nodes.py             # Node functions (persona_classification, destination_intelligence, plan_assembly)
│   ├── state.py             # TripSathiState TypedDict
│   ├── prompts.py           # System prompts for all 4 LLM calls
│   ├── rag/
│   │   ├── indexer.py       # LlamaIndex build + load
│   │   └── knowledge/       # Destination markdown files
│   │       ├── kerala.md
│   │       ├── puri.md
│   │       └── guwahati.md
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── OnboardingPage.tsx
│   │   │   └── ChatPage.tsx
│   │   └── components/
│   │       ├── OnboardingForm.tsx
│   │       ├── PlanDisplay.tsx
│   │       └── ChatInput.tsx
│   ├── package.json
│   └── vite.config.ts
└── data/
    └── evaluations_data.csv  # existing eval test cases
```

---

## Integration Specifications

### Claude API (Anthropic)

**SDK:** `anthropic` Python package  
**Auth:** `ANTHROPIC_API_KEY` env var  
**Model:** `claude-sonnet-4-6`  
**Pattern:** Synchronous `.messages.create()` — all 4 calls are blocking

**Structured output pattern** (used for Call 1 and Call 4):
```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=4096,
    system=SYSTEM_PROMPT,
    messages=[{"role": "user", "content": user_message}]
)
raw = response.content[0].text
# Strip markdown code fences if present
if raw.startswith("```"):
    raw = raw.split("```")[1]
    if raw.startswith("json"):
        raw = raw[4:]
result = json.loads(raw.strip())
```

**On JSON parse failure:** retry once with an explicit instruction appended. On second failure: raise to FastAPI error handler.

---

### LlamaIndex + Chroma

**Index build** (run once, persists to disk):
```python
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader
from llama_index.vector_stores.chroma import ChromaVectorStore
import chromadb

chroma_client = chromadb.PersistentClient(path="./data/chroma_db")
collection = chroma_client.get_or_create_collection("tripsathi")
vector_store = ChromaVectorStore(chroma_collection=collection)

documents = SimpleDirectoryReader("./rag/knowledge/").load_data()
index = VectorStoreIndex.from_documents(documents, vector_store=vector_store)
```

**Query at runtime** (inside destination_intelligence node):
```python
query_engine = index.as_query_engine(similarity_top_k=5)
# For each expanded query:
results = [query_engine.query(q) for q in expanded_queries]
retrieved_content = [str(r) for r in results]
```

**Index load** (FastAPI startup — if Chroma DB already exists):
```python
index = VectorStoreIndex.from_vector_store(vector_store)
```

---

### FastAPI — CORS Config

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Data Flow Specifications

### TripSathiState (state.py)

```python
from typing import TypedDict, Optional

class TripSathiState(TypedDict):
    # ── Input-only (set by FastAPI, never mutated by nodes) ──────────────────
    destination: str
    trip_parameters: dict          # {duration_nights: int, budget_total: int,
                                   #  travel_dates: str, group_size: int}
    onboarding_answers: list[dict] # [{question: str, answer: str}, ...]

    # ── Agent-owned (written by nodes) ────────────────────────────────────────
    user_profile: Optional[dict]        # written by Node 1
    research_synthesis: Optional[dict]  # written by Node 2/3
    plan: Optional[dict]                # updated by Plan Assembly loop

    # ── HITL refinement fields ────────────────────────────────────────────────
    user_feedback: Optional[str]        # latest change request; None after each refine
    refinement_count: int               # increments each plan generation
    refinement_history: list[str]       # all feedback messages in session

    # ── Control/meta ──────────────────────────────────────────────────────────
    awaiting_feedback: bool
    current_node: str
    error: Optional[str]
```

**Initial state** (set by FastAPI on `POST /api/plan`):
```python
initial_state = TripSathiState(
    destination=destination,
    trip_parameters=trip_parameters,
    onboarding_answers=onboarding_answers,
    user_profile=None,
    research_synthesis=None,
    plan=None,
    user_feedback=None,
    refinement_count=0,
    refinement_history=[],
    awaiting_feedback=False,
    current_node="persona_classification",
    error=None,
)
```

---

### LLM Call Prompts (prompts.py)

**Call 1 — Persona Classification:**
```python
PERSONA_CLASSIFICATION_SYSTEM = """
You are a travel persona classifier. Given onboarding answers from a traveller, 
extract a structured user profile.

Respond ONLY with valid JSON matching this exact schema:
{
  "persona_type": "family_with_kids | solo | friend_group | pilgrimage | weekend_escapee",
  "autonomy_mode": "L1 | L2 | L3",
  "constraints": {
    "kid_ages": [list of ints, or null],
    "elderly": true/false,
    "mobility_limited": true/false,
    "dietary_restrictions": [list of strings],
    "budget_sensitivity": "low | medium | high",
    "pace": "slow | moderate | fast",
    "language_preference": "english | hindi | mixed"
  }
}

L1 = wants full plan done for them
L2 = wants plan with options to choose
L3 = wants suggestions, makes all decisions

Be precise: if user says "2-year-old toddler" set kid_ages=[2]. 
If user says "elderly parents with knee issues" set elderly=true, mobility_limited=true.
"""
```

**Call 2 — RAG Query Expansion:**
```python
QUERY_EXPANSION_SYSTEM = """
You are a travel research query generator. Given a destination, traveller profile, and trip parameters,
generate 4–6 specific retrieval queries to search a travel knowledge base.

Focus on:
- Destination-specific routing and logistics
- Persona-relevant activities (family, elderly, budget, dietary)
- Local operational risks (queues, timing, operators, food availability)
- Seasonal and practical considerations

Respond ONLY with a JSON array of strings: ["query1", "query2", ...]
"""
```

**Call 3 — Research Synthesis:**
```python
RESEARCH_SYNTHESIS_SYSTEM = """
You are an expert Indian travel researcher. Synthesize retrieved travel knowledge 
into structured destination intelligence for this specific traveller.

Apply the user profile as a filter: surface only what's relevant to their constraints.
Proactively flag local risks the traveller didn't ask about — this is essential.

Respond ONLY with valid JSON:
{
  "routing": "string — best route with reasoning (e.g. why Munnar before Alleppey)",
  "key_places": ["place1", "place2", ...],
  "local_risks": ["risk1 with mitigation", "risk2 with mitigation", ...],
  "seasonal_context": "string — current season implications",
  "implicit_warnings": ["warning1", "warning2", ...]
}
"""
```

**Call 4 — Plan Generation (initial):**
```python
PLAN_GENERATION_SYSTEM = """
You are an expert Indian travel planner creating a personalised day-by-day itinerary.

Apply ALL constraints from the user profile. Do not treat any constraint as decoration:
- kid_ages: age-appropriate activities and pacing
- elderly/mobility_limited: accessible venues, reduced pace, early dinners
- budget_sensitivity: hotel tier, dining choices, activity alternatives
- dietary_restrictions: meal options at each stop

Include proactive warnings the traveller didn't ask about.

Respond ONLY with valid JSON:
{
  "days": [
    {
      "day_number": 1,
      "location": "string",
      "activities": ["activity with reasoning"],
      "meals": {"breakfast": "option", "lunch": "option", "dinner": "option"},
      "notes": "pacing notes, warnings for this day"
    }
  ],
  "hotels": [
    {
      "location": "string",
      "name": "string",
      "reasoning": "why this property for this group",
      "approx_cost_per_night": "number"
    }
  ],
  "budget_breakdown": {
    "accommodation": "number",
    "transport": "number",
    "activities": "number",
    "food": "number",
    "total": "number"
  },
  "warnings": ["critical warnings the traveller must know before booking"]
}
"""

PLAN_REFINEMENT_SYSTEM = """
You are refining an existing travel plan based on user feedback.

You have:
1. The current plan (JSON)
2. The user's change request
3. History of all previous changes
4. The original user profile with all constraints

Apply the requested change. Keep all other elements unchanged unless the change requires it.
Maintain all original constraints throughout — do not relax them.
Add a note in the relevant day's notes field explaining what changed and why.

If the change creates a logistics issue (e.g. dropping Kochi increases airport travel time),
add a warning to the warnings array.

Respond ONLY with the complete updated plan JSON (same schema as original plan).
"""
```

---

## Platform Implementation Requirements (LangGraph)

### Graph Definition (graph.py)

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from state import TripSathiState
from nodes import persona_classification, destination_intelligence, plan_assembly

def build_graph():
    builder = StateGraph(TripSathiState)
    
    builder.add_node("persona_classification", persona_classification)
    builder.add_node("destination_intelligence", destination_intelligence)
    builder.add_node("plan_assembly", plan_assembly)
    
    builder.set_entry_point("persona_classification")
    builder.add_edge("persona_classification", "destination_intelligence")
    builder.add_edge("destination_intelligence", "plan_assembly")
    
    # plan_assembly handles its own loop via interrupt() — no conditional edge needed
    # graph terminates when plan_assembly returns without calling interrupt()
    builder.add_edge("plan_assembly", END)
    
    checkpointer = MemorySaver()
    return builder.compile(checkpointer=checkpointer)

graph = build_graph()
```

### Node Functions (nodes.py)

```python
from langgraph.types import interrupt
import json
from anthropic import Anthropic
from prompts import (PERSONA_CLASSIFICATION_SYSTEM, QUERY_EXPANSION_SYSTEM,
                     RESEARCH_SYNTHESIS_SYSTEM, PLAN_GENERATION_SYSTEM, PLAN_REFINEMENT_SYSTEM)

client = Anthropic()

def persona_classification(state: TripSathiState) -> dict:
    answers_text = "\n".join([f"Q: {a['question']}\nA: {a['answer']}" 
                               for a in state["onboarding_answers"]])
    if state.get("destination"):
        answers_text += f"\nDestination: {state['destination']}"
    
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=PERSONA_CLASSIFICATION_SYSTEM,
        messages=[{"role": "user", "content": answers_text}]
    )
    user_profile = json.loads(response.content[0].text)
    return {"user_profile": user_profile, "current_node": "destination_intelligence"}


def destination_intelligence(state: TripSathiState) -> dict:
    from rag.indexer import get_query_engine
    
    # Call 2: expand queries
    expansion_prompt = f"""
    Destination: {state['destination']}
    Traveller profile: {json.dumps(state['user_profile'])}
    Trip: {json.dumps(state['trip_parameters'])}
    """
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        system=QUERY_EXPANSION_SYSTEM,
        messages=[{"role": "user", "content": expansion_prompt}]
    )
    expanded_queries = json.loads(response.content[0].text)
    
    # LlamaIndex retrieval (local variable — not state)
    query_engine = get_query_engine()
    retrieved_content = []
    for q in expanded_queries:
        result = query_engine.query(q)
        if result and str(result).strip():
            retrieved_content.append(str(result))
    
    # Call 3: synthesize
    synthesis_prompt = f"""
    Destination: {state['destination']}
    Traveller profile: {json.dumps(state['user_profile'])}
    Trip parameters: {json.dumps(state['trip_parameters'])}
    Retrieved knowledge:
    {chr(10).join(retrieved_content) if retrieved_content else "No destination-specific content retrieved. Use your general knowledge and flag gaps."}
    """
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=RESEARCH_SYNTHESIS_SYSTEM,
        messages=[{"role": "user", "content": synthesis_prompt}]
    )
    research_synthesis = json.loads(response.content[0].text)
    return {"research_synthesis": research_synthesis, "current_node": "plan_assembly"}


def plan_assembly(state: TripSathiState) -> dict:
    APPROVAL_SIGNALS = {"looks good", "approve", "perfect", "that's fine", 
                        "yes", "ok", "done", "great", "thanks", "good"}
    
    # Check if resuming from interrupt with user feedback
    if state.get("user_feedback") is not None:
        feedback = state["user_feedback"]
        
        # Check for approval
        if (feedback.lower().strip() in APPROVAL_SIGNALS or 
                state["refinement_count"] >= 5):
            return {"awaiting_feedback": False, "current_node": "done"}
        
        # Refine the plan
        refinement_prompt = f"""
        Current plan: {json.dumps(state['plan'])}
        User change request: {feedback}
        Previous changes: {json.dumps(state['refinement_history'])}
        User profile: {json.dumps(state['user_profile'])}
        Trip parameters: {json.dumps(state['trip_parameters'])}
        """
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=PLAN_REFINEMENT_SYSTEM,
            messages=[{"role": "user", "content": refinement_prompt}]
        )
        updated_plan = json.loads(response.content[0].text)
        refinement_history = state["refinement_history"] + [feedback]
        new_state = {
            "plan": updated_plan,
            "user_feedback": None,
            "refinement_count": state["refinement_count"] + 1,
            "refinement_history": refinement_history,
            "awaiting_feedback": True,
            "current_node": "awaiting_feedback"
        }
        interrupt({"plan": updated_plan, "status": "awaiting_feedback"})
        return new_state
    
    # Initial plan generation
    generation_prompt = f"""
    Destination: {state['destination']}
    Research: {json.dumps(state['research_synthesis'])}
    User profile: {json.dumps(state['user_profile'])}
    Trip parameters: {json.dumps(state['trip_parameters'])}
    """
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=PLAN_GENERATION_SYSTEM,
        messages=[{"role": "user", "content": generation_prompt}]
    )
    plan = json.loads(response.content[0].text)
    new_state = {
        "plan": plan,
        "refinement_count": 1,
        "awaiting_feedback": True,
        "current_node": "awaiting_feedback"
    }
    interrupt({"plan": plan, "status": "awaiting_feedback"})
    return new_state
```

### FastAPI Endpoints (main.py)

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from uuid import uuid4
from langgraph.types import Command
from graph import graph

app = FastAPI()
# ... CORS middleware ...

class PlanRequest(BaseModel):
    destination: str
    trip_parameters: dict   # {duration_nights, budget_total, travel_dates, group_size}
    onboarding_answers: list[dict]

class RefineRequest(BaseModel):
    thread_id: str
    user_feedback: str

@app.post("/api/plan")
async def start_plan(req: PlanRequest):
    thread_id = str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    
    initial_state = { ...TripSathiState fields... }
    
    result = graph.invoke(initial_state, config=config)
    
    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])
    
    return {
        "plan": result["plan"],
        "thread_id": thread_id,
        "status": "awaiting_feedback" if result["awaiting_feedback"] else "done"
    }

@app.post("/api/refine")
async def refine_plan(req: RefineRequest):
    config = {"configurable": {"thread_id": req.thread_id}}
    
    result = graph.invoke(
        Command(resume=req.user_feedback),
        config=config
    )
    
    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])
    
    return {
        "plan": result["plan"],
        "thread_id": req.thread_id,
        "status": "awaiting_feedback" if result.get("awaiting_feedback") else "done"
    }
```

---

## Human-in-Loop Requirements

### HITL Flow Contract

| Step | FastAPI call | LangGraph action | React action |
|---|---|---|---|
| Start | `POST /api/plan` | graph runs → `interrupt()` | Render plan; show chat input |
| Refine | `POST /api/refine` with feedback text | graph resumes → refines → `interrupt()` again | Re-render updated plan; keep chat input |
| Approve | `POST /api/refine` with approval phrase | graph resumes → detects approval → terminates | Show final plan; hide chat input; show "Plan finalised" |
| Max refinements | Automatic | graph detects `refinement_count >= 5` → terminates | Show final plan + "Maximum refinements reached" |

### React Chat Page Behaviour

```
State: { plan, thread_id, status }

if status === "awaiting_feedback":
  → render PlanDisplay(plan)
  → render ChatInput(placeholder="Suggest a change, or type 'looks good' to approve")
  → on submit: POST /api/refine → update state

if status === "done":
  → render PlanDisplay(plan)
  → render "Plan finalised ✓" badge
  → render "Copy plan" button
  → hide ChatInput
```

---

## Quality Risk Testing Specifications

### The Critical Test: A-KL-01 vs BASE-KL

After building, run these two inputs back-to-back through the system:

**BASE-KL input:**
```
Plan a 5-night Kerala trip for 2 adults and a 5-year-old. Budget ₹1 lakh. 
First time visiting Kerala. Want to cover the best of what Kerala offers. 
Kid gets tired easily and needs proper meal options at every stop.
```

**A-KL-01 input (toddler swap):**
```
Plan a 5-night Kerala trip for 2 adults and a 2-year-old toddler (still napping midday, 
needs high chair and soft food options). Budget ₹1 lakh. First time visiting Kerala. 
Want to cover the best of what Kerala offers. Kid gets tired easily and needs proper 
meal options at every stop.
```

**Pass criteria (Angle A):**
- [ ] Midday rest block (1-2 PM) appears in A-KL-01 plan but not BASE-KL
- [ ] Activities reduced or changed in A-KL-01 (Eravikulam NP removed or flagged)
- [ ] A-KL-01 plan mentions high chair, soft food (idli, plain rice, dal) — BASE-KL does not
- [ ] Overnight houseboat ruled out more strongly in A-KL-01 than BASE-KL

**Pass criteria (Angle B — from RAG):**
- [ ] Houseboat operator trust warning appears in the plan
- [ ] Hotel location reasoning provided for Alleppey (central vs highway)

### Full Eval Suite

After A-KL-01 passes, run all 10 CSV test cases from `data/evaluations_data.csv` through the system. Compare outputs to the `actual_output` column (existing Claude.ai results). System should match or exceed quality.

### Measurement

Manual scoring using the existing 1–5 scale:
- 5 = Would use as-is
- 4 = Good with minor tweaks
- 3 = Needs editing
- 2 = Mostly wrong
- 1 = Unusable

**Sprint 2 pass bar:** All 3 baselines ≥ 4/5. At least 5/7 variation cases ≥ 4/5.

---

## Error Handling Requirements

| Error condition | Handling |
|---|---|
| `ANTHROPIC_API_KEY` not set | FastAPI startup fails with clear error message |
| Claude API call fails (network/rate limit) | Retry once after 2s. On second failure: set `state["error"]`, return 500 |
| JSON parse failure on LLM output | Retry once with explicit JSON instruction appended. On second failure: return 500 |
| LlamaIndex returns 0 chunks | Proceed with empty retrieved_content. Synthesis prompt instructs LLM to flag knowledge gap |
| LangGraph graph error | Catch exception in FastAPI, return 500 with error message |
| Unknown thread_id on `/api/refine` | MemorySaver will raise — catch, return 404 "Session not found" |
| Chroma DB not found on startup | Log warning, attempt to rebuild index from `rag/knowledge/`. Fail with clear message if `knowledge/` is empty |

---

## Success Criteria and Testing

### Definition of Done — Sprint 2

- [ ] `python main.py` starts FastAPI server on port 8000 without errors
- [ ] `npm run dev` starts React on localhost:5173 without errors
- [ ] User completes onboarding form → `/api/onboard` returns a valid user_profile JSON
- [ ] User submits a Kerala trip request → `/api/plan` returns a structured plan within 60 seconds
- [ ] A-KL-01 plan is materially different from BASE-KL across pacing, activities, food (see above)
- [ ] Plan includes at least 1 Angle B warning not in the request (local risk)
- [ ] `POST /api/refine` with "change day 3" returns updated plan within 30 seconds
- [ ] `POST /api/refine` with "looks good" returns `{status: "done"}`
- [ ] Error in Node 1 returns 500 with `{"detail": "persona_classification_failed"}`
- [ ] All 3 baseline test cases (BASE-KL, BASE-PU, BASE-GW) produce plans scoring ≥ 4/5

### RAG Corpus Minimum (before testing)

The `backend/rag/knowledge/` directory must contain at minimum:

**kerala.md** — must include:
- Munnar + Alleppey routing logic
- Houseboat booking trust dynamics (cold-approach vs hotel operator)
- Alleppey hotel location: central vs highway-adjacent
- Kid-friendly food options at each stop
- Eravikulam NP terrain suitability

**guwahati.md** — must include:
- Kamakhya darshan: VIP queue pricing (₹500-700), general queue wait times, steep steps
- Shillong day trip timing math: 6 hrs travel, depart by 7 AM, missed dinner risk
- Brahmaputra: public ferry vs private cruise comparison

**puri.md** — must include:
- Jagannath temple: non-Hindu entry restriction, rooftop alternative
- Chilika cab inflation: ₹3000-5000 above fair rate, book via hotel mitigation
- Child food scarcity: local food is largely fish-based, packaged food list

---

## Platform Selection Notes

**Platform: LangGraph (Python)**

Chosen because:
- Full control over state management — `TripSathiState` TypedDict is the exact data contract for testing Context Awareness Failure
- Native `interrupt()` + `MemorySaver` + `Command(resume=...)` for HITL — no workarounds needed
- Python ecosystem: Anthropic SDK, LlamaIndex, Chroma all integrate natively
- Architecture spec already designed for LangGraph — no translation needed

**Trade-offs accepted:**
- More code than n8n (all integration logic is explicit Python)
- No visual debugger — debug via logging and FastAPI /docs
- MemorySaver is in-process (sessions lost on restart) — acceptable for Sprint 2 dev/demo

**Sprint 3 migration path:**
- Swap `MemorySaver` → `SqliteSaver` for persistent sessions (2-line change)
- Add LangSmith tracing (1 env var, 0 code changes)
- Promote Destination Intelligence Node to agent by adding retrieval quality conditional edge
