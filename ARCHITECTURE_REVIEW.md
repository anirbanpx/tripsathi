# TripSathi Architecture Review
*Date: 2026-06-04 | Reviewed by: Claude Code (claude-sonnet-4-6)*

---

## Overall Grade: B-

Strong foundation, production-deployed, HITL works. The observability and knowledge layers need hardening before this is portfolio-ready.

| Dimension | Grade | One-line rationale |
|---|---|---|
| Agentic AI patterns | B | LangGraph + HITL + critic loop solid; Mem0 unwired, tools unused, no subgraphs |
| Error handling | C+ | LLM failover excellent; RAG silent, no error node, no token-size guard |
| Knowledge usage | B- | Voyage + metadata filtering strong; top_k too low, no retrieval gate, 10 destinations unindexed |
| Cost & latency | D+ | Token counts logged; nothing else instrumented |
| Security | C- | Keys committed to repo, CORS incomplete, no rate limiting |

---

## 1. System Architecture

### Graph Topology

```
persona_classification
      ↓
destination_intelligence   ← RAG + query expansion (LlamaIndex + Qdrant Cloud)
      ↓
candidate_gen              ← structured LLM JSON extraction
      ↓
ranker                     ← Voyage/Cohere cross-encoder reranking
      ↓
plan_assembly ←────────────────────────────────┐
      ↓                                        │
   critic ──── [fail, < 2 passes] ────────────┘
      ↓ [pass or pass-2]
human_feedback   ← LangGraph interrupt()
      ↓                          ↓ [regenerate]
   finalize              plan_assembly (regeneration path)
```

### Key Infrastructure

| Layer | Tech | Status |
|---|---|---|
| Orchestration | LangGraph StateGraph + SqliteSaver (`checkpoints.db`) | ✅ Live |
| LLM | Groq (openai/gpt-oss-120b) → Cerebras → Gemini failover | ✅ Live |
| RAG | LlamaIndex + Qdrant Cloud, Voyage voyage-3.5-lite embeddings | ✅ Live (9/19 destinations) |
| Long-term memory | Mem0 Cloud | ⚠️ Installed, not wired |
| Taste persistence | TasteProfile SQLite (`data/taste.db`) | ✅ Live |
| Observability | Phoenix Arize OTEL | ⚠️ Local-only |
| Backend deploy | Railway (`https://tripsathi-production.up.railway.app`) | ✅ Live |
| Frontend deploy | Vercel (`https://frontend-agent-demo-s-projects.vercel.app`) | ✅ Live |

### State Schema (`state.py`)

```python
class TripSathiState(TypedDict):
    # Immutable inputs
    destination: str
    trip_parameters: dict          # duration_nights, budget_total, travel_dates, group_size, user_id
    onboarding_answers: list[dict]

    # Agent-written outputs
    user_profile: Optional[dict]         # persona, constraints (kid_ages, elderly, etc.)
    research_synthesis: Optional[dict]   # routing, key_places, local_risks, implicit_warnings
    candidates: Optional[list]
    ranked_candidates: Optional[list]
    plan: Optional[dict]

    # HITL refinement
    user_feedback: Optional[str]
    refinement_count: int
    refinement_history: list[str]
    regenerate_requested: bool

    # Personalization
    taste_profile: Optional[dict]
    traveler_notes: Optional[str]

    # Critic loop control
    critic_passes: int                   # capped at 2

    # Meta
    awaiting_feedback: bool
    current_node: str
    stage_label: str
    error: Optional[str]
```

---

## 2. Agentic AI Patterns — Assessment

### What's Done Well

| Pattern | Implementation | Grade |
|---|---|---|
| LangGraph state machine | TypedDict state, 8 nodes, declarative edges | A |
| HITL interrupt | `interrupt()` + `Command(resume=...)` via `/api/refine` and `/api/regenerate` | A |
| Multi-provider LLM failover | Groq → Cerebras → Gemini, task-routing, per-provider cooldown | A- |
| Critic-loop self-correction | Auto red-teams plan vs. taste profile; loops back to plan_assembly (max 2 passes) | B+ |
| RAG-augmented synthesis | LlamaIndex + Qdrant Cloud, metadata-filtered by destination | B+ |
| Persona-first reasoning | User profile drives queries, filtering, plan prompts | B+ |
| Constraint post-processing | `_enforce_plan_quality()` catches toddler/elderly violations after LLM generation | B |
| Session checkpointing | Full state resumable from SQLite after app restart | A |

### Task-Based LLM Routing (`nodes.py`)

```python
_TASK_CHAINS = {
    "synthesis":     ["gemini", "groq", "cerebras"],   # long-context → Gemini first
    "candidate_gen": ["gemini", "groq", "cerebras"],   # structured extraction → Gemini first
    "plan":          ["groq", "cerebras", "gemini"],   # reasoning → Groq first
    "critic":        ["groq", "cerebras", "gemini"],   # critique → Groq first
    "default":       ["groq", "cerebras", "gemini"],
}
```

### Critical Gaps

**1. Mem0 Not Wired (P0)**
- `memory.py` has `read_memories()` and `write_memory()` fully implemented; Mem0 API key set.
- Neither is called in any graph node in `nodes.py`.
- Impact: Every session starts cold. "Personalization over time" is non-functional.
- Fix: Call `read_memories(user_id)` in `persona_classification`; call `write_memory(...)` in `finalize`.

**2. Tools Defined But Never Called (P2)**
- `tools.py` defines `web_search` (Tavily/DuckDuckGo), `get_weather`, `search_places` (Google Maps), `knowledge_base_query` — all working.
- None are invoked by any graph node. RAG corpus is the only live knowledge source.
- Impact: No live weather, no real-time place data, no web search grounding.
- Fix: Refactor `destination_intelligence` into a tool-calling agent that dispatches to RAG, web search, and weather based on query type.

**3. No Hierarchical Agent Structure / Subgraphs (P2)**
- All 8 nodes are flat in one graph. No nested subgraphs.
- Impact: The critic cannot delegate to a specialized repair agent; it can only loop back to full plan_assembly. No isolation of concerns.
- Opportunity: `critic + plan_assembly` → self-correction subgraph; `candidate_gen + ranker` → ranking subgraph.

**4. Persona Is Input-Only, Never Updated (P2)**
- Persona classified once at `persona_classification` from onboarding answers. Never updated based on HITL refinement signals.
- If a user consistently rejects adventurous suggestions, the persona stays "adventurous".

**5. Taste Learning Is End-of-Session Only (P2)**
- Taste deltas extracted from `refinement_history` only at `finalize` time.
- Ranker uses the *initial* taste profile for scoring — never the within-session signal.
- Confidence bumps +0.2 per session; never decrements. Interests dict overwritten, not blended.

**6. HITL Sessions Never Expire (P1)**
- If user closes browser after interrupt, thread hangs indefinitely in `checkpoints.db`.
- No TTL, no cleanup job, no expiry signal. Sessions accumulate.
- Fix: Background job to expire threads older than 24h.

**7. Streaming Is Coarse-Grained (P2)**
- SSE emits one `stage_label` event per node. Each node takes 15-40s; users see no progress within a node.
- Uses ThreadPoolExecutor + asyncio.Queue (correct, but limits upgrade to `astream_events`).

---

## 3. Error Analysis

### Error Handling Map

| Component | Error Type | Current Handling | Gap Severity |
|---|---|---|---|
| `_call_llm()` | Rate limit (429) | Cooldown + failover | None |
| `_call_llm()` | Context length | Skip to next provider | Medium (no pre-check) |
| `_call_llm()` | JSON parse failure | Retry with stricter prompt | Low |
| `_call_llm()` | All providers exhausted | `RuntimeError` → node sets `state["error"]` | **Critical** — no error node |
| `destination_intelligence` | RAG query failure | `rag_failed=True`, empty corpus | **Critical** — no logging |
| `destination_intelligence` | Embedding failure | Not caught | **Critical** — hard crash |
| `persona_classification` | LLM failure | Sets `state["error"]` | **Critical** — graph continues anyway |
| `critic` | LLM failure | Warns + passes through | Low (non-fatal correct) |
| `memory.py: read_memories` | Mem0 API failure | Warns, returns `""` | Low (correct) |
| `memory.py: write_memory` | Mem0 API failure | Warns, drops | Low (no retry) |
| `reindex.py` | Embedding batch failure | **No try/except** | High — partial index crash |
| Streaming endpoint | Client disconnect | Loop continues until done | Medium — wastes resources |

### Critical Error Gaps

**Gap 1: No "error" terminal node in graph**
- When a node sets `state["error"]`, the graph continues to the next node in the pipeline.
- `candidate_gen` after a failed `destination_intelligence` receives empty state → produces garbage output.
- Fix: Add `error` node → `END`. Add conditional edge from every node: if `state.get("error")`, route to `error` node.
- Files: `backend/graph.py`, `backend/nodes.py`

**Gap 2: Silent RAG failures**
- `destination_intelligence` catches all RAG errors silently. No `logger.error()`. No operator visibility.
- Fix: `logger.error("RAG query failed for %s: %s", destination, e)` in the except block.
- File: `backend/nodes.py: destination_intelligence()`

**Gap 3: No token-size guard before LLM calls**
- `_call_llm()` doesn't estimate token count before sending. Context-length errors waste one full provider attempt.
- Fix: Estimate with `tiktoken` before each call; truncate synthesis if over limit.
- File: `backend/nodes.py: _call_llm()`

**Gap 4: `reindex.py` embedding batch not wrapped**
- Voyage API failure mid-batch crashes the script, leaving a partial index in Qdrant.
- Fix: Wrap `embed_fn` call in try/except with batch-level retry.
- File: `backend/reindex.py`

**Gap 5: No rate limiting on FastAPI endpoints**
- Any caller can trigger unlimited 6-node graph runs. Groq 200k TPD quota exhausted in ~3 runs.
- Fix: `slowapi` middleware, 2 req/min per IP on `/api/plan`.
- File: `backend/main.py`

---

## 4. Knowledge Usage Effectiveness

### RAG Pipeline Scorecard

| Dimension | Implementation | Grade | Notes |
|---|---|---|---|
| Chunking | Fixed 800-char + 100-char overlap, sentence-respecting | B | Semantic chunking would improve but adequate |
| Embedding | Voyage voyage-3.5-lite (1024-dim) → Cohere fallback | A- | Strong choice; outperforms OpenAI for retrieval |
| Metadata filtering | Destination-slug exact match on Qdrant payload | A | Clean; prevents cross-destination contamination |
| Query expansion | 5-7 persona-specific queries via LLM | A- | Toddler/elderly variants well-designed |
| Retrieval depth | `similarity_top_k=5` (fixed) | C | Too low — only 20% of indexed chunks visible |
| Reranking | Voyage rerank-2.5 → Cohere fallback (cross-encoder) | B+ | Correct architecture |
| Parallel retrieval | Not implemented — sequential | C | 7 queries × ~1s = 7s blocked |
| Retrieval quality gate | Not implemented | D | No re-query if `local_risks` empty |
| Corpus coverage | 9 of 19 destinations indexed in Qdrant | C | Half the corpus uses general LLM knowledge |

### Knowledge Gaps

**Gap 1: `similarity_top_k=5` too conservative** (P1)
- Each destination: ~25-30 chunks. Retrieving only 5 means 75-80% of indexed knowledge never seen.
- 5 chunks × 800 chars = ~4KB context for full destination synthesis — too little.
- Fix: Raise to `similarity_top_k=12`, rerank to top 6. Net same final context, much better recall.
- File: `backend/rag/indexer.py:88`

**Gap 2: No retrieval quality gate** (P1)
- After synthesis, if `local_risks == []` or fewer than 2 entries, no re-query happens.
- Root cause of Angle B eval failures (operator fraud, seasonal timing, food scarcity).
- Fix: Post-synthesis check; if `local_risks < 2`, re-run 2-3 targeted queries ("scam warning {destination}", "seasonal risk {destination}") and re-synthesize.
- File: `backend/nodes.py: destination_intelligence()`

**Gap 3: Sequential RAG queries** (P2)
- 7 expanded queries × ~1s each = 7-10s blocking in `destination_intelligence`.
- Fix: Wrap in `asyncio.gather()` with async-compatible query engine, or use Qdrant batch search API.
- File: `backend/nodes.py: destination_intelligence()`

**Gap 4: Tools not integrated as knowledge sources** (P2)
- `web_search`, `get_weather`, `search_places` implemented but unused.
- Fix: Refactor `destination_intelligence` into tool-calling agent.

**Gap 5: 10 destinations not indexed** (P3)
- Run `reindex.py` for the remaining 10 destinations.

---

## 5. Cost & Latency

### Instrumentation Status

| Signal | Tracked | Where |
|---|---|---|
| Per-call token count (prompt + completion) | ✅ | `_call_llm()` → `logger.info()` |
| Provider + model per call | ✅ | Same log line |
| Provider cooldown | ✅ | `_disabled_until` dict |
| Phoenix OTEL traces | ✅ optional | If `PHOENIX_ENABLED=true` |
| End-to-end latency per plan | ❌ | Not tracked |
| Per-node latency | ❌ | Not tracked |
| Per-RAG-query latency | ❌ | Not tracked |
| Cost estimation ($ or ₹ per plan) | ❌ | Not calculated |
| Per-session cost aggregation | ❌ | Not tracked |
| Budget enforcement | ❌ | Not enforced |

### Latency Estimate (Back-of-Envelope)

| Node | Estimated Time | Notes |
|---|---|---|
| persona_classification | 3-5s | Simple LLM call |
| destination_intelligence | 15-25s | 7 sequential RAG queries + expansion + synthesis |
| candidate_gen | 8-12s | Large JSON extraction (4096 tokens) |
| ranker | 2-5s | Voyage rerank API |
| plan_assembly | 10-20s | Plan generation (4096 tokens) |
| critic | 5-8s | Critique LLM call |
| **Total (happy path)** | **43–75s** | No measurement exists to confirm this |

**Biggest bottleneck**: `destination_intelligence` — 15-25s due to sequential RAG. Parallelizing queries alone would save ~8s.

### Cost Estimate (Back-of-Envelope)

Groq (openai/gpt-oss-120b): ~$0.90/1M tokens (approx).

| Task | Approx Tokens | Estimated Cost |
|---|---|---|
| Query expansion | 700 | ~$0.0006 |
| Synthesis | 3,800 | ~$0.0034 |
| Candidate gen | 5,200 | ~$0.0047 |
| Plan assembly | 7,000 | ~$0.0063 |
| Critic | 4,500 | ~$0.0041 |
| Persona classification | 1,100 | ~$0.001 |
| **Total per plan** | **~22,300** | **~$0.02 (~₹1.70)** |

Free tier (200k TPD): ~9 full plan runs/day. With 1 refinement each: ~6-7 plans/day.

No prompt caching in place — large system prompts (PLAN_GENERATION_SYSTEM, CRITIC_SYSTEM, ~1KB each) re-sent on every call.

### What to Add for Visibility (All Low-Effort)

1. **Per-node timing** — `time.perf_counter()` wrap in each node, log `node={name} elapsed={ms}ms`. ~10 lines.
2. **Per-session token aggregation** — accumulate in state across nodes, log total at `finalize`. ~5 lines.
3. **Cost multiplication** — hardcode per-model pricing dict; multiply at `finalize`. ~10 lines.
4. **Per-chunk stream timing** — add timestamp to each SSE event so frontend can show elapsed per stage.

---

## 6. Security Issues

| Issue | Severity | Fix |
|---|---|---|
| API keys in `.env` committed to repo (LLM, Qdrant, Mem0, Voyage, Cohere) | Critical | Rotate all keys; use Railway/Vercel secrets; ensure `.env` in `.gitignore` |
| Production CORS URLs missing from `main.py:45` | High | Add Railway + Vercel URLs to `allow_origins` in `CORSMiddleware` |
| No request rate limiting on any endpoint | Medium | Add `slowapi`, 2 req/min per IP on `/api/plan` |

---

## 7. Priority Punch List

### P0 — Fix Now (correctness or security)

1. **Wire Mem0** — call `read_memories(user_id)` in `persona_classification`; `write_memory(...)` in `finalize` (`backend/nodes.py`)
2. **Add error terminal node** — `error` node in graph + conditional routing from each node if `state.get("error")` (`backend/graph.py` + `nodes.py`)
3. **Log RAG failures** — `logger.error()` in the silent except block in `destination_intelligence` (`backend/nodes.py`)
4. **Fix production CORS** — add Railway + Vercel URLs to `allow_origins` (`backend/main.py:45`)
5. **Rotate exposed API keys** — move all to Railway/Vercel secrets manager

### P1 — High Value, Low Effort

6. **Per-node latency logging** — `perf_counter()` wrap in each node (~10 lines in `nodes.py`)
7. **Per-session token aggregation + cost estimate** — accumulate in state, multiply at finalize (~15 lines)
8. **Raise `similarity_top_k` 5 → 12** — immediate retrieval quality gain (`backend/rag/indexer.py:88`)
9. **Retrieval quality gate** — post-synthesis re-query if `local_risks < 2` (`backend/nodes.py: destination_intelligence()`)
10. **`slowapi` rate limiter** — 2 req/min per IP on `/api/plan` (`backend/main.py`)

### P2 — Architecture Improvements

11. **Parallelize RAG queries** with `asyncio.gather()` — cuts `destination_intelligence` from ~15s to ~3s
12. **HITL session TTL** — background job to expire stale `checkpoints.db` threads after 24h
13. **Refactor tools into tool-calling agent** — `destination_intelligence` dispatches to RAG, `web_search`, `get_weather`
14. **Granular SSE streaming** — per-LLM-token streaming via `astream_events` (requires LangGraph async upgrade)
15. **Error recovery path** — dedicated graceful degradation when all LLM providers exhausted

### P3 — Portfolio Completeness

16. **Scale eval suite to CI** — wire `run_eval_deepeval.py` into GitHub Actions; add 3-5× test case coverage
17. **Cost analysis report** — run eval batch, parse token logs, produce ₹/plan figure
18. **Complete TTS** — ElevenLabs/Deepgram endpoint in `main.py` + frontend audio playback
19. **Index remaining 10 destinations** — run `reindex.py` for full corpus
20. **Deploy Phoenix to production** — currently localhost:6006 only

---

## 8. File Reference Map

| Fix | File | Location |
|---|---|---|
| Mem0 wiring | `backend/nodes.py` | `persona_classification()` + `finalize()` |
| Error terminal node | `backend/graph.py` + `nodes.py` | New `error` node; conditional edges from each node |
| RAG failure logging | `backend/nodes.py` | `destination_intelligence()` except block |
| CORS fix | `backend/main.py` | Line 45, `allow_origins` list |
| top_k increase | `backend/rag/indexer.py` | Line 88, `similarity_top_k=5` |
| Retrieval quality gate | `backend/nodes.py` | `destination_intelligence()`, post-synthesis |
| Latency logging | `backend/nodes.py` | Each node function |
| Cost estimation | `backend/nodes.py` | `_call_llm()` accumulate; `finalize()` report |
| Rate limiting | `backend/main.py` | New `slowapi` middleware + decorator on `/api/plan` |
| Parallel RAG | `backend/nodes.py` | `destination_intelligence()` query loop |
| Embed batch safety | `backend/reindex.py` | Wrap `embed_fn` call in try/except |
