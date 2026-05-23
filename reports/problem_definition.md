# Problem Definition

## Problem Statement

Indian travelers spend hours manually stitching together research, logistics, and bookings across 8–10 disconnected tools — with no personalization for their specific travel context (kid age, group size, safety needs, budget, trip type) — resulting in poor decisions, missed details, and a stressful planning experience that degrades the trip before it even starts.

---

## Target Users

Indian leisure travelers across distinct profiles — families with young children, solo female travelers, friend groups coordinating reunion trips, pilgrimage groups, and weekend escapees. Technically semi-savvy (comfortable with Google, MakeMyTrip, Zomato, WhatsApp), but not using any integrated planning tool. Planning happens primarily on mobile. Decision-making is often shared/social, not individual.

---

## Current State

### User Process

A typical trip planning journey looks like this:

1. **Pre-planning** — Identify rough destination and dates (constrained by school calendar, leave availability, group alignment). Budget discussion happens informally.
2. **Research** — Search across Google, MakeMyTrip, YouTube vlogs, Instagram, TripAdvisor, Google Maps. Inspiration and decision-making is scattered. WhatsApp becomes the informal coordination layer.
3. **Itinerary logistics** — Plan inter-destination commutes, food stops, local attractions. Cross-reference Google Maps, TripAdvisor, Zomato, Facebook groups manually.
4. **Booking** — Book flights first (expensive, time-sensitive), then hotels, then activities, then local transport. Each has its own platform, its own friction.
5. **In-trip** — Execute the plan. When reality diverges (place closed, food bad, cab late, time miscalculated) — adapt manually with no system support.
6. **Post-trip** — Memories are scattered across phone camera rolls and WhatsApp threads. Sharing happens manually — individual Instagram posts, no coherent story. No tool helps create a trip narrative or preserve the experience for the group.

### User Existing Tools

| Phase | Tools Used |
|---|---|
| Inspiration | Instagram, YouTube, WhatsApp |
| Research | Google, MakeMyTrip, TripAdvisor, Google Maps |
| Logistics | Google Maps, TripAdvisor, Zomato/Swiggy, Facebook/WhatsApp groups |
| Booking | MakeMyTrip, IRCTC, OYO/hotel sites, Airbnb, local cab apps |
| In-trip | Google Maps, ad-hoc search |
| Post-trip | Instagram (manual posting), Google Photos, WhatsApp |
| Coordination | WhatsApp (across all phases) |

### Trigger

An upcoming occasion — annual family holiday, school break, reunion with friends, religious pilgrimage, burnout-driven weekend escape.

### Frequency

- Leisure trips: 1–3 times per year
- Weekend getaways: monthly or more
- Pilgrimages: annual or occasion-driven

### Friction Points

**Across all personas:**
- Information is scattered across 8–10 tools — no single place holds the full picture
- Context is lost constantly — research done on one app doesn't carry to the next
- No personalization — recommendations are generic, don't account for kid age, group composition, safety needs, budget, or trip type
- **Social validation gap (20–45 age group)** — Instagram is used for inspiration but not integrated as a decision signal; travelers manually check if a destination/restaurant/activity is "having a moment" or trending among peers before committing; no tool pulls social proof into the planning flow

**Family with kids:**
- Kid age is a hard filter that nothing respects — changes destination viability, activity options, accommodation needs, travel pace
- Hotel search has no "family-friendly + in-house restaurant + not on highway" filter
- Day itinerary planning is manual and breaks down with kids in tow
- In-trip: plans derail from closures, food failures, transport chaos — no live adaptation

**Solo female traveler:**
- Accommodation safety (not isolated, socially vetted, good vibe) relies on word-of-mouth, not platform filters
- Local transport safety by destination is hard to assess — platform options thin outside metros

**Working adult friend group:**
- Dates alignment is the first blocker — multiple rounds to find a common window
- Budget misalignment leads to awkward group dynamics
- Decision-making drags in WhatsApp group chats — no consensus engine

**Pilgrimage traveler:**
- Darshan slot booking is fragmented across different temple systems (Tirupati, Char Dham each have their own)
- Route sequencing needs to factor weather windows, road conditions, altitude, group energy — no tool handles this
- Older travelers not comfortable typing on mobile — English and Hindi literacy not universal; voice input and WhatsApp-style interaction work better for this segment

---

## Desired State

### User Success Criteria

- Ask once in natural language ("plan a 5-day trip to Himachal for family with 2 kids aged 4 and 9, budget ₹80,000") and get a coherent, personalized plan
- No need to context-switch across tools — research, itinerary, booking, and logistics in one flow
- Recommendations that actually fit the specific travel profile — not generic results
- In-trip: real-time adjustments when things change (place closed, running late, food plan fails)

### Expected Impact

- Hours saved in research and planning (currently 10–20 hours per trip)
- Fewer bad decisions from incomplete information (wrong hotel, wrong activity for kid age, unsafe transport)
- Less mental load — especially for the "designated planner" in a family or friend group
- Better trip quality — itineraries that actually hold up in the field

### Constraints

- Must work for Indian travel context — tier-2 cities, pilgrimage routes, regional food preferences, IRCTC, local cab apps
- Mobile-first — most users plan on phone, not desktop
- Trust is a concern — users won't hand over full booking autonomy immediately; human confirmation at key steps is non-negotiable
- Budget sensitivity — most segments are price-conscious; recommendations must respect budget constraints, not just surface premium options
- Language and input accessibility — not all users are comfortable typing in English or Hindi on mobile; voice input and WhatsApp-style conversational interfaces are essential for older and pilgrimage travelers

---

## Assumptions Analysis

### Validated Constraints
- **Single integrated tool with persistent memory is non-negotiable** — personalization across life stages (kid age, group composition, budget patterns, preferences) is only possible if context accumulates in one system; fragmented tools each getting smarter cannot replicate this
- **Multi-channel is core from day one** — chat is the starting interface but voice (Whisper) and WhatsApp-style interaction are required for pilgrimage/older travelers; this is an accessibility requirement, not a feature addition
- **Human confirmation required at high-stakes decisions** — driven by financial stakes and reversibility (flight/hotel bookings), not AI distrust; 94% of AI users already trust recommendations as much as traditional search engines

### Flexible Assumptions
- **Confirmation can be graduated** — low-stakes decisions (activity suggestions, food options, itinerary adjustments) can be fully autonomous; human tap only required at booking/payment moments
- **Shared planning with admin control is a strong differentiator** — Indian travel is socially coordinated, not individually decided; admin + view-only participant model maps onto real group dynamics (family, friend groups, pilgrimage communities); no Western travel tool is built around this social fabric
- **Interface expands progressively** — ship with chat, add voice and WhatsApp channel as follow-on; architecture should support multi-channel from the start even if UI doesn't expose all channels immediately

### Untested Beliefs
- **Pilgrimage/temple data is accessible** — govt-driven digitization means booking websites exist for most major temples (Tirupati, Char Dham), but sites are non-standardized; API access is unlikely, scraping is the probable path — technical risk that needs early validation before building this feature
- **Indian traveler adoption curve** — 40% of global travelers already use AI for planning (2025 data); India-specific adoption rate and willingness to use a dedicated agent vs. ChatGPT for travel is unvalidated; needs user research
- **Instagram social validation as a feature** — for the 20–45 cohort, surfacing trending destinations/restaurants/activities via Instagram signals could be a strong engagement hook; whether this is technically feasible (Instagram API restrictions are tight) and whether users want it integrated vs. checking themselves is untested

---

## Solution Hypotheses

### Overarching Design Philosophy — Adaptive Autonomy

The agent does not have a fixed operating mode. During onboarding, it detects the user's persona and comfort level through a few targeted questions (travel companions, planning horizon, decision style). It sets an initial autonomy mode and refines it over time based on observed behavior — if the user consistently overrides suggestions, it backs off; if they approve quickly, it becomes more proactive. Autonomy is a preference, not a product tier.

**Onboarding → Persona Detection → Autonomy Mode → Learns and Adjusts**

---

### Hypothesis 1 — AI as Research Assistant (Level 1)

**What it does:** User asks ("family trip to Coorg, 5 days, 2 kids aged 5 and 9, budget ₹60k"), agent pulls multi-source research, filters by persona context (kid age, budget, group size), and returns a structured trip brief — destination overview, hotel options with reasoning, day-by-day activity suggestions, food stops.

**What AI does autonomously:** Multi-source research, personalized filtering, itinerary draft, social validation signals (Instagram trending, TripAdvisor ratings)

**Human touchpoints:** All decisions, all bookings — user takes the brief and acts on it themselves

**Interaction pattern:** Single conversational query → structured output

**Scope boundaries:**
- Does: research, filtering, drafting
- Doesn't: book, remember across trips, adapt in real-time

**Best fit personas:** First-time users, control-oriented travelers, users building trust with AI gradually

---

### Hypothesis 2 — AI as Trip Collaborator (Level 2)

**What it does:** Agent builds a living shared trip plan. Drafts full itinerary, suggests hotels with reasoning, proposes day-by-day schedules. Plan is shared with group (admin + view-only participants). At booking time, surfaces best options with one-tap confirmation. Sends pre-trip briefing (closures, weather, local tips).

**What AI does autonomously:** Full plan drafting, itinerary sequencing, group sharing, booking recommendations, pre-trip briefing

**Human touchpoints:** Approves each plan section, confirms every booking, admin resolves group disagreements

**Interaction pattern:** Conversational back-and-forth + persistent shared group view

**Scope boundaries:**
- Does: plan, draft, recommend, share with group, surface booking options
- Doesn't: book autonomously, adapt in real-time during the trip

**Best fit personas:** Families with kids, working adult friend groups, newlyweds

---

### Hypothesis 3 — AI as Travel Agent (Level 3)

**What it does:** User sets parameters once ("Himachal, June, ₹80k, kids 5 and 9, flexible on exact dates"). Agent monitors prices, flags optimal booking windows, drafts full plan, books flights and hotels when price threshold is hit, sends WhatsApp updates to the group, and adapts the itinerary in real-time during the trip when things go wrong (place closed, food stop fails, cab late).

**What AI does autonomously:** Proactive price monitoring, autonomous booking within parameters, real-time itinerary replanning, multi-channel group notifications

**Human touchpoints:** Sets initial parameters, receives booking notifications, overrides exceptions

**Interaction pattern:** Largely async — agent initiates, human confirms only exceptions

**Scope boundaries:**
- Does: monitor, book within parameters, replan in real-time, notify via WhatsApp
- Doesn't: exceed budget, book without notification, make destination changes without approval

**Best fit personas:** Budget-conscious + date-flexible travelers — young adults, solo backpackers, weekend escapees who want the best deal without the effort

---

## Selected Solution

### Chosen Hypothesis
**H2 — AI as Trip Collaborator**, with adaptive autonomy as the overarching design philosophy. H3's price-alerting behavior is scoped in as a lightweight add-on (alert + one-tap confirm), not full autonomous booking.

**Why:** Only hypothesis that addresses both the information fragmentation problem and the coordination problem simultaneously. Shared planning with admin control is unoccupied in the Indian market — no existing platform (Indian or global) combines AI-powered personalization with collaborative group planning and booking integration.

### Solution Logic
If we build a collaborative AI trip planner with persona-aware onboarding and shared admin planning, it will reduce trip planning time by 60–70% and improve plan quality and outcomes because the AI handles multi-source research, personalization, and itinerary sequencing — while the shared layer solves the group coordination problem that no Indian travel tool addresses today.

### Autonomous Capabilities
**What the AI does without being asked:**
- Detects persona from onboarding (travel companions, kid ages, budget range, planning style) and sets autonomy mode
- Infers traveler profile from Gmail booking history — scans OTA confirmation emails (MakeMyTrip, IRCTC, OYO, Airbnb, airline confirmations) to build travel history, budget tier, group composition, and preferences without requiring OTA API access
- Pulls and synthesizes research across Google Maps, TripAdvisor, MakeMyTrip, Instagram signals, YouTube sentiment — filtered by persona context
- Sequences day-by-day itinerary factoring in travel time, kid age/energy, opening hours, meal stops
- Surfaces hotel options ranked by family-friendliness, location, in-house dining, budget fit — with reasoning
- Generates pre-trip briefing: closures, weather, local tips, highway vs. city hotel trade-offs
- Monitors prices and alerts admin when flight/hotel hits threshold (H3 lite)
- Remembers preferences across trips — builds a persistent traveler profile over time
- Responds in user's preferred language — Hindi, regional languages, or English; voice input and output for accessibility (pilgrimage travelers, older users)

**Data sources it can access:**
- Google Maps, TripAdvisor, MakeMyTrip, Zomato, IRCTC, weather APIs
- Gmail API (OTA booking confirmation emails — personalization signal, read-only)
- Instagram trending signals (via scraping — untested, flagged as risk)
- Temple/darshan booking sites (via scraping — untested, flagged as risk)
- User's own trip history and preference profile

### Human Touchpoints
- **Onboarding:** Answer 4–5 questions once to set persona and autonomy mode
- **Plan approval:** Admin reviews and approves each section (destination, hotels, day-by-day itinerary) before it's shared with group
- **Group input:** Participants comment and react (WhatsApp-style) on shared plan; admin resolves conflicts
- **Booking confirmation:** Admin taps to confirm each booking — no autonomous spend without explicit approval
- **Price alerts:** Admin receives notification when price threshold is hit, taps to book or dismiss
- **Exception handling:** Agent flags anomalies (place closed, route blocked, weather warning) and surfaces options — human decides

### Interaction Pattern
- **Planning phase:** Conversational chat (Chainlit UI) — admin queries, agent drafts, admin refines
- **Group phase:** Shared persistent plan — admin shares link, participants view + comment + react
- **Pre-trip:** Agent-initiated briefing pushed to admin (and optionally to group via WhatsApp)
- **In-trip:** Agent available on-demand for real-time queries ("food place near me that works for kids", "alternative to Kedarnath if weather is bad") — voice-first for hands-free use during travel
- **Post-trip:** Agent generates trip story/memento — stitches photos, places visited, and highlights into a shareable narrative; auto-drafts Instagram captions and stories for key moments
- **Voice + language:** Full voice interface (Whisper STT + ElevenLabs/Deepgram TTS) with multilingual support (Hindi, regional languages) — primary interface for pilgrimage and older travelers

### Success Metrics
| Metric | Target |
|---|---|
| Planning time saved | 60–70% reduction vs. current manual process (benchmark: ~10–20 hrs/trip → <5 hrs) |
| Money saved | Better deal surfacing — flag price drops, avoid expensive mistakes, compare options across platforms |
| Trip satisfaction | Fewer bad surprises in-trip (wrong hotel, closed attractions, food failures) |
| Group coordination time | Reduce WhatsApp decision threads — faster group consensus via shared plan |
| Retention | Users return for next trip and bring group members as new users |

**Primary hook for Indian users: money saved** — tangible, shareable ("the app saved us ₹8,000 on hotels"), strongest word-of-mouth driver.

### Scope Boundaries
**Included:**
- Persona-aware onboarding and adaptive autonomy mode
- Multi-source research and itinerary drafting
- Shared planning with admin + comment/react for participants
- Hotel, flight, activity recommendations with reasoning
- Booking confirmation loop (admin taps to confirm)
- Price alerting (H3 lite — notify + confirm, not autonomous booking)
- Pre-trip briefing
- In-trip on-demand queries
- Voice input for accessibility
- India-specific context (IRCTC, tier-2 cities, pilgrimage routes, regional food)

**Excluded (out of scope for now):**
- Full autonomous booking without human confirmation
- Expense splitting and settlement (separate product problem)
- Darshan/temple slot booking (untested scraping — deferred)
- Real-time live traffic or transport tracking

**Deferred to later sprints:**
- Post-trip memento and Instagram story generation (Sprint 3+)
- Gmail-based personalization (Sprint 3 — requires OAuth flow + email parsing pipeline)
- Social validation via Instagram signals (Sprint 3 — API access risk unresolved)
- Multilingual + voice interface (Sprint 3 — Whisper + ElevenLabs)
- Upselling and monetization layer (post-MVP)

### Process Requirements

**Process Inputs:**
- User onboarding responses (persona, travel companions, kid ages, budget, dates, destination)
- Trip parameters (destination, duration, group size, special requirements)
- Group participant details (for shared plan access)
- Budget threshold (for price alerting)

**Process Outputs:**
- Structured trip brief (destination overview, logistics, options)
- Day-by-day itinerary with reasoning
- Shared group plan (viewable + commentable by participants)
- Booking recommendations with one-tap confirmation
- Pre-trip briefing document
- In-trip query responses

---

## Experiment Design

### Core Assumption

Given rich family travel context for an **unknown destination**, AI can replace the multi-source research phase (YouTube vlogs + TripAdvisor cross-referencing) and produce a hotel shortlist + day-by-day itinerary that a real Indian family would use with minimal editing.

This is the foundational capability of H2. If it fails here, the rest of the product doesn't matter.

**Scope:** Research + planning phase only (pre-planning → research → itinerary logistics). Booking and in-trip phases require live integrations and are not testable via prompt experiment.

---

### Test Approach

Manual prompt-based testing in Claude.ai or ChatGPT. No code, no integrations. ~2 hours total. Three real trip scenarios used as inputs — judged against what actually happened.

---

### Mock Data Examples

Three real trips from the product owner — used as ground truth for evaluation:

**Scenario 1 — Kerala (primary test case)**
- Group: 2 adults + 1 child (age 5)
- Duration: 5 nights
- Budget: ₹1L+
- First time visiting Kerala — no prior knowledge
- Constraints: kid-friendly meal options required at every stop; moderate activity pace
- What actually happened: Munnar + Alleppey routing (bypassing Kochi); houseboat skipped due to trust gap, Shikara booked via hotel operator; hotel was 4-star but inconveniently located from city center

**Scenario 2 — Puri (edge case: mixed group, religious + leisure)**
- Group: 2 adults + 2 elderly parents (70/60) + 1 child (age 4)
- Duration: ~4 nights
- Budget: ₹60k
- Destination known to parents (frequent religious visits); unknown to planner for kid-specific needs
- Constraints: child (age 4) can't eat most local food; religious itinerary (Jagannath temple); Chilika lake visit
- What actually happened: over-budget hotel booked specifically for kid-friendly food; Chilika cab driver routed to private operator with inflated charges; temple slot booking unknown/unplanned

**Scenario 3 — Guwahati (edge case: elderly parents, no kids, religious + touristy)**
- Group: 2 elderly parents (father 70, mother 60), planned remotely by son
- Duration: 4 nights
- Budget: ₹40k+
- Constraints: religious priority (Kamakhya temple), slower pace, early dinners, no strenuous activity
- What actually happened: Kamakhya online booking failed, premium agent used; parents missed dinner after late Shillong return; Brahmaputra boating — less exciting option taken as better one was fully booked; lunch coordination on Guwahati–Kaziranga route managed via WhatsApp live location while planner was at work

---

### Test Scenarios

**Test 1 — Base capability (Kerala, 30 min)**
Prompt: *"Plan a 5-night Kerala trip for 2 adults and a 5-year-old. Budget ₹1 lakh. First time visiting Kerala. Want to cover the best of what Kerala offers. Kid gets tired easily and needs proper meal options at every stop. Suggest where to stay each night, how many days per location, 2–3 activities per day, and specific hotel recommendations with reasoning."*

Evaluate: Does AI independently arrive at Munnar + Alleppey routing? Does it explain *why* those places with destination-specific reasoning (not generic tourism copy)? Does it flag kid-food and hotel-location concerns unprompted?

**Test 2 — Variation stress test (Kerala, 45 min)**
Run 3 variations of the same prompt:
- Change kid age to 2 (toddler constraints) — does output change meaningfully?
- Add "budget-conscious, avoid tourist traps" — does hotel quality reasoning shift?
- Add elderly parents to the group — does pacing and activity selection adapt?

Evaluate: Does AI adapt output based on context, or produce the same generic Kerala itinerary with words swapped?

**Test 3 — Hard case: elderly parents, religious (Guwahati, 30 min)**
Prompt: *"Plan a 4-night Guwahati trip for elderly parents (father 70, mother 60). Budget ₹40,000. Priority is Kamakhya temple darshan. Also want to cover Shillong day trip and Brahmaputra river experience. Parents need early dinners, no strenuous walking, and a comfortable mid-range hotel in a central location."*

Evaluate: Does AI warn about late Shillong return → missed dinner risk? Does it suggest specific Brahmaputra boat options with booking guidance? Does it flag Kamakhya darshan complexity and queue management?

**Test 4 — Hotel grounding check (30 min)**
Take 2–3 hotel recommendations from Test 1 output. Look each up on MakeMyTrip or Google Maps. Check: Is it a real property? Is the location actually convenient? Does the price match the stated budget? Would you have booked it?

---

### Success Criteria

| Criterion | Pass | Partial | Fail |
|---|---|---|---|
| Routing accuracy | AI arrives at Munnar + Alleppey independently | Gets there with 1 follow-up question | Produces generic Kerala list without reasoning |
| Reasoning depth | Explains *why* each place — destination-specific logic | Generic reasoning, no tradeoffs | Tourism-copy output |
| Kid/group context | Flags kid-food and hotel-location concerns unprompted | Addresses constraints only when explicitly asked | Ignores group context entirely |
| Variation sensitivity | Output meaningfully changes with toddler/elderly context | Minor surface changes | Same output regardless of context |
| Hotel grounding | 2/3 recommendations are real, locatable, budget-appropriate | 1/3 are usable | No real properties or completely off-budget |
| "Would I book it?" | Planner confirms output beats or matches actual booking decisions | Would use with significant edits | Would not use |

**Overall pass bar:** 4 out of 6 criteria at Pass level = capability is real enough to build on.

---

### Learning Goals

- Does AI know Indian destinations (Munnar, Alleppey, Kamakhya, Chilika) well enough to replace YouTube vlog research for a first-time visitor?
- Can it surface unstated family needs (kid-specific food, elderly pace, prayer timing) without being prompted?
- How much hand-holding is needed — one prompt or multiple follow-ups to reach usable output?
- Where does AI confidently hallucinate — fake hotels, wrong opening hours, overestimated distances?
- What prompt structure produces the best output — persona-first, constraint-first, or destination-first?

---

## Extended Product Vision

Features beyond the Sprint 2 MVP, captured here for architecture awareness. These inform design decisions even if not built immediately.

### Personalization via Gmail

**Approach:** OAuth Gmail read-only access to scan OTA booking confirmation emails (MakeMyTrip, IRCTC, OYO, Airbnb, airline bookings). Extract: destinations visited, travel frequency, budget tier (from hotel/flight prices), group composition (adults + children), preferred airlines and hotel chains.

**Why this matters:** Direct OTA API integration is unlikely (MakeMyTrip/IRCTC don't offer consumer-facing APIs). Gmail is the common denominator — every booking generates a confirmation email. This gives the agent a rich prior without requiring users to manually fill a preference profile.

**Technical requirements:** Gmail OAuth (read-only), email parsing pipeline (booking confirmation templates vary by OTA), profile store (vector DB or structured DB).

**Risk:** User trust — Gmail access feels invasive. Mitigation: be explicit about what's read and why; show the inferred profile before first use; allow corrections.

---

### Post-Trip: Memento & Social Sharing

**Concept:** After the trip, the agent generates a shareable trip story — stitching together places visited (from itinerary), user photos (from Google Photos or manual upload), and highlights into a narrative. Auto-drafts Instagram captions, Reels descriptions, and a trip summary card for the group.

**Integration targets:** Google Photos API (photo access), Instagram Graph API (post drafting — publishing requires business account), Memento-style collage generation.

**Why it matters:** Post-trip sharing is a natural viral loop — every shared story is product discovery for new users. The "memento" becomes a portfolio of trips that deepens the traveler profile over time.

**Technical risk:** Instagram Graph API restricts posting for personal accounts; business account or creator account required. May need to generate content for copy-paste rather than direct publish initially.

---

### Upselling & Monetization Layer

**Model:** Freemium with feature-gated upsells.

| Feature | Tier |
|---|---|
| Basic research + itinerary | Free |
| Shared group planning | Free |
| Social validation signals (Instagram trending, peer reviews) | Premium |
| Price monitoring + alerts | Premium |
| Gmail personalization | Premium |
| Post-trip memento generation | Premium |
| OTA partner deals (affiliate or white-label) | Revenue share |

**Social validation as upsell:** Surface "trending among people like you" signals — destinations/restaurants/hotels getting traction among similar traveler profiles (family with kids, budget-conscious, religious travelers). Positioned as "community intelligence" rather than generic ratings.

**OTA partnership angle:** If direct booking integration is achieved with MakeMyTrip or similar, affiliate revenue on bookings made through the platform is a natural revenue stream alongside premium subscriptions.

---

### Social & Group Features

- **Shared trip plan** with admin + participant roles (already in H2 scope)
- **Group decision engine:** surfaces options with social proof — "3 of 5 people in similar groups chose Munnar over Coorg"
- **WhatsApp integration:** push updates, booking confirmations, and pre-trip briefings via WhatsApp Business API (preferred communication channel for Indian users)
- **Peer travel network:** opt-in community where past trip data (anonymised) informs recommendations for similar profiles

---

### Voice & Language

- **Voice-first interaction** via Whisper (STT) + ElevenLabs/Deepgram (TTS)
- **Hindi + regional language support** — Marathi, Tamil, Bengali, Telugu as priority markets
- **WhatsApp voice note input** — user sends voice note, agent transcribes and responds (critical for pilgrimage and older traveler segments)
- **Hands-free in-trip mode** — voice queries while driving, walking, or managing kids
