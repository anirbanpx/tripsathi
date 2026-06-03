# TripSathi — Personalization Re-Architecture Plan (Ambitious Edition)

> Goal: a **best-in-class personal travel assistant that knows you, asks like a human, and gets
> better every trip** — not "ChatGPT on another UI."
> Constraints removed by request: **no KISS/YAGNI throttle, no time limit.** Design for the ceiling.
> Plan only — nothing implemented yet.

## Decisions locked (with Anirban, 2026-06-03)

| Decision | Choice |
|---|---|
| Ambition | **Full taste-learning re-architecture** — an evolving preference model that compounds across trips |
| Interaction | Agent runs **adaptive clarifying dialogue** (highest-information questions, not a fixed form) |
| Identity | **Build the real onboarding flow now**; anonymous-persistent `user_id`, auth-ready |
| Budget | **Freemium paid-grade infra** that stays free for months (vector DB + embeddings + reranker + temporal memory) — see §4 |
| Engineering posture | **Maximize differentiation and depth.** Multi-agent, recsys-style ranking, critic loop, eval suite, voice. Complexity is acceptable where it buys a real capability. |

---

## ▶ RESUME HERE — Next Steps (session paused 2026-06-03, awaiting keys)

**Status:** all decisions locked; no code written yet. Build J (infra) is blocked until 5 keys land in `backend/.env`.

**Keys to fetch (all free, no credit card):**
| Env var | Get from |
|---|---|
| `VOYAGE_API_KEY` | voyageai.com (dashboard → API keys) |
| `GEMINI_API_KEY` | aistudio.google.com → Get API key |
| `QDRANT_URL` + `QDRANT_API_KEY` | cloud.qdrant.io → create free 1GB cluster |
| `ZEP_API_KEY` | getzep.com / Zep Cloud dashboard |

**PARALLEL TRACK — start now, needs ZERO new keys (only Groq + Google Maps + Tavily already present):**
1. **Build A foundation (no embeddings)** — `taste_profile` schema + per-dimension confidence, SQLite persistence (Railway-volume-ready path), real `OnboardingPage.tsx` replacing the stub, `/api/onboard` persists. *Taste-vector embedding piece deferred to J — clean split, no rework.* Files: `backend/taste.py` (new), `state.py`, `main.py`, `OnboardingPage.tsx`, `api.ts`.
2. **Build B — un-flatten the NL prompt** — carry `onboarding_summary` + verbatim `traveler_notes` through to synthesis/plan-gen. Pure code. Files: `TripInputStepper.tsx`, `api.ts`, `state.py`, `prompts.py`.
3. **Build D0 extractor (catalog JSON only)** — LLM over `rag/knowledge/*.md` + `search_places` enrichment → `backend/data/items/*.json`. *Qdrant indexing of the catalog waits for J.* Files: `backend/build_catalog.py` (new).
4. **Build E — destination-agnostic refactor** — replace `_enforce_plan_quality` Kerala strings with generic `PERSONA_RULES`; move Kerala specifics into `rag/knowledge/kerala.md`. Pure code/prompt. Files: `nodes.py`, `prompts.py`, `kerala.md`.
5. **Web query synthesizer helper** (Live Discovery thread, part of C) — taste→conditioned queries; testable with existing Tavily key. Files: `nodes.py`/new helper, `tools.py`.

**BLOCKED until keys (do in J, then the rest):** J (Voyage+Qdrant+Zep+persistent checkpointer), A's taste-vector embedding, C's semantic recall, D (ranker), G's Zep temporal writes.

**Recommended first move next session:** Build A foundation (unblocks everything downstream) → B → D0 extractor, in that order. When keys arrive, do J, then resume the dependency chain at C.

---

## 1. Why it reads as "ChatGPT on a UI" today (diagnosis — brief)

1. **No real onboarding** — `OnboardingPage.tsx` is a stub; `onboarding_answers` are faked in `api.ts` from 3 stepper fields.
2. **Personalization hardcoded to Kerala** — `_enforce_plan_quality` is ~90 lines of `if "kerala"` houseboat/Alleppey logic.
3. **NL prompt flattened into slots** — `parseIntent` discards prose; even the `onboarding_summary` it produces is thrown away.
4. **Memory stores demographics, not taste** — one templated sentence per trip; refinements (the best signal) never persisted.
5. **Personalization is invisible** — the plan never explains *why* a choice fits *you*.
6. **The pipeline is a single linear pass** — no candidate generation, no ranking, no self-critique. Output quality = one LLM call's first draft.

---

## 2. Target architecture — a multi-agent Taste Engine

Move from a **linear pipeline** to a **multi-agent system with recsys-style ranking and a self-critique loop**. The user's taste is a first-class, evolving, *inspectable* asset ("Travel DNA").

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │  TRAVEL DNA  (per user, evolving, inspectable & editable)                │
 │  • declared taste (onboarding + prompt)                                  │
 │  • taste VECTOR (embedded preference statements) ── semantic recall      │
 │  • temporal graph (Zep): how preferences CHANGED over time               │
 │  • per-dimension confidence (what we know vs. must ask)                   │
 └────────────────────────────────────────────────────────────────────────┘
        ▲ learns                                            │ feeds
        │                                                   ▼
  ┌─────┴───────────┐   ┌──────────────────────────────────────────────────┐
  │ Refinement      │   │            AGENT GRAPH (LangGraph)                │
  │ → taste deltas  │   │                                                   │
  │ Finalize        │   │  1 Taste Resolver  — load DNA + semantic recall,  │
  │ → episodic +    │   │                      compute uncertainty          │
  │   temporal write│   │  2 Clarify (adaptive) — ask highest-EV questions  │
  └─────────────────┘   │  3 Research (DeepAgents) — destination intel      │
                        │  4 Candidate Gen   — pool of activities/hotels    │
                        │  5 Personalized Ranker — score vs taste vector    │
                        │                      (Voyage rerank) + constraints │
                        │  6 Plan Assembler  — day-by-day from ranked pool  │
                        │  7 Critic (red-team) — find mismatches → revise   │
                        │  8 Explain-back    — per-item "why for you" + score│
                        │  9 HITL refine     → loop back, learn             │
                        └──────────────────────────────────────────────────┘
```

### Why each new agent earns its place
- **Taste Resolver + confidence** turns memory from "a string we paste in" into a *reasoned context* with an explicit "what don't I know" estimate — which drives Clarify.
- **Adaptive Clarify** is the human-feel differentiator: it asks the *highest-information* questions for *this* user/trip, using DNA to avoid asking what it already knows.
- **Candidate Generation + Personalized Ranker** is the leap from "LLM writes an itinerary" to "system *selects* from real options scored to your taste" — recsys, not autocomplete. This is what makes two users' plans for the same destination genuinely different.
- **Critic loop** red-teams the draft against the full profile *before* the user sees it — catches "you scheduled a 6km hike for someone with a knee issue" automatically.
- **Explain-back with match scores** makes the personalization visible and inspectable.

---

## 3. The Taste Model (Travel DNA) — done properly

### Schema (`taste_profile`, per `user_id`)
Qualitative + weighted, with **per-dimension confidence**:
- `pace`, `crowd_tolerance`, `immersion_style` (local/authentic ↔ curated/comfort)
- `food_adventurousness`, `dietary_restrictions`, `walking_tolerance`
- `interests` — **weighted vector** (nature, heritage, food, nightlife, photography, spiritual, adventure, wildlife, shopping, wellness)
- `accommodation_taste` (boutique/homestay ↔ chain/resort), `planning_density` (packed ↔ slow)
- `hard_avoids[]`, `decision_style` (L1–L3 autonomy), recurring `occasion` patterns
- `confidence{dimension: 0–1}` — drives Clarify and active learning

### Three signal sources → one model
1. **Declared** — onboarding (one-time, can be conversational/voice) + each trip's NL prompt kept verbatim.
2. **Inferred (gold)** — every accepted refinement → a *taste delta* via an extraction call over the before/after plan diff. ("Moved dinner to 7pm" → early-dinner pref; "dropped the museum for the market" → markets > indoor culture.)
3. **Historical/temporal** — past destinations/styles, and **how taste changed over time** (Zep temporal knowledge graph: "was vegetarian → now vegan", "used to want packed days → now prefers slow").

### Three stores, each doing what it's best at
- **Structured `taste_profile` JSON** (Postgres/SQLite, persistent) — the canonical, editable DNA.
- **Qdrant** — embedded taste statements + past-trip notes for **semantic recall** during planning ("you loved the quiet homestay in Coorg" surfaces when planning a new hill trip) and for the **ranker**.
- **Zep** — temporal graph for *evolving* preferences (the dimension Mem0 alone can't model). Mem0 stays for plain episodic recall.

### Active learning
Early in a session, offer 1–2 **A/B micro-choices** ("more this or this?" with two images) to calibrate low-confidence dimensions fast — preference elicitation, not interrogation.

---

## 4. Infra & budget (web research, June 2026) — still ₹0/mo for months, no card

| Layer | Pick | Free allowance | Note |
|---|---|---|---|
| Embeddings | **Voyage `voyage-3.5-lite`** + Gemini `text-embedding-004` fallback | 200M tok one-time (~150k pages) + 1,500 req/day recurring | top MTEB quality; no card |
| **Reranker** | **Voyage `rerank-2.5`** | **200M tokens free** | powers the Personalized Ranker — recsys scoring at zero cost |
| Vector DB | **Qdrant Cloud free** | 1GB forever (~250k vectors) | idles out after 1 wk → weekly keep-alive cron |
| Episodic memory | **Mem0 Cloud** (keep) | existing free tier | plain recall |
| **Temporal memory** | **Zep** (free/community tier) | evolving-preference graph | already on your stack shortlist |
| Voice (optional) | Whisper (local/Groq) STT + ElevenLabs free tier TTS | conversational onboarding | from your stack |
| Observability | Phoenix (local, free) or LangSmith free | trace the taste signals for the demo | — |

**Net: free for months, no credit card.** The reranker is the standout unlock — it makes the Ranker real without paying for a recsys service.

Sources:
- Qdrant free tier — https://qdrant.tech/pricing/ , https://ranksquire.com/2026/04/19/qdrant-cloud-pricing-2026/
- Voyage 200M free (embeddings **and** rerank) — https://docs.voyageai.com/docs/pricing
- Gemini embeddings free — https://www.edenai.co/post/top-free-embedding-tools-apis-and-open-source-models
- Vector DB comparison — https://www.datacamp.com/blog/the-top-5-vector-databases

---

## 5. The builds

### A — Travel DNA schema + real onboarding (foundation)
- Backend `taste.py`: `TasteProfile` + per-dimension confidence, `load/merge`, persistent store (Postgres on Railway, or SQLite volume).
- Frontend: replace `OnboardingPage.tsx` stub. **Two modes** — quick form *and* an optional **conversational/voice onboarding** ("tell me about a trip you loved and one you regretted"). Captures declared taste; never gates the demo.
- "**Your Travel DNA**" page — inspectable, editable; itself a portfolio centerpiece.
- Files: `OnboardingPage.tsx`, new `TravelDnaPage.tsx`, `api.ts`, `backend/taste.py`, `main.py`, `state.py`.

### B — Stop flattening the NL prompt
- Carry `onboarding_summary` + a verbatim `traveler_notes` through to synthesis, ranking, plan-gen, and taste extraction.
- Files: `TripInputStepper.tsx`, `api.ts`, `state.py`, `prompts.py`.

### C — Taste Resolver + adaptive Clarify agent
- `taste_resolver` node: load DNA, semantic-recall relevant past taste (Qdrant/Zep), output a working taste context + per-dimension uncertainty.
- `clarify` node: rank candidate questions by **expected information gain**, ask top-N adaptively via `interrupt()`; optionally A/B micro-choices. Skips dimensions it's already confident about.
- Files: `graph.py`, `nodes.py` (`taste_resolver`, `clarify`), `prompts.py` (`CLARIFY_SYSTEM`), planner UI for question/AB rendering.

### D0 — Item Catalog (structured metadata layer) — **prerequisite for D**
**Why:** today the only embedding metadata is `destination`; the Ranker has no discrete, attributed items to score. The facts exist in the prose but are locked in text. Decision (2026-06-03): **separate auto-extracted catalog, keep prose as single source** (re-run extraction when new `.md` files are added — fits the "add more places weekly" workflow).
- One-time + re-runnable **LLM extraction** over each `rag/knowledge/*.md` → `items.json` per destination. Item schema:
  `{ id, name, destination, area, coords, type(activity|hotel|restaurant|experience|viewpoint),
    interest_tags[], cost_inr, cost_tier, duration_hours, time_of_day, indoor_outdoor,
    walk_distance_km, terrain, step_count, toddler_ok, child_min_age, elderly_ok, mobility_ok,
    best_months[], avoid_months[], google_rating, source_excerpt }`
- **Enrich** coords + ratings via existing `search_places` (Google Maps) tool; **seed** names/images from `placesMap.generated.json` (113 places).
- **Index each item as its own Qdrant node** — embed `name + tags + source_excerpt`, store the rest as filterable payload. (Also delivers the metadata-filtering win from `rag_latency_next`.)
- Prose RAG remains for research/risk/routing; the catalog powers candidate-gen + ranking.
- Files: new `backend/build_catalog.py` (extractor), `backend/data/items/*.json`, `rag/indexer.py` (dual index: prose + items), `tools.py`.

### D — Candidate Generation + Personalized Ranker (the recsys leap)
- `candidate_gen` node: assemble a pool of real activities/hotels/restaurants from RAG + Google Places + web.
- `ranker` node: embed candidates, score each against the **taste vector + constraints** using **Voyage rerank**; output a ranked shortlist with **match scores + reasons**.
- `plan_assembler` builds the itinerary from the ranked shortlist (routing/timing aware) instead of free-generating.
- Files: `nodes.py` (`candidate_gen`, `ranker`, refactor `plan_assembly`), `tools.py`, `prompts.py`, `rag/indexer.py`.

### Cross-cutting thread — Live Personalized Discovery (web search) — woven into C, D0, D
**Why:** today `web_search` (Tavily→DDG) runs persona-blind queries (`[destination] hotels`) — same as a chat wrapper. The differentiator is web search as a **personalized candidate source in the taste→query→candidates→rerank→explain→learn loop**, plus a **freshness layer** the static corpus can't provide. Decision (2026-06-03): **balanced, 3–6 conditioned searches/plan**, cache by (destination, taste-hash, date-window), DDG as free overflow (~160–330 plans/mo within Tavily free tier).
- **Query synthesizer** (in C): turn `taste_profile + trip_parameters + occasion` into N conditioned queries — e.g. accommodation_taste=boutique → "working coffee-estate homestay quiet non-resort"; crowd=low → "offbeat hidden spots away from crowds"; diet=vegan → "vegan-friendly restaurants". Replaces hardcoded query strings in `_run_research_agent` + `_run_targeted_risk_search`.
- **Date×taste event scan**: one query/plan for festivals/events/seasonal happenings during the user's exact dates, filtered to their interests → personalized "while you're there" items.
- **Web→items→rerank** (in D0/D): web results extracted into the same Item Catalog schema with `content_source:"web"` + freshness date, then Voyage-reranked — not pasted into the prompt. Fills the candidate pool for low-corpus destinations.
- **Trust verification**: targeted web check of *recent* reviews for any recommended operator (turns static houseboat-trust insight into a live-verified signal).
- **Division of authority:** static corpus = authoritative for risk/trust; web = authoritative for price/availability/events. Date-stamp + cite web items; never let stale scraped prices silently override.
- **Guardrails:** ~3–6 searches/plan, cache, parallelize via the existing `ThreadPoolExecutor` pattern, DDG overflow.
- Files: `tools.py`, `nodes.py` (`clarify`/research query synth, `candidate_gen`), new query-synth helper, `prompts.py`.

### E — Destination-agnostic personalization
- Replace `_enforce_plan_quality`'s Kerala strings with a generic `PERSONA_RULES` table; push destination-specific risks into `rag/knowledge/*.md`. Code only *guarantees* RAG risks reach `plan.warnings` (already general — keep).
- Files: `nodes.py`, `rag/knowledge/kerala.md` (+ siblings), `prompts.py`.

### F — Critic / red-team loop
- `critic` node reviews the assembled plan against the full profile (taste + constraints + occasion), emits a mismatch list; `plan_assembler` auto-revises until clean or N passes. Runs **before** the user sees the plan.
- Files: `graph.py` (critic node + revise edge), `nodes.py` (`critic`), `prompts.py` (`CRITIC_SYSTEM`).

### G — Learn from refinements (compounding loop)
- On each refine + finalize: taste-extraction call over the plan diff → `merge_taste()` + Mem0 episodic + Zep temporal + Qdrant embed.
- Read taste into resolver, clarify, ranker, and plan-gen (today memory only reaches persona classification).
- Files: `nodes.py`, `memory.py`, `taste.py`.

### H — Explain-back (visible personalization)
- `personalization_notes: [{signal, decision}]` at plan level + **per-item "why for you" + match score** from the ranker.
- "Tailored for you" strip in `PlanDisplay.tsx`; match-score chips on activity/hotel cards.
- Files: `prompts.py`, `types/index.ts`, `PlanDisplay.tsx`, card components.

### I — Personalization evaluation suite (DeepEval) — proves the differentiation
Custom metrics, run as a regression suite:
- **Personalization delta** — same destination, two personas → measurably different plans (the anti-"ChatGPT" proof).
- **Taste adherence** — does the plan reflect the user's weighted interests / avoids?
- **Constraint adherence** — kid/elderly/budget/dietary honored (regression guard).
- **Clarify quality** — were the questions high-information and non-redundant vs DNA?
- **Compounding** — trip 2 scores higher on taste adherence than trip 1 for the same user.
- Files: `backend/run_eval_deepeval.py`, new metric modules, `data/evaluations_data.csv` extensions.

### J — Infra migration + observability
- LlamaIndex → Voyage embeddings + Qdrant; add Voyage rerank; Zep temporal memory; SqliteSaver/Postgres checkpointer; Qdrant keep-alive cron; Phoenix/LangSmith tracing of taste signals for the demo.
- Files: `rag/indexer.py`, `reindex.py`, `graph.py`, `memory.py`, `requirements.txt`, env vars.

### K — Conversational / voice onboarding (optional but high-impact for portfolio)
- Whisper STT + ElevenLabs TTS for a spoken "tell me about your travel taste" intake → feeds Travel DNA. Strong live-demo wow.

---

## 6. Sequencing (by dependency, not time)

```
Foundation:   J (infra) → A (Travel DNA + onboarding)
Core engine:  B (prompt) → C (resolver+clarify) → D (candidate gen + ranker) → E (dest-agnostic)
Quality loop: F (critic) → G (learn from refinements) → H (explain-back)
Proof:        I (eval suite)  ‖  K (voice)  — last, demo-strongest
```
D depends on J+A; F depends on D; G depends on A; I depends on E+G.

---

## 7. Demo narrative (the differentiator, made tangible)

Design the demo to **show taste compounding**:
1. New user does voice onboarding → Travel DNA visibly populated with confidence bars.
2. Trip 1 (Kerala): clarify asks 2 sharp questions; plan shows match scores + "why for you"; user refines twice.
3. Travel DNA updates live from those refinements (confidence rises, new prefs appear).
4. Trip 2 (Coorg, weeks later): **fewer questions asked** (it remembers), plan pre-tuned to the learned taste, explain-back references the past trip. Eval suite shows trip 2's taste-adherence score is higher than trip 1's.

That side-by-side ("it learned me") is the portfolio money shot no ChatGPT-wrapper can fake.

---

## Confirmed decisions (2026-06-03)
1. **Identity:** anonymous-persistent `user_id` now (localStorage), schema designed auth-ready; real Google/phone auth deferred.
2. **Embeddings/rerank:** Voyage `voyage-3.5-lite` + `rerank-2.5` primary, Gemini `text-embedding-004` auto-fallback.
3. **Temporal memory:** add **Zep** (evolving-preference graph) alongside Mem0 (episodic) + structured taste JSON.
4. **Voice:** **STT-only via local Whisper (₹0)** — speak your taste during onboarding; no TTS (assistant talk-back dropped as cost/low-value). Build last, as demo polish.
5. **Persistence:** Railway **persistent volume + SQLite** for the LangGraph checkpointer and the structured `taste_profile` table (not Postgres).

## Build J prep findings (2026-06-03) — read before starting infra migration
- **Embeddings today:** local HuggingFace `BAAI/bge-small-en-v1.5` (**384-dim**, free). Voyage `voyage-3.5-lite` is **1024-dim** → mismatch → **full re-index mandatory**; Qdrant collection must be created with the correct vector size.
- **Indexing logic is duplicated** in `backend/rag/indexer.py` AND `backend/reindex.py` (both hardcode HF embed + Chroma `PersistentClient` at `data/chroma_db`). Consolidate into one module during migration. 18 destination .md files currently indexed (~1.3 MB Chroma).
- **`reindex.py` runs on EVERY boot** (in `nixpacks.toml` `[start]` and `backend/Procfile`) — a workaround for ephemeral local Chroma. With hosted Qdrant, index **once**; **remove `reindex.py` from the start command** (else it burns Voyage tokens + adds cold-start latency each deploy).
- **Checkpointer** already `SqliteSaver` → relative `checkpoints.db` (ephemeral on Railway). Point it (and the taste SQLite DB) at the new Railway persistent volume.
- **Keys present:** LLM/Groq, Tavily, Google Maps, OpenWeather, Mem0, Unsplash, Phoenix. **Missing — acquire:** `VOYAGE_API_KEY`, `GEMINI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `ZEP_API_KEY`.
- **requirements.txt to add:** `voyageai`, `llama-index-embeddings-voyageai`, `llama-index-vector-stores-qdrant`, `qdrant-client`, Gemini embedding pkg (`llama-index-embeddings-gemini`), Zep client (`zep-cloud` or `zep-python`). Can drop `llama-index-embeddings-huggingface` + `llama-index-vector-stores-chroma` once migration verified.
