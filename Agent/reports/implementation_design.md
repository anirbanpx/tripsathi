# Implementation Design

## Learning Since Last Interaction

### User Research Insights

No external user research conducted — product is pre-launch with no active users. The evaluation dataset was grounded in the product owner's own travel experience: three real trips (Kerala family, Puri mixed group, Guwahati elderly parents) provided authentic ground truth for what a good plan looks like and where plans fail in the field.

This means the risk model is validated from lived experience rather than interview data. The known failure modes (missed Kamakhya VIP darshan, Shillong return causing missed dinner, houseboat operator trust gap) are real, not hypothetical. The constraint space (elderly pace, kid age, dietary restrictions, budget sensitivity) is grounded in actual group composition decisions.

**Implication for implementation:** The product owner is the initial test user. Sprint 2 definition of done = the product owner can use it to plan a real trip and say "yes, I would use this output." Sprint 3 is when external user validation starts.

---

### Evaluation Testing Results

All 10 test cases executed and scored interactively (Claude.ai, claude-sonnet-4-6). Results exceeded the 5/7 pass bar: **6/7 variation cases passed**.

| Test Case | Score | Outcome |
|---|---|---|
| BASE-KL | 4/5 | Pass — routing correct, hotel location flagged, kid food addressed |
| BASE-PU | 5/5 | Pass — all 3 implicit risks surfaced unprompted |
| BASE-GW | 5/5 | Pass — Shillong timing math and Kamakhya queue both surfaced |
| A-KL-01 (toddler) | 5/5 | Pass — age 2 vs 5 produced materially different output |
| A-KL-02 (elderly) | 5/5 | Pass — mobility constraint reflected in activity and hotel selection |
| A-KL-03 (budget) | 5/5 | Pass — hotel tier dropped, local dining recommended, strong delta from baseline |
| A-PU-01 (no elderly) | 4/5 | Pass — pacing correctly relaxed without elderly |
| B-KL-01 (implicit) | 3/5 | **Fail** — houseboat recommended without operator trust warning |
| B-GW-01 (implicit) | 5/5 | Pass — both Shillong timing and Kamakhya queue surfaced unprompted |
| B-PU-01 (implicit) | 5/5 | Pass — temple rules, cab inflation, child food all surfaced |

**Key findings:**
- Angle A (explicit constraints): perfect — all 4 cases passed cleanly. Base model handles persona-based adaptation well.
- Angle B (implicit local knowledge): 2/3 passed. The single failure (B-KL-01) was specific: the base model knows to avoid houseboat for young children but does not know the *transactional* trust dynamics (cold-approach operator risk, booking through hotel is safer). This is an operational/commercial knowledge gap, not a destination knowledge gap.
- Budget-conscious signal (A-KL-03) produced the strongest delta of all test cases — hotel tier, dining logic, and activity framing all changed. Budget_sensitivity is the most powerful soft constraint in the schema.

**Sprint 2 go/no-go:** Green. Core capability is real. Proceed to build.

---

### Prompt Experimentation Findings

Testing was done entirely in Claude.ai (no API key, no custom prompts — base model with conversational input). This means all evaluation results represent the **base model ceiling** — no system prompt engineering yet.

Two things this reveals:
1. **The base prompt will be strong.** The system prompt for Sprint 2 (travel planner + Indian context + proactive risk surfacing) can lean into what already works well in the base model. Not starting from scratch.
2. **RAG is the real unlock for Angle B.** The one failure (B-KL-01 houseboat trust dynamics) won't be fixed by prompt engineering — it requires RAG content. The base model doesn't have this knowledge regardless of how the prompt is framed.

One implementation insight from testing: the model performs better when constraints are surfaced as structured facts, not buried in narrative. The onboarding schema (explicit fields: `kid_ages`, `elderly`, `mobility_limited`) reflects this — persona classification needs to extract discrete, queryable constraints, not preserve natural language prose.

---

### Implementation Progress Status

**No code written.** All Sprint 2 design artifacts are now complete:

| Artifact | Status | Location |
|---|---|---|
| Problem definition + integration landscape | Complete | `reports/problem_definition.md` |
| Evaluation design + 10 test cases | Complete, all scored | `reports/evaluation_design_report.md`, `data/evaluations_data.csv` |
| Context management design (schemas, data flow, waste analysis) | Complete | `reports/context_management_design.md` |
| Architecture spec (agent control loop, HITL, TypedDict) | Complete | `specs/architecture_spec.md` |
| MVP specs | **This workflow** | `specs/mvp_specs.md` |
| Implementation design | **This workflow** | `reports/implementation_design.md` |

**No deviations from original Sprint 2 plan.** Scope is exactly as locked:
- Module 1: Onboarding → Persona Classification
- Module 2: Research + Planning pipeline (RAG → Synthesis → Plan)
- HITL refinement loop (added after architecture workflow)
- React web app (Vite + Tailwind + shadcn/ui), 2 pages
- FastAPI backend
- DeepEval wired to CSV test cases

---

### Updated Quality Risk Focus

**Context Awareness Failure remains the priority risk — sharpened by evaluation results.**

The evaluation data refined the risk model in two ways:

**Angle A is not the problem.** Base model handles explicit constraints well. The system prompt + structured user_profile schema will address this reliably. The architecture (user_profile flowing through LangGraph state to all nodes) is the implementation guarantee.

**Angle B has one specific gap.** Houseboat operator trust dynamics (B-KL-01) are not in base model knowledge. This is the one place where RAG injection matters most for Sprint 2. The RAG corpus must include: booking houseboat through hotel operator vs. cold-approach, overnight vs. day houseboat trust patterns, operator verification signals. Without this content in Chroma, the Angle B gap persists regardless of architecture.

**Revised risk statement for implementation:** Context Awareness Failure manifests as either (a) user_profile not correctly propagated through LangGraph nodes — an architectural/wiring failure, or (b) RAG corpus missing operational knowledge for specific destinations — a content gap. Both are addressable in Sprint 2 and both have clear test cases to verify.

---

## Delivery Context Design

### Workflow Analysis

**Where the user currently works:**
Indian leisure traveler planning a trip uses 8–10 tools across 6 phases: Instagram/YouTube (inspiration) → Google/TripAdvisor/MakeMyTrip (research) → Google Maps/WhatsApp groups (itinerary logistics) → MakeMyTrip/IRCTC/hotel sites (booking) → Google Maps (in-trip) → Instagram/WhatsApp (post-trip).

**Pain points (where to insert):**

| Pain point | Phase | Current friction |
|---|---|---|
| Zero personalization | Research → Itinerary | Every tool shows the same generic recommendations regardless of kid age, elderly pace, or budget |
| Context lost between tools | Research → Itinerary | Research done on MakeMyTrip doesn't carry to Google Maps, WhatsApp, or the booking screen |
| Missing local knowledge | Itinerary | Kamakhya queue dynamics, Shillong return timing, houseboat trust gap — not in any mainstream tool |
| No persona-aware filtering | Research | "Family-friendly + in-house restaurant + not on highway" doesn't exist as a search filter anywhere |
| Planner cognitive load | All phases | One person in the family/group does all the research — 10–20 hours per trip |

**Flow points (where to integrate seamlessly):**
- Users are comfortable with conversational input (WhatsApp-style)
- Users are comfortable with structured results they can screenshot/share
- Users expect to review and discuss recommendations before committing — the HITL loop matches this mental model naturally

**Biggest pain → target:** The research + itinerary logistics phase (steps 2–3). This is where 8–10 hours are wasted on fragmented, non-personalized search. TripSathi Sprint 2 attacks exactly this phase.

---

### Delivery Mechanism

**Platform: React web app (Vite + Tailwind + shadcn/ui)**

Rationale:
- Portfolio intent — needs to be a demonstrable, shareable URL
- Chat/results page is the natural delivery surface for conversational planning + HITL refinement
- React component library (shadcn/ui) gives clean, mobile-responsive UI without custom CSS work
- FastAPI backend is a standard REST interface — no infra complexity for Sprint 2

**Not chosen for Sprint 2:**
- WhatsApp: Meta API approval takes weeks; deferred to Sprint 3
- Chainlit: simpler but not portfolio-ready; replaced with custom React
- CLI: correct for development testing but wrong for demo/portfolio surface

---

### Interaction Model

Two-phase interaction: **Onboarding (structured, one-time)** → **Planning (conversational, iterative)**

**Phase 1 — Onboarding (5 questions, once per user):**
- Structured form on the onboarding page
- Captures persona_type, constraints, budget_sensitivity, pace, dietary restrictions
- User fills this in with their group composition before starting any trip request
- This is the highest-agency moment: the user is explicitly providing the persona context that shapes everything downstream
- Output: user_profile stored for the session

**Phase 2 — Planning (conversational, iterative):**
- User types their trip request in natural language on the chat page
- System runs the full pipeline (RAG → Synthesis → Plan) and returns an initial plan
- User reviews the plan inline and can either approve ("looks good") or request a change ("change day 3 to beach instead of Munnar")
- HITL refinement loop handles up to 5 iterations
- User approves → final plan rendered with print/share option

---

### Agency vs Autonomy Breakdown

| Task | Mode | Rationale |
|---|---|---|
| Onboarding questions | **Agency** — user fills in | Persona context is inherently personal; no system can infer it cold |
| Persona classification | **Autonomy** — LLM extracts | Mechanical extraction from structured answers; user_profile schema is explicit |
| Destination + dates | **Agency** — user types | User knows their schedule; system doesn't |
| RAG query expansion | **Autonomy** — LLM generates | Boilerplate expansion; user doesn't care how queries are formed |
| Retrieval | **Autonomy** — LlamaIndex runs | Pure utility; no judgment needed |
| Research synthesis | **Autonomy** — LLM synthesises | Summarising retrieved content; user wants the output, not the process |
| Plan generation (initial) | **Autonomy** — LLM generates | System applies all constraints; user reviews the output |
| Plan refinement | **Agency** — user drives | Only the user knows what "day 3 should be a beach day" means for their group |
| Plan approval | **Agency** — user decides | User is the expert on their own constraints; system suggests, user confirms |
| Booking execution | **Agency (Sprint 3)** | Too much trust required; deferred entirely |

**Sprint 2 principle:** Maximum autonomy for data gathering and synthesis, maximum agency for decisions that touch money or final commitment. The HITL refinement loop is the structural implementation of this principle.

---

### User Touchpoints

**Input touchpoints:**
1. Onboarding form → 5 structured questions about group composition and constraints
2. Trip request → single natural language message: "Plan a 5-night Kerala trip for 2 adults and a 2-year-old, budget ₹1 lakh"
3. Refinement messages → conversational: "Change day 3 hotel, the one you picked is in Kochi not Alleppey"

**Intermediate touchpoints (judgment points):**
1. Initial plan review → user reads the day-by-day itinerary, hotel shortlist, budget breakdown
2. Refinement chat → user asks specific changes; system applies and returns updated plan
3. Approval → user confirms the plan is final

**Output touchpoints:**
1. Initial plan: rendered inline in the chat/results page — day-by-day, hotels, budget, warnings
2. Refined plan: same layout, updated with changes highlighted or clearly re-rendered
3. Final plan: print/copy/share capability (Sprint 2: copy to clipboard; Sprint 3: PDF export, WhatsApp share)

---

### User Journey Narrative

> Ananya is planning a 5-night Kerala trip for her family — 2 adults, parents (65 and 62, mother has knee issues), and a 4-year-old. Budget ₹1.2 lakh. She's done this 3 times before with Google + MakeMyTrip and always ends up with the wrong hotel (last time was highway-adjacent in Alleppey).

> She opens TripSathi on her phone. The onboarding page asks 5 questions: trip type (family), group composition (2 adults + elderly parents + toddler), mobility constraints (knee issues, yes), dietary restrictions (vegetarian), budget sensitivity (medium — comfort matters but not luxury). Takes 2 minutes.

> She types: "Plan a 5-night Kerala trip, first time with in-laws, want to show them the best of Kerala."

> 45 seconds later, the plan appears: Munnar 2 nights → Alleppey 2 nights → Kochi 1 night. Pagoda Resort recommended (central Alleppey, not highway). Eravikulam NP flagged as "terrain unsuitable for knee condition — Top Station as car-accessible alternative." Houseboat flagged: "Book through hotel operator, not direct approach." Budget breakdown: ₹78,000 total.

> Ananya reads it and types: "The Kochi day seems rushed, can we extend Alleppey to 3 nights instead and drop Kochi?"

> The system refines: Alleppey extended to 3 nights, Kochi day removed, budget recalculated to ₹72,000. A new warning appears: "Dropping Kochi means no airport proximity on last day — Alleppey to Kochi airport is 1.5 hrs, plan departure accordingly."

> She approves. She screenshots the plan and sends it to the family WhatsApp group.

---

## Backend Design

### Technical Approach

Anirban is a technically fluent PM with a full-stack background — treating this at full architectural depth. Framing new concepts (LangGraph state machines, LlamaIndex indexing) in terms of familiar API/middleware patterns.

**Mental model for the stack:**
- FastAPI = the Express/Django layer — receives HTTP requests, routes them, returns responses
- LangGraph = a state machine middleware — defines nodes (functions) and edges (transitions), manages shared state across nodes
- LlamaIndex = a query middleware over a vector database — you index documents once, then query by semantic similarity at runtime
- Claude API = the LLM backend called via the Anthropic SDK
- MemorySaver = an in-process session store for LangGraph state — like `req.session` but for a multi-step LLM pipeline

---

### Data Flow Architecture

```
User (React)
  ↓ POST /api/onboard {onboarding_answers}
FastAPI
  → parse answers, store in session or return to client
  → return {user_profile_raw} to React for display confirmation (optional)

User (React chat page)
  ↓ POST /api/plan {destination, trip_parameters, onboarding_answers}
FastAPI
  → parse trip_parameters from natural language or structured form
  → generate thread_id = str(uuid4())
  → initialise TripSathiState
  → graph.invoke(state, config={"configurable": {"thread_id": thread_id}})

LangGraph Graph:
  Node 1 — persona_classification(state)
    → Anthropic SDK: Call 1 (claude-sonnet-4-6)
    → Input: formatted onboarding_answers
    → Output: structured user_profile JSON
    → Write user_profile to state
    → Edge → destination_intelligence

  Node 2/3 — destination_intelligence(state)
    → Anthropic SDK: Call 2 (query expansion)
    → Local: expanded_queries list (variable, not state)
    → LlamaIndex QueryEngine: batch query Chroma
    → Local: retrieved_content chunks (variable, not state)
    → Anthropic SDK: Call 3 (synthesis)
    → Input: retrieved_content + user_profile + destination + trip_parameters
    → Output: research_synthesis JSON
    → Write research_synthesis to state
    → Edge → plan_assembly

  Node 4+ — plan_assembly(state)  [HITL loop]
    → Anthropic SDK: Call 4 (plan generation or refinement)
    → Input (initial): research_synthesis + user_profile + trip_parameters + destination
    → Input (refine): current state["plan"] + state["user_feedback"] + state["refinement_history"]
    → Output: plan JSON
    → Write plan to state; increment refinement_count
    → interrupt() → graph pauses, control returns to FastAPI

FastAPI (on interrupt):
  → extract state["plan"]
  → return {plan, thread_id, status: "awaiting_feedback"} to React

User (React):
  → reads plan, types change request
  ↓ POST /api/refine {thread_id, user_feedback}

FastAPI:
  → graph.invoke(Command(resume=user_feedback), config={"configurable": {"thread_id": thread_id}})

LangGraph resumes plan_assembly:
  → write user_feedback to state, append to refinement_history
  → check: approved? or refinement_count >= 5? → terminate
  → else: Call 4 again (refinement) → interrupt() → repeat

FastAPI (on termination):
  → return {plan, status: "done"} to React
```

---

### Integration Points

| External System | How Connected | Auth |
|---|---|---|
| Claude API (Anthropic) | `anthropic.Anthropic(api_key=...)`, sync `.messages.create()` | `ANTHROPIC_API_KEY` env var |
| LlamaIndex | Python library, `VectorStoreIndex.from_documents()`, `index.as_query_engine()` | None (local) |
| Chroma | LlamaIndex `ChromaVectorStore` adapter, embedded mode (no server) | None (local files) |
| LangGraph | Python library, `StateGraph`, `MemorySaver`, `graph.compile(checkpointer=...)` | None |
| React → FastAPI | HTTP REST, CORS enabled for `localhost:5173` (Vite dev) | None (Sprint 2) |

---

### Integration Notes

**Anthropic SDK — structured output:**
Claude doesn't have a native JSON-mode like OpenAI. For persona_classification (Call 1) and plan generation (Call 4), the system prompt must instruct: "Respond ONLY with valid JSON matching this schema: {...}". FastAPI does `json.loads(response.content[0].text)` and validates. On parse failure → retry once, then error.

**LlamaIndex — index build vs query:**
Index is built once from the travel content corpus (markdown or text files in `data/knowledge/`), persisted to `data/chroma_db/`, and loaded at FastAPI startup. Query at runtime is a read-only operation. Sprint 2: 5–10 destination documents seeded manually (Kerala, Puri, Guwahati at minimum, matching the evaluation set).

**LangGraph MemorySaver — thread scope:**
MemorySaver is in-process and in-memory. Thread state is lost on FastAPI restart. Sprint 2 limitation: active HITL sessions are lost on server restart. Acceptable for demo/dev — upgrade to SqliteSaver or PostgresSaver in Sprint 3 for production.

**CORS:**
FastAPI CORS middleware must allow `http://localhost:5173` (Vite dev server) for local development. Add the Render/Vercel URL when deploying.

---

### Decision Points

| Decision | Logic | Implementation |
|---|---|---|
| Route persona to correct type | LLM in Call 1 classifies from onboarding answers | Structured JSON output, validated by FastAPI |
| Which queries to generate for RAG | LLM in Call 2 expands based on persona + constraints + destination | Local variable, consumed immediately by LlamaIndex |
| Empty retrieval result | If LlamaIndex returns 0 chunks → proceed with empty retrieved_content, Call 3 flags gap | `if not retrieved_content: synthesis_warning = True` |
| Plan approval vs. refinement | User message parsed: approval keywords ("looks good", "approve", "perfect") → terminate; else → refine | Keyword check in FastAPI or in the LangGraph node before re-entering loop |
| Max refinement guard | `state["refinement_count"] >= 5` → set `awaiting_feedback = False` → graph terminates | LangGraph conditional edge |

---

### Human Judgment Points (HITL Implementation)

**LangGraph `interrupt()` mechanism:**
Inside the `plan_assembly` node function, after writing `plan` to state: `interrupt(value={"plan": state["plan"], "message": "Review your plan"})`. LangGraph raises `GraphInterrupt` exception, which LangGraph catches internally and pauses the graph. FastAPI `graph.invoke()` call returns the interrupted state.

**FastAPI `Command(resume=...)` mechanism:**
On `POST /api/refine`, FastAPI calls `graph.invoke(Command(resume=user_feedback), config={"configurable": {"thread_id": thread_id}})`. The graph resumes exactly where `interrupt()` was called. `user_feedback` is the value injected into the resumed execution.

**Approval detection:**
In the plan_assembly node, after `interrupt()` resumes with `user_feedback`, check:
```python
APPROVAL_SIGNALS = {"looks good", "approve", "perfect", "that's fine", "yes", "ok", "done"}
if user_feedback.lower().strip() in APPROVAL_SIGNALS or state["refinement_count"] >= 5:
    state["awaiting_feedback"] = False
    return state  # terminate
```
Otherwise: refine and interrupt again.

---

## MVP Scope Definition

### North Star

**Only one question drives every scope decision:** Does this help test whether the system correctly handles Context Awareness Failure?

- Angle A: Does user_profile (constraints) materially change the plan output?
- Angle B: Does the plan surface unstated local risks for Indian destinations?

v1 is not for users. It's to validate that the architecture produces persona-aware, locally-knowledgeable plans. That's the whole job.

---

### First Implementation Target

**Single path to validate:** Run test case A-KL-01 end-to-end through the full system.

- Input: 5-night Kerala trip, 2 adults + 2-year-old toddler, budget ₹1 lakh
- Expected output: plan with midday rest blocks, toddler-appropriate activities, soft food recommendations, houseboat warning with operator trust caveat (from RAG)
- Compare against BASE-KL (5-year-old): must show material difference in pacing, activities, food
- If this path works: Angle A and Angle B are both validated in one test

This is the demo scenario. Everything else flows from making this work.

---

### Core Path (Sprint 2)

```
Onboarding form (5 questions)
  → POST /api/onboard
  → Call 1: Persona Classification
  → user_profile written to LangGraph state

Trip request (structured form + natural language destination)
  → POST /api/plan
  → Call 2: RAG Query Expansion (LLM)
  → LlamaIndex: query Chroma (Kerala, Puri, Guwahati corpus)
  → Call 3: Research Synthesis
  → research_synthesis written to state

  → Call 4: Plan Generation
  → plan written to state → interrupt()
  → React: renders plan, shows chat input

User: "change day 3 to beach" OR "looks good"
  → POST /api/refine
  → plan_assembly loop: refine or terminate
  → React: re-renders updated plan or shows final view
```

Every node in this path directly tests the quality risk. Nothing is decorative.

---

### Feature Justification

| Feature | Keep or Defer | Quality risk connection |
|---|---|---|
| Onboarding form + Call 1 (Persona Classification) | **Keep** | Core of Angle A — without user_profile, no constraint-awareness |
| LangGraph state (user_profile → all nodes) | **Keep** | The architectural guarantee — this is what we're testing |
| LlamaIndex + Chroma + Kerala/Puri/GW corpus | **Keep** | Core of Angle B — without RAG, houseboat trust gap persists |
| Call 2 (RAG Query Expansion) | **Keep** | Persona-aware queries surface better Angle B content |
| Call 3 (Research Synthesis) | **Keep** | Where Angle B passes or fails |
| Call 4 (Plan Generation + HITL loop) | **Keep** | Where Angle A passes or fails; HITL is user-requested |
| FastAPI /api/plan + /api/refine | **Keep** | Required to wire React to LangGraph |
| React onboarding page | **Keep** | Needed to capture user_profile — replaces hardcoded input |
| React chat/results page | **Keep** | Needed to inspect plan quality and test HITL |
| DeepEval automated pipeline | **Defer (Sprint 3)** | Manual scoring of CSV is sufficient for Sprint 2 validation |
| Trip parameters NLP parsing | **Hardcode as form** | Structured fields (duration slider, budget number, group_size) — NLP adds complexity without changing quality risk test |
| User authentication | **Hardcode: none** | Single-user, no login. Sprint 2 is dev/demo only |
| PDF export / share | **Defer (Sprint 3)** | Screenshots work for demo; doesn't test quality risk |
| WhatsApp integration | **Defer (Sprint 3)** | Meta API approval risk + out of scope |
| Booking API integrations | **Defer (Sprint 3)** | Not needed to test planning quality |

---

### Hardcoded for Sprint 2

| What | Hardcoded as | Make dynamic in |
|---|---|---|
| Trip parameters input | Structured form fields (destination text, duration number, budget number, group_size number, travel_dates text) | Sprint 3: NLP parsing from conversational input |
| RAG corpus | 3 destinations manually seeded (Kerala, Puri, Guwahati) — matching evaluation test cases exactly | Sprint 3: expand to 10+ destinations |
| Approval detection | Simple keyword list (`{"looks good", "approve", "yes", "done", "perfect"}`) | Sprint 3: LLM-based intent classification |
| Session persistence | MemorySaver (in-process, lost on restart) | Sprint 3: SqliteSaver for persistent sessions |
| User identity | No auth, single user | Sprint 3: user accounts |

---

### Definition of Done (Sprint 2)

- [ ] User completes 5-question onboarding form → persona_type, constraints correctly extracted
- [ ] User types a Kerala trip request → full plan generated within 60 seconds
- [ ] Plan for toddler (age 2) is materially different from plan for 5-year-old — pacing, activities, food all adapt
- [ ] Plan includes at least one Angle B warning not mentioned in the request (houseboat operator trust, local risk)
- [ ] User types "change day 3 to beach" → updated plan returned within 30 seconds
- [ ] User types "looks good" → final plan rendered, status: done
- [ ] All 3 baseline test cases (BASE-KL, BASE-PU, BASE-GW) produce plans the product owner would consider usable

---

### Deferred to Sprint 3

- DeepEval automated eval wired to LangGraph (manual scoring covers Sprint 2)
- NLP-based trip parameter extraction (structured form is sufficient)
- Retrieval quality check loop in Destination Intelligence Node (Angle B quality gate)
- Persistent HITL sessions (SqliteSaver / PostgresSaver)
- User authentication and multi-user support
- RAG corpus expansion beyond 3 destinations
- Booking API integrations (Booking.com, BookMyMandir)
- Voice interface (Whisper + ElevenLabs)
- WhatsApp integration
- PDF export / trip summary sharing
- Gmail OAuth for travel history personalization

---

## Implementation Platform Selection

### Platform: LangGraph (Python)

Confirmed from architecture workflow. Already locked in Sprint 2 scope.

**Rationale:**
- `TripSathiState` TypedDict is the exact data contract for testing Context Awareness Failure — state propagation is explicit and auditable
- `interrupt()` + `MemorySaver` + `Command(resume=...)` is native LangGraph HITL — no workarounds
- Anthropic SDK, LlamaIndex, Chroma are all Python-native — no glue layers needed
- Architecture spec already designed for LangGraph; no translation cost

**Trade-offs accepted for Sprint 2:**
- More code than a no-code tool (n8n would require less Python)
- In-process MemorySaver = sessions lost on restart (acceptable for dev/demo)
- No visual debugger — use logging + FastAPI `/docs` endpoint

**Sprint 3 upgrade path (2-line changes):**
- `MemorySaver` → `SqliteSaver` for persistent sessions
- Add `LANGCHAIN_TRACING_V2=true` env var for LangSmith observability

### Implementation Timeline Assessment

| Task | Estimated hours | Notes |
|---|---|---|
| Backend scaffolding (FastAPI + state + graph) | 4h | Well-defined from architecture spec |
| Node functions (Calls 1–4) | 6h | Prompts designed; implementation is SDK calls + JSON parse |
| HITL loop (interrupt + resume) | 3h | LangGraph native; follow the spec exactly |
| LlamaIndex + Chroma + RAG corpus | 4h | Index build is documented; corpus writing is the main effort |
| React frontend (2 pages + HITL chat) | 8h | Onboarding form + chat/results page + plan renderer |
| FastAPI ↔ React wiring | 2h | 3 endpoints, CORS config |
| Testing (eval CSV + manual scoring) | 3h | Run 10 cases, compare to existing scores |
| **Total** | **~30 hours** | At 3 hours/day = ~10 days → tight but achievable by May 31 |

