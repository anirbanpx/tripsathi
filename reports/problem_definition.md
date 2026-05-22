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

### User Existing Tools

| Phase | Tools Used |
|---|---|
| Inspiration | Instagram, YouTube, WhatsApp |
| Research | Google, MakeMyTrip, TripAdvisor, Google Maps |
| Logistics | Google Maps, TripAdvisor, Zomato/Swiggy, Facebook/WhatsApp groups |
| Booking | MakeMyTrip, IRCTC, OYO/hotel sites, Airbnb, local cab apps |
| In-trip | Google Maps, ad-hoc search |
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
- Pulls and synthesizes research across Google Maps, TripAdvisor, MakeMyTrip, Instagram signals, YouTube sentiment — filtered by persona context
- Sequences day-by-day itinerary factoring in travel time, kid age/energy, opening hours, meal stops
- Surfaces hotel options ranked by family-friendliness, location, in-house dining, budget fit — with reasoning
- Generates pre-trip briefing: closures, weather, local tips, highway vs. city hotel trade-offs
- Monitors prices and alerts admin when flight/hotel hits threshold (H3 lite)
- Remembers preferences across trips — builds a persistent traveler profile over time

**Data sources it can access:**
- Google Maps, TripAdvisor, MakeMyTrip, Zomato, IRCTC, weather APIs
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
- **In-trip:** Agent available on-demand for real-time queries ("food place near me that works for kids", "alternative to Kedarnath if weather is bad")
- **Voice:** Available for older/pilgrimage travelers who prefer speaking over typing

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
- Post-trip reviews or content creation
- Instagram social validation (untested API access — deferred)
- Darshan/temple slot booking (untested scraping — deferred)
- Real-time live traffic or transport tracking

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
