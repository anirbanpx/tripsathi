# Participant Profile

## Background
Anirban is a Product Manager based in India with a former full-stack development background (6 years ago). He has hands-on experience with the OpenAI API, has built complex prompts, and has experimented with small naive RAG applications. He can read and understand Python code, drawing on his prior development experience, though it's not his active day-to-day language.

## Experience
- Familiar with OpenAI API and prompt engineering at an advanced level
- Built toy RAG applications — understands the core concepts but hasn't gone deep yet
- No active Python coding currently, but comfortable reading it given his full-stack history
- Has read about and follows: Advanced RAG, LangChain, MCP, A2A, A2UI — but hasn't had hands-on time with these yet

## Bootcamp Goals
1. **Stay at the forefront of cutting-edge AI agent technologies** — be fluent enough to have deep technical conversations with engineering teams and dive deeper when needed. This includes building evaluation skills for AI projects, understanding memory/context design, establishing human-in-the-loop (HITL) patterns correctly, and gaining observability/analytics capabilities.
2. **Build a public portfolio** of 2–3 projects showcased on a small public-facing website, targeting completion by end of bootcamp.

## Personal Motivation
Anirban wants to close the gap between his PM role and the fast-moving AI agent space — not just to understand what's being built, but to be hands-on enough to evaluate, scope, and guide engineering decisions confidently. The portfolio goal reflects a desire for tangible, shareable proof of that capability.

## Technical Approach
Hands-on coding — wants to get his hands dirty with real implementations, not just theory.

## Current Tech Stack
- OpenAI API (prompt engineering, API calls)
- Familiar with web development concepts from prior full-stack experience

## Goals

### Time Commitment
~3 hours/day, ~21 hours/week

### Sprint Goals
- **Sprint 2 Demo (May 31):** Agentic RAG project with a chat UI — working prototype, clear problem defined, basic eval set
- **Sprint 3 Demo (Jun 14):** Second project — voice, observability, evals, multi-agent, memory
- **Final Demo (Jun 19):** Both projects polished and live on a public portfolio website

### Check-in Rhythm
Work through workflows during the week, prep for demos on weekends

### Success Criteria
Two portfolio-ready projects on a public-facing website that demonstrate hands-on mastery of cutting-edge agent technologies — and enough depth to have confident technical conversations with engineering teams

---

## Desired Tech Stack
- **LLM:** Claude (Anthropic)
- **RAG / Indexing:** LlamaIndex
- **Orchestration:** LangGraph (overall) + LangChain DeepAgents (research subagent)
- **Tool integration:** MCP servers (web search, Google Maps, weather, Brave/Tavily)
- **Memory:** LangGraph built-in + Mem0 / Zep (long-term)
- **Human-in-the-loop:** LangGraph interrupt/breakpoints
- **Voice:** Whisper (STT) + ElevenLabs / Deepgram (TTS)
- **Evaluation:** DeepEval
- **Chat UI:** Chainlit (now) → AG-UI / CopilotKit (later)
- **Vector DB:** TBD (Chroma, Qdrant, or Pinecone)

---

## Project Idea

### Concept
A personal travel multi-agent system that helps users research, plan, and book trips through an agentic chat interface (embedded chat via Chainlit initially, AG-UI later).

### Problem Space
Travel planning is fragmented — researching destinations, comparing options, building itineraries, and booking all happen across different tools. The target user is an individual traveler who wants a single conversational interface to handle the full travel planning journey, from inspiration to confirmed booking.

### Proposed Approach
- **Multi-agent architecture** (LangGraph): dedicated agents for research, planning, and booking
- **RAG module** (LlamaIndex + vector DB): over travel guides, destination content, and user-provided documents
- **Human-in-the-loop** (LangGraph interrupts): user confirms itineraries and bookings before execution
- **Memory** (LangGraph + Mem0/Zep): retains user preferences, past trips, budget, travel style
- **Voice interface** (Whisper + ElevenLabs/Deepgram): hands-free travel planning
- **LLM**: Claude (Anthropic)
- **Evaluation**: DeepEval for agent response quality
- **Chat UI**: Chainlit now → AG-UI/CopilotKit later

### Success Criteria
- A working multi-agent travel assistant that can research destinations, produce a structured itinerary, and simulate a booking flow with human approval gates
- DeepEval evaluation suite covering RAG retrieval quality and agent response accuracy
- Voice interface functional for at least the research and planning phases
- Deployed and showcased on public portfolio website

---

## Project Status

### Existing Work
None — starting fresh.

### Current Challenges
- Deciding on vector DB (any is acceptable — Chroma, Qdrant, or Pinecone)
- Context7 MCP quota exhausted (needs personal API key for library docs lookup)

### Starting Maturity
Idea stage — no code yet.
