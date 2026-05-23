# Agent Architecture Specification

## Implementation Update

### Current State (Sprint 2 — by May 31)

**No code written — fully in design phase.** Architecture is being designed forward from context management and evaluation artifacts.

**Sprint 2 scope locked:**
- Module 1: Onboarding (structured questions → persona classification → user profile)
- Module 2: Research + Planning pipeline (RAG retrieval → synthesis → itinerary generation)
- React web app (Vite + Tailwind + shadcn/ui) — 2 pages: onboarding + chat/results
- FastAPI backend — bridges React ↔ LangGraph
- DeepEval eval set wired to 10 CSV test cases

**Tech stack confirmed:**

| Layer | Tech |
|---|---|
| LLM | Claude (claude-sonnet-4-6) |
| Orchestration | LangGraph |
| RAG / Indexing | LlamaIndex |
| Backend API | FastAPI |
| Frontend | React (Vite + Tailwind + shadcn/ui) |
| Evaluation | DeepEval |
| Vector DB | Chroma (local, no infra needed for Sprint 2) |

### Priority Quality Risk

**Context Awareness Failure** — the agent ignores stated soft constraints (kid age, elderly pace, budget) OR misses unstated local risks (Kamakhya queues, Shillong return timing).

Two angles:
- **Angle A** (explicit constraints ignored): user_profile fields not passed correctly to planning calls
- **Angle B** (implicit local risks missed): RAG doesn't retrieve the right content, or retrieved content isn't surfaced in synthesis

Both angles are addressed by the 4-call LLM pipeline with correct context flow through LangGraph state.

### LLM Call Pipeline (from context management workflow)

| Call | Purpose | Risk Connection |
|---|---|---|
| Call 1 — Persona Classification | onboarding_answers → structured user_profile | 8/10 — wrong persona = wrong context downstream |
| Call 2 — RAG Query Expansion | trip request + user_profile → expanded retrieval queries | 5/10 — affects retrieval quality |
| Call 3 — Research Synthesis | retrieved_content + user_profile → structured destination research | 9/10 — Angle B passes or fails here |
| Call 4 — Plan Generation | research_synthesis + user_profile + trip_parameters → actionable itinerary | 10/10 — Angle A passes or fails here |

**No changes to implementation state or quality risk since context management workflow.** This baseline applies directly.

---

## Context Domain Clustering

### LLM Call × Context Field Matrix

Fields used by each call (post-waste-removal schemas):

| LLM Call | onboarding_answers | destination | user_profile | trip_parameters | retrieved_content | research_synthesis |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Call 1 — Persona Classification | ✓ (R) | optional (R) | — (W) | | | |
| Call 2 — RAG Query Expansion | | ✓ (R) | ✓ (R) | ✓ (R) | | |
| Call 3 — Research Synthesis | | ✓ (R) | ✓ (R) | ✓ (R) | ✓ (R) | — (W) |
| Call 4 — Plan Generation | | ✓ (R) | ✓ (R) | ✓ (R) | | ✓ (R) |

*(R = reads, W = writes, — = produces this field)*

**Shared fields:** `destination`, `user_profile`, `trip_parameters` are read by Calls 2, 3, and 4 — these three form the backbone of the pipeline.

**Direct output→input chains:**
- Call 1 → writes `user_profile` → read by Calls 2, 3, 4
- Call 2 → writes `expanded_queries` → drives LlamaIndex retrieval → produces `retrieved_content` for Call 3
- Call 3 → writes `research_synthesis` → read exclusively by Call 4

---

### Identified Clusters

**Cluster A — User Understanding** (Call 1)

Reasoning focus: *"Who is this traveller and what constraints do they carry into every downstream decision?"*

- Inputs: onboarding_answers from React UI
- Produces: `user_profile` (persona_type, autonomy_mode, constraints) — the single most-shared piece of context in the entire pipeline
- Isolated field overlap with Calls 2/3/4 — produces the context others consume, doesn't share inputs with them
- Clear boundary: runs once at session start, before trip planning begins

**Cluster B — Destination Intelligence** (Calls 2 + 3)

Reasoning focus: *"What do we know about this destination for this specific traveller, and what risks should surface before we commit to a plan?"*

- Call 2 and Call 3 share 3/4 of their input fields (destination, user_profile, trip_parameters)
- Call 2's output drives LlamaIndex retrieval → Call 3 receives the retrieved chunks
- These calls reason about the same object: destination-specific knowledge filtered through the user's persona
- Call 3's output (research_synthesis) is the entire input knowledge base for Call 4

**Cluster C — Plan Assembly** (Call 4)

Reasoning focus: *"Given what we know about this destination and this traveller, what itinerary satisfies every constraint?"*

- Reads research_synthesis (from Cluster B) + user_profile (from Cluster A) + trip_parameters
- Produces the final artefact: day-by-day plan, hotels, budget, warnings
- Distinct reasoning mode from Cluster B — synthesis was about knowledge; assembly is about constraint satisfaction and sequencing

---

### Shared Context Services (not clusters)

**LlamaIndex / Chroma — RAG Retrieval Service**
- Sits between Calls 2 and 3: receives expanded_queries from Call 2, returns ranked chunks to Call 3
- Pure retrieval — no reasoning, no state, stateless tool call
- Same input always produces same output type (given stable index)
- Shared service: could serve other retrieval needs in Sprint 3 without belonging to any single agent

**FastAPI — Request/Response Bridge**
- Routes React UI requests to LangGraph, serialises plan output back to React
- No reasoning, no state owned by FastAPI itself
- Shared service: transport layer only

---

### Clustering Summary

| | Count | Names |
|---|---|---|
| Clusters (reasoning domains) | 3 | User Understanding, Destination Intelligence, Plan Assembly |
| Shared services | 2 | RAG Retrieval (LlamaIndex/Chroma), API Bridge (FastAPI) |
| Total LLM calls | 4 | Calls 1–4 |

Calls 2+3 cluster together because they share context fields AND Call 2's output is the retrieval trigger for Call 3 — they're tightly coupled in the same information-gathering loop.

Cluster A (Call 1) is cleanly isolated: it consumes raw user input and produces the foundational context object that everything else reads. No downstream call writes back to it.

---

## Agent vs. Service Classification

### 3-Question Test Applied to Each Cluster

**Cluster A — User Understanding (Call 1)**

| Question | Answer | Reasoning |
|---|---|---|
| Does it need evolving state across multiple steps? | **No** | Runs once — onboarding_answers in, user_profile out. No iteration. |
| Does it need to choose between multiple next actions? | **No** | Always runs the same sequence. No branching. |
| Is there a stable object of concern it reasons about over time? | **No** | user_profile is computed once and handed off. Not refined over time. |

**Score: 0/3 → Service**

---

**Cluster B — Destination Intelligence (Calls 2 + 3)**

| Question | Answer | Reasoning |
|---|---|---|
| Does it need evolving state across multiple steps? | **Sprint 2: No** | Fixed pipeline: expand queries → retrieve → synthesize. One pass. |
| Does it need to choose between multiple next actions? | **Sprint 2: No** | No quality check on retrieval results, no re-query decision. Always the same sequence. |
| Is there a stable object of concern it reasons about over time? | **Yes** | The destination research document is the object — but assembled in one pass, not iterated. |

**Score: 1/3 → Service for Sprint 2**

*(Sprint 3 candidate: add a retrieval quality check that can decide to re-query with refined terms if local_risks is empty — this would promote it to agent. Directly addresses Angle B of Context Awareness Failure.)*

---

**Cluster C — Plan Assembly (Call 4 + HITL refinement loop)**

| Question | Answer | Reasoning |
|---|---|---|
| Does it need evolving state across multiple steps? | **Yes** | Plan is generated, shown to user, refined based on feedback, shown again. `plan` and `refinement_history` evolve across multiple steps. |
| Does it need to choose between multiple next actions? | **Yes** | After generating a plan, the agent chooses: interrupt and wait for user feedback, refine again based on changes, or terminate if user approves. |
| Is there a stable object of concern it reasons about over time? | **Yes** | The trip plan is the object — it persists across the refinement loop and is iteratively improved. |

**Score: 3/3 → Agent**

---

### Architecture Decision: Single LangGraph Graph with HITL Agent Loop

Clusters A and B score as services. Cluster C scores as an agent (3/3). The LangGraph graph remains the single agent — but it now contains a genuine agentic sub-loop in the Plan Assembly phase rather than a purely linear pipeline.

**The right framing:**

The overall system is one LangGraph graph. Clusters A and B are service nodes within it (run once, write to state, done). Cluster C is an agentic loop within the same graph — it generates a plan, pauses for user feedback via LangGraph's `interrupt()` mechanism, and iterates until the user approves or the refinement limit is reached.

---

### Final Architecture Overview: Single-Agent Pipeline with HITL Refinement Loop

**1 Agent: TripSathi Planning Agent** (LangGraph graph)
- Session state owner: `user_profile`, `trip_parameters`, `destination`, `research_synthesis`, `plan`, `refinement_history`
- Goal: produce a personalised, user-approved trip plan
- Control structure: linear pipeline for Nodes 1–3, then HITL refinement loop for Plan Assembly
- Requires: **LangGraph MemorySaver checkpointer** + **thread_id** to persist state across pause/resume cycles

**2 Internal Service Nodes** (run once, no loops):
- Persona Classification Node (Call 1): onboarding_answers → user_profile
- Destination Intelligence Node (Calls 2+3 + LlamaIndex): destination + user_profile → research_synthesis

**1 Internal Agent Loop** (iterative, HITL-driven):
- Plan Assembly Agent Loop (Call 4 + refinement calls): research_synthesis + user_profile → plan → `interrupt()` → user feedback → refined plan → repeat until approved or max refinements reached

**2 External Services** (stateless, outside LangGraph graph):
- RAG Retrieval (LlamaIndex / Chroma): query → ranked chunks
- FastAPI Bridge: HTTP gateway; manages thread_id; routes `/api/plan` (start) and `/api/refine` (continue)

---

### Scope Check

**Agent count: 1** (one LangGraph graph, with one internal HITL loop) — within the bootcamp max-2 guideline.

**Sprint 3 deferred:**
- Destination Intelligence Node → Agent: add retrieval quality check + conditional re-query (Angle B quality gate). Not needed for Sprint 2 — the fixed RAG pipeline is sufficient to test Context Awareness Failure.

---

## Architecture Validation

### Check 1: Circular Dependencies ✅ Clean

Dependency flow is strictly linear:

```
React UI → FastAPI → [LangGraph]
  Node 1 (Persona Classification)
    ↓ writes user_profile to state
  Node 2+3 (Destination Intelligence)
    ↓ writes research_synthesis to state
  Node 4 (Plan Assembly)
    ↓ writes plan
[LangGraph] → FastAPI → React UI
```

No component reads from a component that reads from it. No circular dependency possible.

---

### Check 2: Unclear Context Ownership ✅ Clean

Each state field has exactly one writer:

| Field | Written by | Read by |
|---|---|---|
| `user_profile` | Node 1 only | Nodes 2, 3, 4 |
| `trip_parameters` | FastAPI (session init, before graph runs) | Nodes 2, 3, 4 |
| `destination` | FastAPI (session init) | Nodes 2, 3, 4 |
| `research_synthesis` | Node 3 only | Node 4 |
| `plan` | Node 4 only | FastAPI → React |

`trip_parameters` and `destination` are initialised by FastAPI as the LangGraph initial state — no node owns them, they're session inputs. This is correct: FastAPI is the state initialiser, not a node.

---

### Check 3: Orphaned Context — 1 Issue Found and Resolved

**Issue: `retrieved_content` scope**

`retrieved_content` (the LlamaIndex query result) appears in the context schemas as if it were a LangGraph state field. But it's only consumed immediately within the Destination Intelligence Node — Call 2 drives the LlamaIndex query, LlamaIndex returns chunks, Call 3 immediately consumes them.

Passing `retrieved_content` through LangGraph state would mean storing large RAG chunks in the graph state unnecessarily (already caught as a `call_only` retention policy in context management — but the architectural implication is clearer now).

**Resolution:** `retrieved_content` is an intra-node local variable within the Destination Intelligence Node. It is NOT a LangGraph state field. The node function calls LlamaIndex internally, receives chunks as a local Python variable, passes them directly to Call 3 within the same function, and only writes `research_synthesis` to LangGraph state.

This simplifies the LangGraph state schema:

**LangGraph state fields (corrected):**
```python
class TripSathiState(TypedDict):
    # Session inputs (initialised by FastAPI)
    destination: str
    trip_parameters: dict
    # Node outputs (written progressively)
    user_profile: dict          # written by Node 1
    research_synthesis: dict    # written by Node 2/3 cluster
    plan: dict                  # written by Node 4
```

`retrieved_content` and `expanded_queries` are local variables inside the Destination Intelligence Node function — they never touch LangGraph state.

---

### Check 4: Missing Handoff Paths ✅ Clean

All handoff paths accounted for:

| From | To | Mechanism |
|---|---|---|
| React UI (onboarding) | FastAPI | HTTP POST (form submission) |
| FastAPI | LangGraph state | `graph.invoke({"destination": ..., "trip_parameters": ...})` |
| Node 1 | Nodes 2/3/4 | LangGraph state `user_profile` (written then read) |
| Node 2 | LlamaIndex | Function call: `index.query(expanded_queries)` (local) |
| LlamaIndex | Node 3 | Return value (local variable, not state) |
| Node 3 | Node 4 | LangGraph state `research_synthesis` |
| Node 4 | FastAPI | LangGraph graph return value |
| FastAPI | React UI | HTTP response (JSON plan) |

---

### Check 5: Agent/Service Misclassification ✅ Clean

- **TripSathi Planning Agent (LangGraph graph):** Correctly an agent — it owns session state across pause/resume cycles, orchestrates 4 LLM calls, and contains a HITL control loop. LangGraph graph IS the agent.
- **Persona Classification Node:** Stateless transformation (onboarding_answers → user_profile). Correctly a service node.
- **Destination Intelligence Node:** Fixed 2-call + retrieval sequence. No branching decisions for Sprint 2. Correctly a service node.
- **Plan Assembly Agent Loop:** Has evolving state (`plan`, `refinement_history`), makes branching decisions (refine vs. approve vs. max-limit), and reasons about the trip plan over multiple iterations. Correctly reclassified as an agent loop.
- **LlamaIndex/Chroma:** Pure retrieval utility. Correctly an external service.
- **FastAPI:** Transport layer + thread_id manager. Correctly an external service.

---

### Issues and Resolutions Summary

| Issue | Severity | Resolution |
|---|---|---|
| `retrieved_content` in LangGraph state | Medium (implementation risk) | Reclassified as intra-node local variable. Removed from LangGraph state schema. |

---

### Approved Architecture Snapshot

**TripSathi Planning Agent** — single LangGraph graph, 2 service nodes, 1 HITL agent loop, 2 external services. Requires MemorySaver checkpointer + thread_id.

```
LangGraph State: {destination, trip_parameters, user_profile, research_synthesis,
                  plan, user_feedback, refinement_count, refinement_history,
                  awaiting_feedback, current_node, error}

Node 1: Persona Classification  [service node — runs once]
  In: onboarding_answers
  Out: user_profile → state

Node 2/3: Destination Intelligence  [service node — runs once]
  In: destination, user_profile, trip_parameters
  Internal: expanded_queries → LlamaIndex → retrieved_content (local vars)
  Out: research_synthesis → state

Node 4+: Plan Assembly Agent Loop  [agent loop — runs 1–N times]
  generate_plan: research_synthesis + user_profile + trip_parameters → plan → state
  interrupt(): pause graph, return plan + thread_id to FastAPI → React
  on resume: read user_feedback from state
    if "approve" or refinement_count >= 5: → done
    if change request: re-run generate_plan with (current_plan + user_feedback) → loop
```

This architecture tests Context Awareness Failure via the user_profile propagation AND gives users agency to correct constraint violations they notice in the plan ("the hotel you picked has stairs, can you change it?").

---

## Agent Control Logic

### TripSathi Planning Agent — Control Loop

The agent is the LangGraph graph. The first two phases (Persona Classification, Destination Intelligence) are linear service nodes. The Plan Assembly phase is a HITL agent loop: generate → interrupt → wait for user → refine or terminate.

LangGraph's `interrupt()` function pauses graph execution and returns control to FastAPI. The graph resumes when FastAPI calls `graph.invoke(Command(resume=user_feedback), config={"configurable": {"thread_id": tid}})`. **MemorySaver checkpointer** persists state between pause and resume.

```mermaid
flowchart TD
    Start([FastAPI: graph.invoke with thread_id]) --> Init[Initialize state\ndestination, trip_parameters, onboarding_answers]

    Init --> Node1[Node 1: Persona Classification\nCall 1 — claude-sonnet-4-6\nIn: onboarding_answers\nOut: user_profile → state]

    Node1 --> Check1{user_profile valid?}
    Check1 -->|Error| Err1[Set error: persona_classification_failed\nreturn to FastAPI]
    Check1 -->|Valid| Node23[Node 2/3: Destination Intelligence\nCall 2: expand queries\nLlamaIndex: retrieve chunks\nCall 3: synthesize\nIn: destination + user_profile + trip_parameters\nOut: research_synthesis → state]

    Node23 --> Check2{research_synthesis valid?}
    Check2 -->|Error| Err2[Set error: destination_intelligence_failed\nreturn to FastAPI]
    Check2 -->|Valid| GenPlan[Plan Assembly: generate_plan\nCall 4 — claude-sonnet-4-6\nIn: research_synthesis + user_profile + trip_parameters\nOut: plan → state\nrefinement_count += 1]

    GenPlan --> Interrupt{interrupt — pause graph\nreturn plan + thread_id to FastAPI → React}

    Interrupt -->|User: approve / looks good| Done([Terminate — return final plan])
    Interrupt -->|User: change request| ReadFeedback[Read user_feedback from state\nAppend to refinement_history]

    ReadFeedback --> MaxCheck{refinement_count >= 5?}
    MaxCheck -->|Yes — guard| Done
    MaxCheck -->|No| Refine[Plan Assembly: refine_plan\nCall 4 again — claude-sonnet-4-6\nIn: current plan + user_feedback + user_profile\nOut: updated plan → state\nrefinement_count += 1]

    Refine --> Interrupt
```

**What makes the Plan Assembly loop agentic:**
- It maintains state across multiple turns (`plan`, `refinement_history`, `refinement_count`)
- It branches: approve → terminate, change → refine, count limit → force terminate
- It reasons about the same object (the trip plan) over multiple iterations, incorporating user feedback each time
- The `interrupt()` call is LangGraph's built-in HITL mechanism — the graph is paused, not polled

**Termination conditions:**
- User sends approval ("looks good", "that's fine", "approve") → graph terminates, returns final plan
- `refinement_count` reaches 5 → graph auto-terminates with current plan (prevents infinite loop)
- Any node sets `error` → graph aborts, returns error to FastAPI

---

### AgentContext Schema (LangGraph TypedDict)

```python
class TripSathiState(TypedDict):
    # ── Input-only (initialised by FastAPI, never mutated by nodes) ──────────
    destination: str
    trip_parameters: dict          # {duration_nights: int, budget_total: int,
                                   #  travel_dates: str, group_size: int}
    onboarding_answers: list[dict] # [{question: str, answer: str}, ...]

    # ── Agent-owned (written progressively by nodes) ─────────────────────────
    user_profile: dict | None      # written by Node 1 — write-once
    research_synthesis: dict | None  # written by Node 2/3 — write-once
    plan: dict | None              # written/updated by Plan Assembly loop each iteration

    # ── HITL refinement state (Plan Assembly Agent Loop) ─────────────────────
    user_feedback: str | None      # last change request from user; cleared after each refine
    refinement_count: int          # increments each time generate_plan or refine_plan runs
    refinement_history: list[str]  # log of all user feedback messages in this session

    # ── Control/meta ─────────────────────────────────────────────────────────
    awaiting_feedback: bool        # True when graph is interrupted, waiting for user
    current_node: str              # "persona_classification" | "destination_intelligence"
                                   # | "plan_assembly" | "awaiting_feedback" | "done" | "error"
    error: str | None
```

**Key design decisions:**
- `plan` is the only agent-owned field that mutates — updated on every refinement cycle. All others are write-once.
- `refinement_history` accumulates across the session — the refine_plan prompt receives the full history so the LLM understands the arc of changes requested ("first they wanted more budget hotels, then they wanted to avoid Munnar crowds").
- `user_feedback` holds only the latest request; the history is in `refinement_history`.
- `refinement_count` guards against infinite loops — hard cap of 5 refinements.

---

### Decision Logic

**What makes each node's logic meaningful (not just LLM pass-through):**

Node 1 (Persona Classification): The LLM's decision is which `persona_type` to assign and whether `elderly=true` or `mobility_limited=true` — the downstream effect of these boolean decisions is which activities are valid and which hotels are required. Getting this wrong = Angle A failure.

Node 2/3 (Destination Intelligence): The LLM in Call 3 decides which local risks are worth surfacing. It must decide to include unprompted warnings (Kamakhya queues, Shillong timing) even when the user didn't ask. This is the Angle B decision — not retrieving and synthesising is the failure mode, not a missing input.

Node 4 (Plan Assembly): The LLM sequences activities around constraints. When elderly=true AND kid_ages=[2], it must decide to drop Eravikulam NP (mobility + terrain) and add midday rest blocks. The decision logic is in the prompt, not the graph edges — the node is a service, but the LLM within it makes the constraint-satisfaction decisions.

---

### Decision Logic

**Plan Assembly Agent Loop — what the LLM decides on each cycle:**

Initial generation (Call 4): given research_synthesis + user_profile + constraints → decide which activities to include/exclude, which hotel to recommend and why, how to sequence days around elderly/kid pacing, which warnings to surface.

Refinement (Call 4 again): given current_plan + user_feedback + user_profile → decide which parts of the plan to modify, which constraints from the original profile still apply, whether the change request introduces new conflicts ("change the hotel" but user_profile has mobility_limited=true → must still pick a ground-floor / lift-access property).

The refinement call receives `refinement_history` so the LLM doesn't regress on earlier approved changes.

---

### Error Handling

| Failure point | Behaviour | User-visible message |
|---|---|---|
| Node 1 fails (persona classification) | Set `error`, abort | "We couldn't process your preferences. Please try again." |
| LlamaIndex retrieval returns 0 chunks | Node 2/3 proceeds with empty retrieved_content; Call 3 flags low-confidence synthesis | Plan includes "Limited local knowledge available for this destination" warning |
| Node 2/3 fails (synthesis error) | Set `error`, abort | "We couldn't research this destination. Please try again." |
| Plan generation fails (initial Call 4) | Set `error`, abort | "We couldn't generate your plan. Please try again." |
| Refinement call fails (subsequent Call 4) | Keep current plan, set `error` on refinement only | "We couldn't apply that change — here's the current plan. Try rephrasing?" |
| `refinement_count` reaches 5 | Auto-terminate, return current plan | "You've reached the maximum refinements. Here's your final plan." |
| FastAPI loses thread_id (server restart etc.) | Cannot resume graph | "Your session expired. Please start a new plan." |

**Refinement failure is non-fatal** — the current plan is preserved and returned to the user with an error message. This is more useful than aborting the whole session because the user already has a valid baseline plan.

**Important:** LlamaIndex returning empty results is NOT an abort condition — graceful degradation keeps the pipeline alive even with a cold-start corpus.

---

## Service Composition

### Orchestration Pattern: Agent-Driven Pipeline with HITL Loop

The LangGraph graph (TripSathi Planning Agent) is the orchestrator. FastAPI is the external gateway — it routes requests and manages the thread_id session lifecycle.

Two distinct patterns within the same graph:
- **Linear pipeline** (Nodes 1 and 2/3): sequential, no branching, runs once per session
- **HITL agent loop** (Plan Assembly): conditional, iterates based on user approval, uses LangGraph `interrupt()` + MemorySaver

Pattern summary: **Linear pipeline into a HITL refinement loop, all within one LangGraph agent. FastAPI manages the pause/resume cycle via thread_id.**

---

### Component Integration

**React UI ↔ FastAPI**
- Onboarding page: POST `/api/onboard` with `{onboarding_answers: [{question, answer}], destination_hint?}`
- Chat/Results page (start): POST `/api/plan` with `{destination, trip_parameters, onboarding_answers}` → returns `{plan, thread_id, status: "awaiting_feedback"}`
- Chat/Results page (refine): POST `/api/refine` with `{thread_id, user_feedback}` → returns `{plan, thread_id, status: "awaiting_feedback" | "done"}`
- React renders plan after each response; shows chat input for next feedback until `status: "done"`
- No WebSocket or streaming in Sprint 2 — request/response per turn

**FastAPI ↔ LangGraph Agent**
- **Start:** FastAPI generates `thread_id = uuid4()`, calls `graph.invoke(initial_state, config={"configurable": {"thread_id": thread_id}})` with MemorySaver checkpointer
- Graph runs Nodes 1 and 2/3, then Plan Assembly generates initial plan and hits `interrupt()`
- FastAPI receives the interrupted state, extracts `state["plan"]`, returns `{plan, thread_id, status: "awaiting_feedback"}` to React
- **Resume:** FastAPI calls `graph.invoke(Command(resume=user_feedback), config={"configurable": {"thread_id": thread_id}})` with the same thread_id
- Graph resumes at the interrupt point, checks feedback, refines or terminates
- Repeats until `state["awaiting_feedback"] == False` (user approved or max refinements reached)
- FastAPI returns `{plan, status: "done"}` on termination

**LangGraph Node 1 ↔ Claude API**
- Anthropic SDK call: `client.messages.create(model, system_prompt, messages=[{role: "user", content: formatted_onboarding}])`
- Expects structured JSON output (persona_type, autonomy_mode, constraints)
- Writes result to `state["user_profile"]`

**LangGraph Node 2/3 ↔ Claude API + LlamaIndex**
- Sub-step 1: Claude API call (Call 2) to expand queries — returns `expanded_queries` list (local var)
- Sub-step 2: LlamaIndex `QueryEngine.query()` or batch query per expanded query — returns `retrieved_content` (local var)
- Sub-step 3: Claude API call (Call 3) with retrieved_content + user_profile + destination + trip_parameters — returns `research_synthesis`
- Writes `research_synthesis` to state; `expanded_queries` and `retrieved_content` are discarded (local vars only)

**LangGraph Node 4 ↔ Claude API**
- Anthropic SDK call (Call 4): full state context → structured plan JSON
- Writes result to `state["plan"]`

**LlamaIndex ↔ Chroma**
- LlamaIndex uses Chroma as its vector store backend
- Chroma runs locally in Sprint 2 (embedded, no server)
- Index built once from travel content corpus; queried at runtime by Node 2/3

---

### System-Wide Data Flow

```mermaid
flowchart TD
    User([User]) -->|onboarding form| React1[React UI\nOnboarding Page]
    React1 -->|POST /api/onboard| FastAPI[FastAPI\nBackend]

    User -->|trip request| React2[React UI\nChat Page]
    React2 -->|POST /api/plan + thread_id| FastAPI

    FastAPI -->|graph.invoke initial_state\nconfig: thread_id| Agent[TripSathi Planning Agent\nLangGraph + MemorySaver]

    Agent --> N1[Node 1\nPersona Classification\nCall 1 — Claude]
    N1 -->|user_profile → state| N23

    N23[Node 2/3\nDestination Intelligence] -->|expanded_queries| Llama[LlamaIndex]
    Llama -->|queries| Chroma[(Chroma)]
    Chroma -->|chunks| Llama
    Llama -->|retrieved_content local var| N23
    N23 -->|research_synthesis → state| PA

    PA[Plan Assembly\nCall 4 — Claude\ngenerate / refine] -->|plan → state| Interrupt{interrupt\nawait feedback}

    Interrupt -->|plan + thread_id + status: awaiting_feedback| FastAPI
    FastAPI -->|plan + thread_id| React2
    React2 -->|renders plan\nshows chat input| User

    User -->|feedback or approve| React2
    React2 -->|POST /api/refine\nthread_id + user_feedback| FastAPI
    FastAPI -->|graph.invoke Command resume\nconfig: thread_id| Agent

    Interrupt -->|user approved or max refinements| FinalPlan[Return final plan\nstatus: done]
    FinalPlan --> FastAPI
    FastAPI -->|plan + status: done| React2
    React2 -->|final plan rendered| User
```

---

### Architecture Overview — Complete System

| Component | Type | Role | Sprint |
|---|---|---|---|
| React UI (Onboarding) | Frontend | Collects onboarding_answers + destination_hint | Sprint 2 |
| React UI (Chat/Results) | Frontend | Accepts trip request; renders plan; accepts refinement feedback | Sprint 2 |
| FastAPI | External service | HTTP gateway; generates thread_id; manages pause/resume cycle; routes `/api/plan` and `/api/refine` | Sprint 2 |
| TripSathi Planning Agent | **1 LangGraph Agent** | Orchestrates pipeline + HITL loop; owns session state via MemorySaver; carries user_profile to all nodes | Sprint 2 |
| Persona Classification Node | Service node | Classifies user persona from onboarding answers — runs once | Sprint 2 |
| Destination Intelligence Node | Service node | Expands queries, retrieves, synthesises destination knowledge — runs once | Sprint 2 |
| Plan Assembly Agent Loop | Agent loop (within graph) | Generates and iteratively refines plan based on user feedback; interrupts for HITL | Sprint 2 |
| LangGraph MemorySaver | Checkpointer | Persists LangGraph state between interrupt and resume across HTTP requests | Sprint 2 |
| LlamaIndex Query Engine | External service | Retrieves relevant content chunks given queries | Sprint 2 |
| Chroma | External service | Local vector store for travel content corpus | Sprint 2 |
| Claude API (claude-sonnet-4-6) | External service | Powers all 4+ LLM calls (4 base + up to 5 refinement calls) via Anthropic SDK | Sprint 2 |
| DeepEval | External service | Evaluates plan quality against 10 CSV test cases | Sprint 2 |

**Total: 1 agent (with 2 service nodes + 1 HITL agent loop), 7 external/supporting services**

**Critical integration points:**
1. FastAPI → LangGraph state init — `thread_id` must be generated and stored by FastAPI; lost thread_id = user cannot refine their plan
2. Node 1 → LangGraph state → all downstream — `user_profile` propagation. If this wire breaks, Context Awareness Failure fires in every test case
3. Node 2/3 → LlamaIndex → Node 3 — RAG retrieval chain; LlamaIndex returning 0 chunks = graceful degradation, not abort
4. `interrupt()` → MemorySaver → `graph.invoke(Command(resume=...))` — the HITL resume chain; MemorySaver must use the same `thread_id` on both sides or the state is lost

**No isolated components.** Every service is called by something; every component has access to the state it needs.






