# TripSathi — Requirements

**This is the single source of truth for all use cases.**
Update this file first before changing design docs or code. Use the Change Workflow in CLAUDE.md.

---

## How to add a use case

Copy this block, assign the next UC-XX number, fill in the fields:

```
### UC-XX: Title
**What it does:** One sentence.
**Status:** live | planned | deferred
**Code:** backend/file.py (function or class)
**Design:** specs/backend_architecture.md § Section, or specs/user_experience_spec.md § Section
**Tests:** backend/tests/test_file.py
```

---

## Live Use Cases

### UC-01: Persona Onboarding
**What it does:** Collects 4-step questionnaire answers (destination, trip parameters, group composition, preferences) and classifies them into a `user_profile` (persona type, autonomy mode, constraints).
**Status:** live
**Code:** backend/nodes.py (`persona_classification`), backend/graph.py (START → persona_classification)
**Design:** specs/backend_architecture.md § 2 LangGraph State Machine
**Tests:** backend/tests/test_graph.py, backend/tests/test_main_helpers.py

---

### UC-02: Destination Research
**What it does:** Expands the trip request into retrieval queries, runs parallel web search (Tavily) + weather (OpenWeather) + RAG (Qdrant, 57 destinations), and synthesises a structured research brief with routing, key places, local risks, and seasonal context.
**Status:** live
**Code:** backend/nodes.py (`destination_intelligence`), backend/rag/
**Design:** specs/backend_architecture.md § 2 (destination_intelligence node), § 4 RAG Knowledge Pipeline
**Tests:** backend/tests/test_tools.py, backend/tests/test_smoke.py

---

### UC-03: Candidate Generation
**What it does:** Extracts 15–25 structured activities, hotels, and restaurants from the research synthesis, each tagged with accessibility metadata (toddler_ok, elderly_ok, indoor/outdoor, cost_tier, duration_hours).
**Status:** live
**Code:** backend/nodes.py (`candidate_gen`)
**Design:** specs/backend_architecture.md § 2 (candidate_gen node)
**Tests:** backend/tests/test_graph.py

---

### UC-04: Taste-Aware Ranking
**What it does:** Filters candidates by hard avoids and kid/elderly flags, then reranks by semantic similarity to the user's taste profile (pace, crowd tolerance, interests, dietary needs).
**Status:** live
**Code:** backend/nodes.py (`ranker`), backend/taste.py
**Design:** specs/backend_architecture.md § 2 (ranker node)
**Tests:** backend/tests/test_taste.py

---

### UC-05: Plan Assembly
**What it does:** Assembles the ranked candidates into a day-by-day itinerary with hotel recommendations, budget summary, and safety warnings.
**Status:** live
**Code:** backend/nodes.py (`plan_assembly`)
**Design:** specs/backend_architecture.md § 2 (plan_assembly node)
**Tests:** backend/tests/test_graph.py

---

### UC-06: Plan Refinement (HITL Loop)
**What it does:** Pauses graph execution after plan assembly, returns the plan to the user, and resumes the graph with the user's change request — repeatable until the user approves.
**Status:** live
**Code:** backend/nodes.py (`human_feedback`), backend/graph.py (interrupt/resume), backend/main.py (`/refine` endpoint)
**Design:** specs/backend_architecture.md § 2 (human_feedback node), § 5 API Architecture and SSE Streaming
**Tests:** backend/tests/test_graph.py

---

### UC-07: User Authentication
**What it does:** Google OAuth login — issues a session token, gates `/plan` and `/refine` endpoints, and associates saved trips and taste profiles with the authenticated user.
**Status:** live
**Code:** backend/auth.py, backend/main.py (auth routes)
**Design:** specs/backend_architecture.md § 7 Auth Flow
**Tests:** backend/tests/test_auth.py

---

### UC-08: Trip Saves
**What it does:** Lets authenticated users save, list, load, and delete generated trip plans; persisted in SQLite.
**Status:** live
**Code:** backend/saves.py, backend/main.py (`/saves` endpoints)
**Design:** specs/backend_architecture.md § 6 Data Persistence
**Tests:** backend/tests/test_saves.py

---

### UC-09: Explore Templates (Fast Path)
**What it does:** Returns a pre-baked trip plan instantly (zero LLM calls) when the user selects a popular explore chip — 5 static templates + 15 season-aware dynamic templates keyed by canonical destination/theme.
**Status:** live
**Code:** backend/templates_store.py, backend/templates/, backend/generate_templates.py
**Design:** specs/backend_architecture.md § 9 Agentic Patterns Used
**Tests:** backend/tests/test_templates_store.py

---

### UC-10: Input Guardrails
**What it does:** Two-tier safety check on all free-text user input: tier-1 regex/keyword (free), tier-2 LLM (`openai/gpt-oss-safeguard-20b`) only if tier-1 passes. Fails open on exceptions so moderation hiccups don't block legitimate users.
**Status:** live
**Code:** backend/guardrails.py, backend/nodes.py (wired into persona_classification + human_feedback)
**Design:** specs/backend_architecture.md § 9 Agentic Patterns Used
**Tests:** backend/tests/test_smoke.py

---

### UC-11: LLM Fallback Chain
**What it does:** Routes LLM calls through Groq → Cerebras → Gemini → OpenRouter (6 free models) when earlier providers hit rate limits or return errors. Each node's LLM call is wrapped in the fallback chain.
**Status:** live
**Code:** backend/nodes.py (`_make_llm_call`), backend/.env (`FALLBACK1_*`, `FALLBACK2_*`)
**Design:** specs/backend_architecture.md § 3 LLM Provider Architecture
**Tests:** backend/tests/test_smoke.py

---

### UC-12: Long-Term Memory
**What it does:** Stores and retrieves user preferences and travel history across sessions via Mem0 Cloud — injected into `persona_classification` to personalise the user_profile without re-onboarding.
**Status:** live
**Code:** backend/memory.py, backend/nodes.py (Mem0 injection in persona_classification)
**Design:** specs/backend_architecture.md § 11 Memory Architecture
**Tests:** backend/tests/test_memory.py

---

### UC-13: Observability
**What it does:** Emits per-node OpenTelemetry spans to Arize Phoenix (OTLP) — covers LLM call latency, token counts, node durations, and error traces.
**Status:** live
**Code:** backend/nodes.py (`_timed_node` decorator), backend/main.py (Phoenix init)
**Design:** specs/backend_architecture.md § 13 Observability — Arize Phoenix
**Tests:** (manual trace inspection only; no unit test)

---

### UC-14: Taste Profile
**What it does:** Persists user pace, crowd tolerance, interest tags, and dietary preferences in SQLite (`taste.db`). Pre-loaded into state before each graph run so the ranker (UC-04) uses up-to-date preferences.
**Status:** live
**Code:** backend/taste.py, backend/main.py (taste endpoints)
**Design:** specs/backend_architecture.md § 6 Data Persistence
**Tests:** backend/tests/test_taste.py

---

### UC-15: Plan Regenerate
**What it does:** Produces a substantively different plan when the user taps Regenerate — uses a separate backend prompt with anti-repetition context, resets the refinement counter, and re-runs the fake-progress UI. Distinct from refine (which patches the existing plan).
**Status:** live
**Code:** backend/nodes.py (`plan_assembly` regenerate branch), backend/main.py (`/api/regenerate`), frontend/src/lib/fakeProgress.ts
**Design:** specs/user_experience_spec.md § 3 Regenerate vs Refine
**Tests:** backend/tests/test_graph.py

---

### UC-16: Demo Mode
**What it does:** Visitor entry path with no auth required — pre-loads the Kerala family trip scenario, shows a persistent "Demo mode" banner, and routes all booking/memory writes to mock endpoints flagged `is_demo: true`.
**Status:** live
**Code:** frontend/src/pages/DemoEntryPage.tsx, frontend/src/services/api.ts (mock flag)
**Design:** specs/user_experience_spec.md § 0 Decision 1, § 10 Interaction Flow PATH A
**Tests:** (manual only)

---

### UC-17: India Destinations Map
**What it does:** Interactive Leaflet map of 54 Indian destinations with dot markers; clicking a destination shows a popup with image, name, and a wishlist heart-toggle that calls the backend wishlist API.
**Status:** live
**Code:** frontend/src/components/explore/IndiaDestinationsMap.tsx, frontend/src/lib/destinationCoordinates.ts, frontend/src/services/api.ts (`toggleWishlistItem`)
**Design:** (not formally specced — built during RAG expansion sprint)
**Tests:** (manual only)

---

### UC-18: Trip Journal
**What it does:** Magazine-style flip-book view of the generated plan — cover page with destination hero image, one page per day with activities and meals, closing page. Swipeable on mobile.
**Status:** live
**Code:** frontend/src/components/planner/TripJournal.tsx, frontend/src/components/planner/DayJournalCard.tsx
**Design:** (not formally specced)
**Tests:** (manual only)

---

### UC-19: Profile Page
**What it does:** Authenticated user's hub — view and delete saved trips, wishlist items, and saved hotels; edit taste preferences (interests, dietary, pace, crowd tolerance).
**Status:** live
**Code:** frontend/src/pages/ProfilePage.tsx, frontend/src/services/api.ts (`getProfile`, `getSavedTrips`, `getWishlist`, `getSavedHotels`, `updatePreferences`, `deleteSavedTrip`, `deleteWishlistItem`, `deleteHotel`)
**Design:** specs/user_experience_spec.md § 4 Agent Memory Construct
**Tests:** (manual only)

---

### UC-20: Hotel + Dining Selection Flow
**What it does:** Multi-step booking confirmation flow — user picks one hotel from fetched options and selects per-day dinner choices, then sees a booking confirmation screen with provider links and a trip summary banner.
**Status:** live (mock)
**Code:** frontend/src/components/planner/SelectionScreen.tsx, frontend/src/components/planner/BookingScreen.tsx, frontend/src/components/planner/TripSummaryBanner.tsx
**Design:** specs/user_experience_spec.md § 10 Interaction Flow BookingSection
**Tests:** (manual only)

---

## Planned Use Cases

### UC-21: Voice Interface
**What it does:** Voice-first interaction via Whisper STT (input) + ElevenLabs/Deepgram TTS (output); hands-free in-trip mode and WhatsApp voice note input.
**Status:** planned
**Code:** (not built)
**Design:** reports/problem_definition.md § Voice & Language
**Tests:** (not built)

---

### UC-22: WhatsApp Channel
**What it does:** Push pre-trip briefings, booking confirmations, and group updates via WhatsApp Business API; voice note input for pilgrimage and older traveler segments.
**Status:** planned
**Code:** (not built)
**Design:** reports/problem_definition.md § Social & Group Features
**Tests:** (not built)

---

### UC-23: Gmail Personalization
**What it does:** Read-only OAuth scan of OTA booking confirmation emails (MakeMyTrip, IRCTC, OYO, airline) to infer travel history, budget tier, group composition, and preferred airlines/hotels — without requiring manual profile fill.
**Status:** planned
**Code:** (not built)
**Design:** reports/problem_definition.md § Personalization via Gmail
**Tests:** (not built)

---

### UC-24: Shared Group Planning
**What it does:** Admin creates a trip plan and shares a link with participants (view-only + comment/react); admin resolves conflicts and confirms bookings.
**Status:** planned
**Code:** (not built)
**Design:** reports/problem_definition.md § Social & Group Features
**Tests:** (not built)

---

### UC-25: Post-Trip Memento
**What it does:** After the trip, generates a shareable story — places visited, user photos, highlights — and auto-drafts Instagram captions and a group summary card.
**Status:** deferred
**Code:** (not built)
**Design:** reports/problem_definition.md § Post-Trip: Memento & Social Sharing
**Tests:** (not built)

---

### UC-26: Real Booking Integrations
**What it does:** Replace mock booking with Booking.com Affiliate API for hotels and Google Flights/MakeMyTrip deep-link for flights. Transactional autonomous spend is out of scope until post-MVP.
**Status:** planned
**Code:** (not built)
**Design:** reports/problem_definition.md § Hotels, § Flights
**Tests:** (not built)

---

### UC-27: Temple / Spiritual Booking
**What it does:** Surface darshan slot requirements and booking links for major temples (Tirupati, Char Dham, Vaishno Devi, Kamakhya) via BookMyMandir aggregator deep-link; direct partner API in a later sprint.
**Status:** planned
**Code:** (not built)
**Design:** reports/problem_definition.md § Temple & Spiritual Booking
**Tests:** (not built)
