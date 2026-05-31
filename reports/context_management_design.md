# Context Management Design — Tropsathi

## Implementation Reality Check

### implementation_reality

**What was planned vs. what was built:**

| Component | Planned | Built |
|---|---|---|
| Memory | Mem0 / Zep (long-term) | SqliteSaver (session persistence across restarts) |
| Research agent | LangChain DeepAgents | Direct RAG via LlamaIndex + ChromaDB |
| Tool integrations | MCP (web search, Maps, weather) | None — local ChromaDB only |
| Voice | Whisper + ElevenLabs | Not implemented |
| UI | Chainlit | React frontend |

Long-term memory (Mem0/Zep) is a deliberate Sprint 3 scope item. All other deviations were pragmatic simplifications during Sprint 2.

### user_context_flow_analysis

Information flows through 4 nodes in a linear then looping graph:

```
persona_classification → destination_intelligence → plan_assembly ⇄ human_feedback
                                                          ↓
                                                       finalize
```

Each node writes to `TripSathiState` (LangGraph TypedDict). Context passes between nodes via state fields — not direct function calls. The checkpointer (now SqliteSaver) persists full state to `checkpoints.db` after each node, keyed by `thread_id`.

### quality_risk_connection

The primary quality risk is **safety-critical information loss** — specifically, RAG-sourced local warnings (houseboat safety, hotel location, terrain suitability, pricing scams) failing to reach the user. Context management is directly load-bearing for this risk at two failure points:
1. RAG failure → silent synthesis with no local_risks
2. Refinement iterations → RAG warnings dropped from prompt, post-processing safety net not running

Both gaps have been fixed in this workflow.

### discovered_context_patterns

- All LLM calls use `json.dumps()` serialization of structured state fields
- Conditional constraint injection (toddler block, req block) happens at call time, not stored in state
- `refinement_history` accumulates in state but is windowed to last 3 items in prompt

---

## LLM Call Inventory

### llm_call_analysis

| Call | Node | Verdict | Quality Risk Rating | Notes |
|---|---|---|---|---|
| Persona classification | `persona_classification` | ✅ Essential | 9/10 | Kid ages / elderly extraction directly gates safety logic |
| Query expansion | `destination_intelligence` | ✅ Essential | 8/10 | Wrong queries → wrong RAG chunks → missing warnings |
| Research synthesis | `destination_intelligence` | ✅ Essential | 9/10 | Produces local_risks / implicit_warnings used throughout |
| Plan generation | `plan_assembly` | ✅ Essential | 10/10 | Core product output |
| Plan refinement / regeneration | `plan_assembly` | ✅ Essential (gap fixed) | 8/10 | Was missing research_synthesis in refinement prompt |

### calls_to_remove_or_defer

None. System is lean — all 5 calls are load-bearing for the quality risk. No convenience calls identified.

---

## Context Schemas

### Call 1: persona_classification

| Field | Type | Required | Source | Acquire from | Retention | Shape | Deliver |
|---|---|---|---|---|---|---|---|
| `onboarding_answers` | `array[{question, answer}]` | ✅ | user | React form → FastAPI POST | session | Flattened to `"Q: ...\nA: ..."` string | JSON object → `state["user_profile"]` |
| `destination` | `string` | no | user | React form → FastAPI POST | session | Appended as destination hint | — |

### Call 2: query_expansion

| Field | Type | Required | Source | Acquire from | Retention | Shape | Deliver |
|---|---|---|---|---|---|---|---|
| `destination` | `string` | ✅ | user | FastAPI POST body | session | As-is | JSON array of strings (ephemeral) |
| `user_profile` | `object` | ✅ | system | `state["user_profile"]` (Call 1 output) | session | `json.dumps()` | — |
| `trip_parameters` | `object` | ✅ | user | FastAPI POST body | session | `json.dumps()` | — |

### Call 3: research_synthesis

| Field | Type | Required | Source | Acquire from | Retention | Shape | Deliver |
|---|---|---|---|---|---|---|---|
| `destination` | `string` | ✅ | user | FastAPI POST body | session | As-is | — |
| `user_profile` | `object` | ✅ | system | `state["user_profile"]` | session | `json.dumps()` | JSON object → `state["research_synthesis"]` |
| `trip_parameters` | `object` | ✅ | user | FastAPI POST body | session | `json.dumps()` | — |
| `retrieved_chunks` | `array[string]` | ✅ | system (RAG) | ChromaDB via LlamaIndex | call_only | Joined with `"\n\n---\n\n"` | — |

RAG failure handling: if `retrieved_chunks` is empty, `rag_failed=True` injects a visible warning into `research_synthesis["implicit_warnings"]` before it flows downstream.

### Call 4: plan_generation

| Field | Type | Required | Source | Acquire from | Retention | Shape | Deliver |
|---|---|---|---|---|---|---|---|
| `destination` | `string` | ✅ | user | FastAPI POST body | session | As-is | — |
| `research_synthesis` | `object` | ✅ | system | `state["research_synthesis"]` | session | `json.dumps()` | JSON object → `_enforce_plan_quality()` → `state["plan"]` |
| `user_profile` | `object` | ✅ | system | `state["user_profile"]` | session | `json.dumps()` | — |
| `trip_parameters` | `object` | ✅ | user | FastAPI POST body | session | `json.dumps()` | — |
| `explicit_requirements` | `array[string]` | no | user | Parsed from `onboarding_answers` at call time | call_only | Keyword-filtered, joined as bullet list | — |
| `toddler_constraint_block` | `string` | conditional | system | Derived from `_get_kid_ages(state)` | call_only | Hard-coded constraint string, injected when kid_ages ≤ 3 | — |

### Call 5: plan_refinement

| Field | Type | Required | Source | Acquire from | Retention | Shape | Deliver |
|---|---|---|---|---|---|---|---|
| `current_plan` | `object` | ✅ | system | `state["plan"]` | session | `json.dumps()` | JSON object → `_enforce_plan_quality()` → `state["plan"]` |
| `user_feedback` | `string` | ✅ | user | LangGraph interrupt → frontend input | call_only | `str()` cast | — |
| `recent_history` | `array[string]` | no | system | `state["refinement_history"][-3:]` | session (windowed) | `json.dumps()` of last 3 items | — |
| `user_profile` | `object` | ✅ | system | `state["user_profile"]` | session | `json.dumps()` | — |
| `trip_parameters` | `object` | ✅ | user | FastAPI POST body | session | `json.dumps()` | — |
| `rag_risks` | `array[string]` | ✅ | system (RAG) | `state["research_synthesis"]` local_risks + implicit_warnings | session | Joined as bullet list with preserve instruction | — |

---

## Fixes Applied in This Workflow

| Issue | Fix |
|---|---|
| Session persistence lost on server restart | Replaced `MemorySaver` with `SqliteSaver` backed by `checkpoints.db` |
| RAG failure silent | `rag_failed` flag injects visible warning into `research_synthesis["implicit_warnings"]` |
| `research_synthesis` dropped from refinement prompt | `rag_risks` injected into refinement prompt with "preserve verbatim" instruction |
| `_enforce_plan_quality` not called after refinement | Post-processing now runs on all three plan_assembly paths |
| 5-refinement hard cap | Removed — finalization only on explicit approval signal |
| `refinement_history` context bloat | Windowed to last 3 items in prompt; full history retained in state |
| `kid_ages` / `elderly` inconsistent lookup | `_get_kid_ages()` and `_get_elderly()` helpers unify all call sites |
| `previous_plan` dead state weight | Removed from state, all write sites, and initial state dicts |

## Deferred to Sprint 3

- Full `research_synthesis` object in refinement (currently only risks injected)
- `explicit_requirements` caching (re-parsed on every plan_assembly call)
- Long-term memory via Mem0/Zep (cross-trip user preferences)
- Observability: logging expanded queries, RAG chunk counts, token usage per call
