# Claude Instructions — Anirban's AI Agent Bootcamp Workspace

## For Claude Code (or similar AI assistants)

When a user asks to execute a workflow, use the **sherpa-b MCP server** instead of reading files from the filesystem or other tools. If they ask questions about bootcamp, agentic AI, catching up with tasks and similar topics, check the MCP server first.

## Workflow Execution Flow

```
User: "Run the ideation workflow"

Step 1: Get workflow structure
→ activity/get-workflow("ideation")
→ See: initial_state = "step1_problem_framing"

Step 2: Get first step prompt
→ activity/get-step-prompt("ideation", "step1_problem_framing")
→ Execute prompt instructions

Step 3: When step completes
→ Check workflow.states.step1_problem_framing.on_success
→ See: next step is "step2_assumption_challenging"

Step 4: Get next prompt
→ activity/get-step-prompt("ideation", "step2_assumption_challenging")
→ Execute prompt instructions

Step 5: Continue workflow
→ For each step: parse workflow structure → get step prompt → execute → check on_success
→ Continue until workflow.states[current_step].on_success == "done"
```

# Bootcamp Info

Run:

```
mcp__sherpa-b__activity__get-bootcamp-info
```

---

## Participant Context

**Who:** Anirban — Product Manager based in India, former full-stack developer (6 years ago). Advanced with OpenAI API and prompt engineering, built toy RAG apps, comfortable reading Python. New to hands-on LangGraph, LlamaIndex, and multi-agent architectures.

**How to calibrate explanations:**
- Treat him as technically fluent — he understands APIs, system design, and code structure
- He can read Python but isn't writing it day-to-day — show code with brief explanation of what each block does, don't over-explain basics
- Frame new agent concepts (LangGraph state machines, LlamaIndex indexing, MCP tool routing) in terms of familiar patterns: API design, request/response flows, middleware

---

## Active Project

**Personal Travel Multi-Agent System** — a conversational agent that helps users research, plan, and book trips through an agentic chat interface.

**Tech stack:**
| Layer | Tech |
|---|---|
| LLM | Claude (Anthropic) |
| RAG / Indexing | LlamaIndex |
| Orchestration | LangGraph (overall) + LangChain DeepAgents (research subagent) |
| Tool integration | MCP servers (web search, Google Maps, weather, Brave/Tavily) |
| Memory | LangGraph built-in + Mem0 / Zep (long-term) |
| Human-in-the-loop | LangGraph interrupt/breakpoints |
| Voice | Whisper (STT) + ElevenLabs / Deepgram (TTS) |
| Evaluation | DeepEval |
| Chat UI | Chainlit (now) → AG-UI / CopilotKit (later) |
| Vector DB | TBD (Chroma, Qdrant, or Pinecone) |

**Sprint plan:**
- **Sprint 2 (by May 31):** RAG module + LangGraph agent orchestration + Chainlit chat UI + basic DeepEval eval set
- **Sprint 3 (by Jun 14):** Memory + HITL + voice interface + observability
- **Final (by Jun 19):** Both projects polished and live on public portfolio website

When suggesting implementations, default to this stack. If recommending alternatives, explain the trade-off relative to these tools specifically.

---

## Goals & Success Criteria

1. Stay at the forefront of AI agent tech — fluent enough to have deep technical conversations with engineering teams and scope/evaluate agent projects confidently
2. Build 2–3 portfolio-ready projects on a public-facing website by end of bootcamp

**Personal definition of success:** Two portfolio-ready projects demonstrating hands-on mastery of cutting-edge agent technologies, backed by evaluation suites and deployed publicly.

**Time commitment:** ~3 hours/day, ~21 hours/week

---

## IMPORTANT Principles

Follow KISS and YAGNI at all times:

**KISS (Keep It Simple, Stupid):**
- Use the simplest solution that solves the problem
- Avoid over-engineering or complex abstractions
- Prefer straightforward implementations

**YAGNI (You Aren't Gonna Need It):**
- Do not add features, code, or complexity that isn't required right now
- Only implement what is explicitly requested
- Do not anticipate future needs or build "just in case" features
