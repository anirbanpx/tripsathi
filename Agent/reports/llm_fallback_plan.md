# Plan: Multi-provider LLM fallback (Cerebras → Gemini)

> Status: **designed, not yet executed.** Pick this up fresh next session.
> User decisions are locked in (cascade order + trigger policy). Phases 2–3 are optional.

## Context

TripSathi's entire planning pipeline runs on a single Groq model (`openai/gpt-oss-120b`)
via an OpenAI-compatible client. Groq's free tier has a **200k tokens/day** cap. A few
full happy-path runs (each ≈15–20k tokens, more with the critic loop) exhaust the daily
budget, which surfaces as `429 ... tokens per day (TPD): Limit 200000, Used 200000` and a
user-facing *"Plan generation failed"* alert — the whole pipeline dies once the cap is hit,
with no recovery until reset hours later.

**Goal:** when the primary provider is rate-limited/quota-exhausted, automatically fail over
to a free secondary, then tertiary, so plan generation keeps working. Chosen cascade:

1. **Groq** `openai/gpt-oss-120b` (primary, current)
2. **Cerebras** `gpt-oss-120b` — *exact same model*, 1M tok/day, OpenAI-compatible, identical JSON behavior
3. **Gemini** `gemini-2.5-flash` — huge context + 1500 req/day, OpenAI-compatible (different family; covers Cerebras's 8K context-cap case)

Fail over **only on quota/rate-limit (429/TPD) errors** (plus Cerebras context-overflow →
Gemini), with **session stickiness** so an exhausted provider is skipped on later calls.

## Why this is low-risk

Every chat call funnels through one function — `_call_llm` in `backend/nodes.py:211`
(also imported by `main.py` `/api/parse` & `/api/onboard`, and the DeepEval judge). Adding
the cascade there covers the whole app with no call-site changes. Transcription
(`groq.Groq()` / Whisper in `main.py:202`) is intentionally **out of scope** — Cerebras/Gemini
don't host Whisper, and its TPD is a separate budget.

## Model-choice rationale (cascade ordering)

GPT-OSS-120B and Gemini 2.5 Flash are peers in "smartness": gpt-oss (high effort) edges on
deliberate reasoning + speed; Gemini 2.5 Flash is more reliable at clean JSON and far stronger
on long context (1M vs 131k). Ordering Groq→Cerebras (same gpt-oss model)→Gemini keeps us on the
*known* model as long as possible (no eval drift), with Gemini as the deep reserve that also
fixes gpt-oss's two weak spots (JSON fragility, the Cerebras 8K context cap).

---

## Phase 1 — Failover cascade (ship first; zero eval drift)

### 1. `backend/nodes.py` — provider list + cascade (the only code change)

**Replace the single-client setup (lines 23–27)** with a small provider list built from env.
Critically, set `max_retries=0` on every client so the OpenAI SDK does **not** burn 8–23s of
its own 429 backoff before our code can fail over (that delay is what we saw in the logs).

```python
from openai import OpenAI, RateLimitError, APIStatusError, BadRequestError
from dataclasses import dataclass

@dataclass
class _Provider:
    name: str
    client: OpenAI
    model: str

def _build_provider(name, base_env, key_env, model_env, base_default, model_default):
    key = os.environ.get(key_env)
    if not key:
        return None  # silently skip unconfigured fallbacks
    return _Provider(
        name=name,
        client=OpenAI(base_url=os.environ.get(base_env, base_default),
                      api_key=key, max_retries=0),
        model=os.environ.get(model_env, model_default),
    )

_PROVIDERS = [p for p in [
    _build_provider("groq",     "LLM_BASE_URL",        "LLM_API_KEY",        "LLM_MODEL",
                    "http://localhost:1234/v1", "local-model"),
    _build_provider("cerebras", "FALLBACK1_LLM_BASE_URL", "FALLBACK1_LLM_API_KEY", "FALLBACK1_LLM_MODEL",
                    "https://api.cerebras.ai/v1", "gpt-oss-120b"),
    _build_provider("gemini",   "FALLBACK2_LLM_BASE_URL", "FALLBACK2_LLM_API_KEY", "FALLBACK2_LLM_MODEL",
                    "https://generativelanguage.googleapis.com/v1beta/openai/", "gemini-2.5-flash"),
] if p]

# session stickiness: provider name -> epoch time it becomes usable again
_disabled_until: dict[str, float] = {}
```

**Rewrite `_call_llm` (lines 211–250)** to iterate providers, skipping disabled ones, keeping
the existing per-provider JSON/empty-response retry (3 attempts, short backoff) for transient
malformed output:

- For each provider not currently disabled (or whose cooldown passed):
  - Try up to 3 times: `create(model=provider.model, max_tokens=..., messages=...)`, strip code
    fences, `json.loads`. On empty/JSONDecodeError → short sleep + retry (existing behavior).
  - **On a quota/rate-limit error** (`RateLimitError`, or `APIStatusError.status_code == 429`,
    or message containing `rate_limit_exceeded`/`tokens per day`): mark provider disabled
    (`_disabled_until[name] = now + cooldown`), `logger.warning("provider %s exhausted → falling over", name)`,
    and **break to the next provider**. Cooldown = parsed `"try again in Ns"` from the message if
    present, else default 600s.
  - **On a context-length error from a small-context provider** (`BadRequestError` / 400 mentioning
    context/tokens — i.e. Cerebras's 8K cap): log and **break to the next provider** (Gemini handles
    big prompts). Do not disable — it's request-specific, not quota.
  - Any other exception on the last attempt → raise (preserves today's fail-fast on genuine bugs).
- If all providers are exhausted/failed → raise `RuntimeError("all LLM providers exhausted")`.

Add a tiny helper `_classify_error(e) -> "quota" | "context" | "other"` to keep the loop readable.

### 2. `backend/.env` + `backend/.env.example` — new config keys

```
FALLBACK1_LLM_BASE_URL=https://api.cerebras.ai/v1
FALLBACK1_LLM_API_KEY=csk-...
FALLBACK1_LLM_MODEL=gpt-oss-120b
FALLBACK2_LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
FALLBACK2_LLM_API_KEY=AIza...
FALLBACK2_LLM_MODEL=gemini-2.5-flash
```

Fallbacks are **opt-in**: if a key is absent, that provider is skipped and behavior is unchanged.

### 3. `CLAUDE.md` — document the gotcha + new config

Add to **Known Issues & Gotchas**: Groq free tier = **200k tokens/day (TPD)**; a handful of
full pipeline runs exhausts it; surfaces as `429 ... tokens per day`. Note the fallback cascade
and the env vars that enable it.

### Credentials needed
- **Cerebras** key — free, no card: https://cloud.cerebras.ai → `FALLBACK1_LLM_API_KEY`. **(still needed)**
- **Gemini / AI Studio** key — **already in hand** → `FALLBACK2_LLM_API_KEY`.

---

## Phase 2 — Task-based model routing (optional; after Phase 1 verified)

Compose routing into the same failover mechanism: add a `task` arg to `_call_llm` and a
`TASK_CHAINS` map where each task is an ordered provider chain (failover walks the chain).

```python
TASK_CHAINS = {
    "synthesis":     ["gemini", "groq", "cerebras"],   # long-context + JSON → Gemini first
    "candidate_gen": ["gemini", "groq", "cerebras"],
    "plan":          ["groq", "cerebras", "gemini"],    # reasoning → gpt-oss first
    "default":       ["groq", "cerebras", "gemini"],
}
```

Benefits: (a) model-fit per task; (b) **load-splitting across independent daily quotas** —
moving the heavy 4096-token calls off Groq makes its 200k/day last ~3–4× longer; (c) removes
Cerebras 8K-cap pressure on synthesis.

**Cost:** eval drift — the DeepEval suite was tuned on gpt-oss output. **Recommended minimal
step:** route ONLY the RAG synthesis call (`destination_intelligence`) to Gemini-first,
re-validate evals once, leave planning/critic on gpt-oss.

Note: there is currently **no LangChain/DeepAgents subagent** in the backend (only Phoenix's
`LangChainInstrumentor` + a requirements line); "research" is the `destination_intelligence`
node. Routing targets existing nodes, not a subagent.

---

## Phase 3 — Prompt caching to stretch the daily cap (optional)

No code toggle needed — caching is automatic: **Groq caches prefixes for free and cached tokens
do NOT count against the daily token limit** (direct relief for the TPD cap); **Gemini 2.5 Flash
implicit caching gives a 90% discount** on cached tokens. The work is *prompt structuring*:

- Static content first (system prompts already are — they cache across all users), volatile
  content (RAG `knowledge_block`, trip params) strictly last. Audit each `_call_llm` caller to
  ensure nothing volatile is interleaved into the static prefix.
- Separate (non-caching) token win: the critic loop re-runs the full 4096-token synthesis each
  pass — a cheaper targeted-edit critic path would cut the largest repeat cost. Defer.

---

## Verification (end-to-end)

Groq's daily-cap exhaustion is a free test fixture for the failover:

1. Add the Cerebras key to `backend/.env`; uvicorn `--reload` picks up the change.
2. Run the happy-path test: `cd frontend; node happy_path_test.cjs`.
3. **Expected:** plan renders (`SUCCESS: Plan loaded!`, 5 days). Backend log shows
   `provider groq exhausted → falling over`, then `200 OK` from `api.cerebras.ai`.
4. Confirm the `candidate_gen` empty-pool warning is **gone** (also validates the prior
   2048→4096 fix on Cerebras, which runs the same model).
5. Once Groq's TPD resets, restart backend and run once more to confirm the primary path still
   works and stickiness resets cleanly between sessions.

## Current branch state — `fix/stream-incremental-progress`

- `c50cfe8` — stream plan stages incrementally (verified: plan loads, 5 days, no freeze).
- `d57f88e` — candidate_gen `max_tokens` 2048→4096. **NOT yet verified** — blocked by the TPD
  cap before it could run. First thing to confirm once quota resets / Cerebras is wired:
  the `candidate_gen ... proceeding with empty pool` warning is gone.
- Branch not pushed.

## Out of scope (noted, not changed)

- Whisper transcription (`groq.Groq()` in `main.py`) — different model, separate budget.
- DeepEval's `GroqJudge` client (`run_eval_deepeval.py:37`) — eval-only, not runtime.
- `RESEARCH_MODEL` env var remains unused — left as-is (YAGNI).
