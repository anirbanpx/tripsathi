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
**What it does:** Accepts a single natural-language trip description ("5-night Kerala trip, wife + toddler, ₹80k, vegetarian…") and classifies it into a `user_profile` (persona type, autonomy mode, constraints). Input is a free-text field — not a chip stepper or multi-step form.
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

### UC-16: Open-Access Planning (No-Login Fast Path)
**What it does:** Anyone can type a trip description and click "sketch my plan" without creating an account or providing a card (no demo banner, no pre-loaded scenario). Google Sign In is offered alongside but is not required. Deep planning, memory, and saves require auth (UC-07).
**Status:** live
**Code:** frontend/src/pages/DemoEntryPage.tsx (the main landing page), frontend/src/services/api.ts
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
**What it does:** 4-step booking wizard (Itinerary → Choose hotel → Dining → Book): user picks one Google-verified hotel from fetched options, selects per-day dinner choices (Local / Family / Splurge), then reaches a booking confirmation screen with real deep-link URLs ("Book on their website", phone number, Google Maps, MakeMyTrip search) — not a mock. A trip summary banner ("A romantic Munnar escape, personalized for you ✦") shows trip chips at the top of the flow.
**Status:** live
**Code:** frontend/src/components/planner/SelectionScreen.tsx, frontend/src/components/planner/BookingScreen.tsx, frontend/src/components/planner/TripSummaryBanner.tsx
**Design:** specs/user_experience_spec.md § 10 Interaction Flow BookingSection
**Tests:** (manual only)

---

### UC-28: Seasonal Destination Cards
**What it does:** Landing page right column shows a season-aware grid of destination cards (e.g. "SUMMER ESCAPES · APR – JUN") with instant-template badges; tapping a card pre-fills the input and triggers the fast-path explore template (UC-09).
**Status:** live
**Code:** frontend/src/pages/DemoEntryPage.tsx (destination card grid), backend/templates_store.py (template lookup)
**Design:** (not formally specced)
**Tests:** (manual only)

---

### UC-29: Language Toggle (EN · हि)
**What it does:** Top-right toggle on the landing page switches the UI language between English and Hindi. The UI element is rendered and styled; full Hindi localisation of dynamic content is not yet implemented.
**Status:** live (UI only — full Hindi localisation planned)
**Code:** frontend/src/pages/DemoEntryPage.tsx (toggle element)
**Design:** (not formally specced)
**Tests:** (not built)

---

### UC-30: "Tailored for You" Plan Personalization Card
**What it does:** A card on the plan page that explains in human-readable language why the plan matches the user's stated preferences (e.g. "Focus on tea-estate scenery matches your 'nature' style"). Helps users understand and trust the AI's choices.
**Status:** live
**Code:** frontend/src/components/planner/ (personalization card component)
**Design:** (not formally specced)
**Tests:** (manual only)

---

### UC-31: "Heads Up" Local Tips Carousel
**What it does:** A paginated carousel (1/5 with forward/back arrows) on the plan page showing local warnings, seasonal tips, and travel advisories specific to the destination.
**Status:** live
**Code:** frontend/src/components/planner/ (tips carousel component)
**Design:** (not formally specced)
**Tests:** (manual only)

---

### UC-32: Budget Breakdown Sidebar Panel
**What it does:** Right sidebar panel on the plan page that shows an itemised budget breakdown — accommodation, transport, food, activities — with a visual bar for each category so users can sense-check total spend against their stated budget.
**Status:** live
**Code:** frontend/src/components/planner/ (budget sidebar component)
**Design:** (not formally specced)
**Tests:** (manual only)

---

### UC-33: Hotels & Dining Sidebar Panels
**What it does:** Two collapsible right-sidebar panels on the plan page: Hotels ("5 options · ★4.5 avg · Google verified") and Dining ("3 options / evening"), each with a "View & Choose →" link that launches the hotel/dining selection flow (UC-20).
**Status:** live
**Code:** frontend/src/components/planner/ (hotels panel, dining panel)
**Design:** (not formally specced)
**Tests:** (manual only)

---

### UC-34: Share Plan
**What it does:** Share icon in the planner nav bar; allows the user to share a link to the generated plan. UI element is rendered; backend share-link generation may be partial or planned.
**Status:** live (UI button rendered — backend share-link TBD)
**Code:** frontend/src/components/planner/ (share button in nav)
**Design:** (not formally specced)
**Tests:** (not built)

---

### UC-35: Voice Input Button
**What it does:** Microphone button rendered in the landing page input field — user can tap to indicate voice intent. The UI element is live; the backend STT (Whisper) and TTS (ElevenLabs/Deepgram) pipeline is not yet wired. Full voice pipeline tracked separately (UC-21 backend).
**Status:** live (UI only — backend pipeline not built)
**Code:** frontend/src/pages/DemoEntryPage.tsx (mic button)
**Design:** reports/problem_definition.md § Voice & Language
**Tests:** (not built)

---

## Planned Use Cases

### UC-21: Voice Interface (Backend Pipeline)
**What it does:** Full voice-first interaction — Whisper STT (input) + ElevenLabs/Deepgram TTS (output); hands-free in-trip mode and WhatsApp voice note input. The UI button is already live (UC-35); this tracks the backend pipeline.
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
