# User Experience Specification
# TripSathi — Sprint 2 (deadline: May 31)

---

## Section 1: UserContext Schema

The UserContext represents everything the user provides, tracks, validates, and controls
across all three phases of TripSathi: Auth/Onboarding → Planning → Booking.

```python
class UserContext(BaseModel):

    # ── Auth / Identity ──────────────────────────────────────────────────────
    user_id: str                        # generated post-auth, links profile across sessions
    auth_method: str                    # "whatsapp_otp" | "sms_otp" | "google"
    phone_number: str | None            # if WhatsApp OTP or SMS OTP path
    is_authenticated: bool

    # ── Connected data sources (Sprint 3+) ──────────────────────────────────
    gmail_connected: bool               # consent granted for Gmail travel history
    whatsapp_connected: bool            # consent granted for WhatsApp travel signals

    # ── Layer 1 — Manual profile (collected post-auth, once) ─────────────────
    name: str                           # used in plan responses ("Ananya, here's your plan")
    age_range: str                      # "Under 25"|"25–35"|"35–50"|"50+" — tap to select
    home_city: str                      # originating city, type-ahead autocomplete

    # ── Layer 1b — Enriched profile (Sprint 3+, inferred from Gmail/WhatsApp) ─
    travel_profile: dict | None         # past_destinations, preferred_style,
                                        # travel_frequency, usual_companions,
                                        # budget_signals — populated post-consent
                                        # NOTE: explicit trip input always wins over travel_profile

    # ── Layer 2 — Trip inputs (per trip, collected at trip start) ────────────
    destination: str
    travel_dates: dict                  # {start: date, duration_nights: int}
    party_composition: str              # "Solo"|"Couple"|"Family"|"Group" — tap to select
    budget_range: str                   # ₹ bracket — 4 options, tap to select
    trip_style: str                     # "Relaxed"|"Adventure"|"Cultural"|"Mix"
    special_needs: str | None           # optional free text: physical limitations, dietary, etc.

    # ── Planning HITL ────────────────────────────────────────────────────────
    pending_plan: dict | None           # current itinerary awaiting approval
    refinement_request: str | None      # latest change request ("change day 3")
    refinements_used: int               # how many refinements consumed (max 5)
    awaiting_feedback: bool             # True when graph is paused waiting for user

    # ── Booking phase (Sprint 2: mocked; Sprint 3: Booking.com Affiliate API) ─
    booking_candidates: list[dict] | None  # extracted from approved plan.hotels + activities
    booking_confirmations: list[dict]      # {item, confirmation_id, status, amount}
    booking_stage: str                     # "not_started"|"in_progress"|"complete"
    pending_booking_item: dict | None      # item currently awaiting user tap-to-confirm

    # ── Orientation ──────────────────────────────────────────────────────────
    current_stage: str                  # "auth"|"onboarding"|"generating"|"reviewing"
                                        # |"booking"|"done"

    # ── Trust / known gaps ───────────────────────────────────────────────────
    known_limitations: list[str]        # static frontend list: ["Pricing is approximate",
                                        # "Operator names may vary", "No live availability"]
```

### Onboarding Flow Design

**Auth screen (3 steps, under 60 seconds):**
```
Step 1: Enter mobile number
        [Send OTP on WhatsApp]   [Send via SMS]
        ─────────── or ───────────
        [Continue with Google]

Step 2: Verify OTP (6-digit, 30s timer + resend)

Step 3: Name + Age range (tap) + Home city (autocomplete)
        → [Start Planning] CTA
```

**Trip start (per trip, collected on ChatPage):**
```
Destination (text)  |  Travel dates (date picker)
Duration (stepper)  |  Party (Solo/Couple/Family/Group)
Budget (₹ bracket)  |  Style (Relaxed/Adventure/Cultural/Mix)
Special needs (optional free text)
→ [Plan My Trip] CTA
```

**Progressive profile enrichment (Sprint 3+):**
- After signup: prompt to connect Gmail for auto-fill of travel history
- After signup: prompt to connect WhatsApp for travel signal extraction
- `travel_profile` slot reserved in schema — explicitly overridden by per-trip inputs

---

## Section 2: Context Mapping (UserContext → AgentContext)

### User-Facing Component

TripSathi has a **single LangGraph graph** as its agent, accessed via FastAPI.
The user interacts with it through 3 React pages:

```
OnboardingPage  →  ChatPage (planning + HITL)  →  BookingPage
     ↓                      ↓                          ↓
  FastAPI                FastAPI                   FastAPI
  /api/onboard         /api/plan                  /api/book
                        /api/refine               (mock Sprint 2)
                            ↓
                      LangGraph Agent
                      TripSathiState
```

Booking is **NOT** part of LangGraph — it is a separate BookingService.
FastAPI routes `/api/book` to BookingService (mocked in Sprint 2, Booking.com Affiliate API in Sprint 3).

---

### Part 1 — Auth fields: FastAPI session layer only

| UserContext Field | TripSathiState | Notes |
|---|---|---|
| `user_id` | — | FastAPI session layer; not in graph state |
| `auth_method` | — | FastAPI middleware concern |
| `phone_number` | — | Auth layer only |
| `is_authenticated` | — | FastAPI gate; graph never sees unauthenticated request |
| `gmail_connected` | — | Sprint 3+; profile service layer |
| `whatsapp_connected` | — | Sprint 3+; profile service layer |

Auth is a FastAPI concern. The LangGraph graph only runs after auth passes. Correct by design.

---

### Part 2 — Profile fields: user → agent (transformed)

| UserContext Field | TripSathiState Field | Relationship | Data Flow | Notes |
|---|---|---|---|---|
| `name` | `user_profile.name` | transformed | user → agent via onboarding_answers → Call 1 | Used in plan response personalisation |
| `age_range` | `user_profile.age_range` | transformed | user → agent | Shapes persona classification |
| `home_city` | `trip_parameters.from_city` | 1:1 copy | user → agent | Pre-filled at trip start |
| `travel_profile` | `user_profile` (enrichment) | aggregated | Sprint 3+; merges into user_profile dict | Explicit trip input always wins |

---

### Part 3 — Trip inputs: user → agent

| UserContext Field | TripSathiState Field | Relationship | Data Flow | Notes |
|---|---|---|---|---|
| `destination` | `destination` | 1:1 copy | user → agent | Direct pass-through |
| `travel_dates` | `trip_parameters.start_date`, `trip_parameters.duration_nights` | transformed | user → agent | Split into trip_parameters dict |
| `party_composition` | `onboarding_answers` + `user_profile` | transformed | user → agent | Used by Call 1 (persona) + Call 4 (plan) |
| `budget_range` | `trip_parameters.budget_total` | 1:1 copy | user → agent | Direct pass-through |
| `trip_style` | `onboarding_answers` + `user_profile.preferences` | transformed | user → agent | Shapes RAG query expansion (Call 2) |
| `special_needs` | `onboarding_answers` + `user_profile.constraints` | transformed | user → agent | **Critical** — must survive all 4 LLM calls |

---

### Part 4 — Planning HITL: agent → user (bidirectional)

| UserContext Field | TripSathiState Field | Relationship | Data Flow | Notes |
|---|---|---|---|---|
| `pending_plan` | `plan` | 1:1 mapped | agent → user | Shown in ChatPage |
| `refinement_request` | `user_feedback` | 1:1 copy | user → agent | Sent on POST /api/refine |
| `refinements_used` | `refinement_count` | 1:1 copy | agent → user | Drives "3 of 5 refinements" UI |
| `awaiting_feedback` | `awaiting_feedback` | 1:1 copy | agent → user | Controls HITL pause state |

---

### Part 5 — Booking phase: plan → BookingService (separate from LangGraph)

| UserContext Field | TripSathiState / BookingService | Relationship | Data Flow | Notes |
|---|---|---|---|---|
| `booking_candidates` | derived from `plan.hotels[]` + `plan.days[].activities` | extracted | plan → React → BookingService | React parses approved plan to build candidate list |
| `booking_confirmations` | BookingService response | mapped | BookingService → user | `{confirmation_id, status, amount}` per item |
| `booking_stage` | BookingService state | derived | BookingService → user | React tracks overall progress |
| `pending_booking_item` | in-flight BookingService call | transient | user ↔ BookingService | Item awaiting tap-to-confirm |

**Mock booking response (Sprint 2 — hardcoded):**
```json
{
  "confirmation_id": "TRP-2026-KL-001",
  "status": "confirmed",
  "provider": "Booking.com",
  "item_name": "Pagoda Resort Alleppey",
  "amount_charged": 12500,
  "check_in": "2026-06-10",
  "check_out": "2026-06-12"
}
```
Sprint 3: same response shape from Booking.com Affiliate API.

---

### Part 6 — Orientation & trust: agent → user (read-only)

| UserContext Field | TripSathiState Field | Relationship | Data Flow | Notes |
|---|---|---|---|---|
| `current_stage` | `current_node` | derived | agent → user | Node name → human-readable label (translation in React) |
| `known_limitations` | — | no mapping | — | Static list hardcoded in React UI |

**`current_node` → `current_stage` translation (React layer):**
```ts
const stageLabel = {
  "persona_classification": "Understanding your profile...",
  "destination_intelligence": "Researching destination...",
  "plan_assembly": "Generating your plan...",
  "awaiting_feedback": "Review your plan",
  "done": "Plan finalised",
  "error": "Something went wrong"
}
```

---

### Gaps Identified

| Gap | Location | Resolution |
|---|---|---|
| `current_stage` translation | React layer | `stageLabel` map translates `current_node` → user-readable string |
| `known_limitations` | Frontend only | Static disclaimer list in React — not derived from agent state |
| Auth fields | FastAPI only | Correctly excluded from LangGraph state |
| Booking | Separate BookingService | NOT in TripSathiState — clean separation |
| `travel_profile` | Sprint 3+ slot | Reserved in schema; nothing reads it in Sprint 2 |

---

### Mock API Layer (UI-first development)

All API calls routed through a thin service layer in React:

```
frontend/src/services/
  api.ts           ← all API calls; checks VITE_USE_MOCK flag
frontend/src/mocks/
  auth.json        ← mock OTP verify response
  profile.json     ← mock user profile after onboarding
  plan.json        ← mock plan + thread_id + status: "awaiting_feedback"
  refine.json      ← mock refined plan
  booking.json     ← mock booking confirmations per item
```

```ts
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function generatePlan(params) {
  if (USE_MOCK) return mockPlan
  return fetch('/api/plan', { method: 'POST', body: JSON.stringify(params) })
}
```

Sprint 3: `VITE_USE_MOCK=false` → all calls hit real FastAPI endpoints.

**Mock data shapes must exactly match real API contracts** (defined in `specs/mvp_specs.md`).
If mock plan structure diverges from real `/api/plan` response, integration will require UI rework.

---

### 3-Page React App Structure

```
OnboardingPage.tsx
  ├── AuthScreen      (WhatsApp OTP / SMS OTP / Google)
  ├── OTPVerify       (6-digit, 30s timer)
  └── ProfileForm     (name, age_range, home_city)
        ↓ on submit → POST /api/onboard

ChatPage.tsx
  ├── TripForm        (destination, dates, duration, party, budget, style, special_needs)
  ├── PlanDisplay     (renders plan.days[], plan.hotels[], plan.warnings[])
  ├── ChatInput       (refinement input or approval)
  └── RefinementBar   ("3 of 5 refinements used")
        ↓ on submit → POST /api/plan or POST /api/refine

BookingPage.tsx
  ├── HotelCards      (from plan.hotels[] → tap to book)
  ├── FlightSection   (estimated options → tap to book)
  ├── ActivityCards   (optional items → tap to book or skip)
  ├── BookingStatus   (confirmed / skipped / pending per item)
  └── BookingSummary  ("Trip booking complete" + total confirmed spend)
        ↓ on tap → POST /api/book (mocked Sprint 2)
```

---

---

## Section 3: UX Gaps and Risks

### LLM Risk Mitigation

| Risk | Where It Occurs | User Oversight Mechanism |
|---|---|---|
| Hallucination | Call 3 (local risks), Call 4 (hotel names, budget) | HITL plan review; `content_source` tag on plan items (RAG-grounded vs general knowledge); "Verify before booking" on hotel cards |
| Stochastic Behavior | All 4 LLM calls | "Regenerate" button on ChatPage; `can_regenerate: bool` in UserContext |
| Context Loss | MemorySaver (in-process, lost on restart); LLM regression on earlier changes | `visible_refinement_history` surfaced as collapsible "Change history" in ChatPage |
| Instruction Following Failures | Call 4 refinement — ambiguous change requests | `interpreted_change` echo shown before plan re-renders ("Applying: change hotel on day 3...") |
| Prompt Injection | `special_needs` free text → Call 1 prompt; `refinement_request` → Call 4 prompt | FastAPI Pydantic validation; injection-anchoring lines in PERSONA_CLASSIFICATION_SYSTEM and PLAN_REFINEMENT_SYSTEM |
| Overconfidence | `plan.budget_breakdown`, `plan.hotels[]`, `booking_candidates` | `known_limitations` banner on BookingPage entry; `booking_disclaimer_acknowledged` gates booking actions |

### Risks Without Adequate Oversight (Resolved)

All 6 risks now have coverage. Key additions to UserContext:

```python
can_regenerate: bool                   # True after initial plan shown; enables fresh Call 4
visible_refinement_history: list[str]  # maps from TripSathiState.refinement_history
interpreted_change: str | None         # agent's interpretation echo before refining
booking_disclaimer_acknowledged: bool  # user dismissed "pricing approximate" banner
```

Backend-only fixes (no UserContext change):
- Add injection-anchoring to PERSONA_CLASSIFICATION_SYSTEM and PLAN_REFINEMENT_SYSTEM
- Add `content_source: "rag" | "general"` field to plan.hotels[] items

---

### Agent Memory Construct

Memory is a 3-layer construct that continuously improves personalization across sessions:

```
Layer 1 — Working memory    (current session)
          LangGraph MemorySaver — already designed (TripSathiState)
          Lost on restart. Sprint 2 scope.

Layer 2 — Episodic memory   (per-trip record)
          Each completed trip stored as an episode:
          {destination, trip_style, hotel_tier, refinements_made,
           bookings_confirmed, budget_actually_spent, group_composition}
          Sprint 2: write only (local JSON/SQLite)
          Sprint 3: Mem0 / Zep

Layer 3 — Semantic memory   (distilled preferences)
          Learned from episodes over time:
          "prefers budget hotels over resorts"
          "always removes beach activities from plans"
          "typically spends ₹70–90k on family trips"
          Sprint 3: Mem0 / Zep + Preferences UI panel
```

**Memory write triggers (Sprint 2 — collect only):**

| Event | What gets stored |
|---|---|
| Onboarding submitted | Initial preferences snapshot |
| Refinement made | Change signal ("user replaced mountain trek with beach day") |
| Plan approved | Destination, structure, hotel tier, warnings acknowledged |
| Booking confirmed | Actual hotel, amount spent, booking timing |
| Session ended | Episode summary: destination, duration, budget, group composition |

**Memory read triggers (Sprint 3 — use):**

| Where | How used |
|---|---|
| Trip form | Pre-fill home_city, party_composition, budget_range from past trips |
| Call 1 (Persona Classification) | Enrich onboarding_answers with `memory_profile` context |
| Call 4 (Plan Generation) | "User previously rejected beach hotels — prefer inland options" |
| BookingPage | Pre-select preferred hotel tier based on past bookings |

**Memory architecture:**

```
MemoryService (outside LangGraph — new Sprint 2 component)
  POST /api/memory/episode   ← write after plan approval
  POST /api/memory/booking   ← write after booking confirmed
  GET  /api/memory/profile/{user_id}  ← read at trip start (Sprint 3)
```

Sprint 3: swap local store for Mem0/Zep SDK — no change to write/read interface.

**UserContext additions for memory:**

```python
memory_profile: dict | None            # learned preferences from past trips
                                        # {preferred_hotel_tier, typical_budget_range,
                                        #  avoided_activity_types, past_destinations,
                                        #  avg_refinements_per_trip}
                                        # Sprint 2: None (collect only)
                                        # Sprint 3: populated from Mem0/Zep

preference_corrections: list[dict]     # user overrides to learned preferences
                                        # {field, old_value, corrected_value, date}
                                        # Sprint 3: Preferences UI panel

memory_acknowledged: bool              # user has seen "here's what I know about you" prompt
```

**Sprint 3 — Preferences UI panel (user sees + controls memory):**
```
What TripSathi knows about you:
  • You usually travel with: Family (2 adults + kids)
  • Preferred hotel tier: 3-star, central location
  • Budget range: ₹60–80k for 5-night trips
  • You typically avoid: Beach resorts, luxury properties
  • Past trips: Kerala (Jun 2025), Puri (Jan 2025)

[Edit preferences]  [Reset memory]
```

---

### Updated UserContext Schema (Final — post all validations)

```python
class UserContext(BaseModel):

    # ── Auth / Identity ──────────────────────────────────────────────────────
    user_id: str
    auth_method: str                    # "whatsapp_otp" | "sms_otp" | "google"
    phone_number: str | None
    is_authenticated: bool

    # ── Connected data sources (Sprint 3+) ──────────────────────────────────
    gmail_connected: bool
    whatsapp_connected: bool

    # ── Layer 1 — Manual profile ─────────────────────────────────────────────
    name: str
    age_range: str
    home_city: str

    # ── Layer 1b — Enriched profile (Sprint 3+) ──────────────────────────────
    travel_profile: dict | None         # Gmail/WhatsApp inferred — explicit trip input wins

    # ── Agent memory (Sprint 2: collect only; Sprint 3: use) ─────────────────
    memory_profile: dict | None         # learned from past trips via MemoryService
    preference_corrections: list[dict]  # user overrides to learned preferences
    memory_acknowledged: bool           # user has seen "here's what I know about you"

    # ── Layer 2 — Trip inputs (per trip) ─────────────────────────────────────
    destination: str
    travel_dates: dict
    party_composition: str
    budget_range: str
    trip_style: str
    special_needs: str | None

    # ── Planning HITL ────────────────────────────────────────────────────────
    pending_plan: dict | None
    refinement_request: str | None
    refinements_used: int
    awaiting_feedback: bool
    can_regenerate: bool                # enables fresh Call 4 without changing inputs
    visible_refinement_history: list[str]  # shown as collapsible "Change history"
    interpreted_change: str | None      # agent's echo before applying refinement

    # ── Booking phase (Sprint 2: mocked; Sprint 3: real) ─────────────────────
    booking_candidates: list[dict] | None
    booking_confirmations: list[dict]
    booking_stage: str
    pending_booking_item: dict | None
    booking_disclaimer_acknowledged: bool

    # ── Orientation ──────────────────────────────────────────────────────────
    current_stage: str

    # ── Trust ────────────────────────────────────────────────────────────────
    known_limitations: list[str]
```

---

---

## Section 4: Context Ownership Rules

### Ownership Types Used
- **USER-OWNED** — User writes, agent reads only. Agent must never overwrite.
- **AGENT-OWNED** — Agent writes, user views only. User has no direct edit path.
- **CO-AUTHORED** — Both write with explicit conflict resolution rules.

### Annotated UserContext Schema

```python
class UserContext(BaseModel):

    # ── Auth / Identity ──────────────────────────────────────────────────────

    user_id: str
    # AGENT-OWNED: Generated by FastAPI post-auth. User never sets or modifies.

    auth_method: str
    # USER-OWNED: User chooses WhatsApp OTP / SMS OTP / Google. Agent reads only.

    phone_number: str | None
    # USER-OWNED: User provides at auth. Agent reads only, never modifies.

    is_authenticated: bool
    # AGENT-OWNED: FastAPI sets after OTP/OAuth verification. User views via
    # session state only.

    # ── Connected data sources ───────────────────────────────────────────────

    gmail_connected: bool
    # CO-AUTHORED (user controls, agent tracks):
    #   User grants OAuth consent → agent sets True
    #   User revokes → agent sets False, stops reading Gmail data immediately
    #   User can toggle off at any time from profile settings
    #   Rule: agent never re-requests Gmail access after user revokes

    whatsapp_connected: bool
    # CO-AUTHORED — same pattern as gmail_connected

    # ── Layer 1 — Manual profile ─────────────────────────────────────────────

    name: str
    # USER-OWNED: User sets at onboarding. Agent reads only — uses in plan
    # personalisation ("Ananya, here's your plan"). Agent never modifies.

    age_range: str
    # USER-OWNED: User selects bracket at onboarding. Agent reads only.
    # memory_profile may suggest a pre-fill, but user must confirm.

    home_city: str
    # USER-OWNED: User provides at onboarding. Agent reads only.
    # memory_profile may suggest a pre-fill, but user must confirm.

    # ── Layer 1b — Enriched profile (Sprint 3+) ──────────────────────────────

    travel_profile: dict | None
    # CO-AUTHORED (agent infers, user corrects):
    #   Agent infers from Gmail/WhatsApp post-consent
    #   User reviews inferred values in profile settings and can correct any field
    #   Explicit per-trip inputs ALWAYS override travel_profile values
    #   Rule: travel_profile is a suggestion layer, never a hard constraint

    # ── Agent memory ─────────────────────────────────────────────────────────

    memory_profile: dict | None
    # CO-AUTHORED (agent tracks, user corrects):
    #   Agent writes from episode history after each trip
    #   Sprint 2: write only (local store, not read back into LLM calls)
    #   Sprint 3: read into Call 1 + Call 4 for personalization
    #   User submits corrections via preference_corrections
    #   Corrections always take priority over agent-inferred values
    #   User can reset entirely → agent clears and starts fresh

    preference_corrections: list[dict]
    # USER-OWNED: User explicitly overrides agent-learned preferences.
    # Agent reads and applies immediately. Agent never modifies this list —
    # only appends when user submits a new correction.
    # {field, old_value, corrected_value, date}

    memory_acknowledged: bool
    # USER-OWNED: User dismisses "here's what I know about you" prompt.
    # Agent sets False on first login. User sets True on dismiss.

    # ── Layer 2 — Trip inputs (per trip) ─────────────────────────────────────

    destination: str
    # USER-OWNED: User types. Agent reads only, never infers or overrides.

    travel_dates: dict
    # USER-OWNED: User sets via date picker. Agent reads only.

    party_composition: str
    # USER-OWNED: User selects. memory_profile may suggest default — user confirms.

    budget_range: str
    # USER-OWNED: User selects bracket. memory_profile may suggest default —
    # user must explicitly confirm. Agent never upgrades budget tier silently.

    trip_style: str
    # USER-OWNED: User selects. Agent reads only.

    special_needs: str | None
    # USER-OWNED: User provides free text. Agent reads only, never modifies.
    # High-sensitivity field — agent must honour verbatim, not interpret liberally.

    # ── Planning HITL ────────────────────────────────────────────────────────

    pending_plan: dict | None
    # CO-AUTHORED (agent proposes, user approves/refines):
    #   Agent writes initial proposal via Call 4
    #   User can request refinements (up to 5) — each refinement is a new agent write
    #   User approval locks the plan — no further agent modification without user request
    #   If user explicitly overrides a warning ("I want the houseboat anyway"),
    #   agent respects the override and removes the warning for that item
    #   Rule: agent must maintain ALL original constraints across refinement cycles
    #   Rule: agent must never remove a user-approved element in subsequent refinements
    #         unless the user explicitly requests it

    refinement_request: str | None
    # USER-OWNED: User writes change requests in free text.
    # Agent reads only. Never pre-populated by agent.

    refinements_used: int
    # AGENT-OWNED: Agent increments on each Call 4 execution.
    # User views as "X of 5 refinements used" counter. Read-only for user.

    awaiting_feedback: bool
    # AGENT-OWNED: Agent sets True on interrupt(), False on approval or max refinements.
    # Controls whether ChatInput is visible in React.

    can_regenerate: bool
    # AGENT-OWNED: Agent sets True after initial plan is shown.
    # Enables "Regenerate" button — triggers fresh Call 4 with same inputs.
    # Resets to False while generation is in progress.

    visible_refinement_history: list[str]
    # AGENT-OWNED: Agent writes from TripSathiState.refinement_history.
    # User views as collapsible "Change history" panel. Read-only.
    # Purpose: lets user point to earlier approved changes if agent regresses

    interpreted_change: str | None
    # AGENT-OWNED: Agent writes a brief interpretation of user's refinement request
    # before executing ("Applying: change hotel on day 3 from resort to budget option")
    # Shown for 2-3 seconds before plan re-renders.
    # User cannot edit — but can submit a corrected refinement_request if wrong.

    # ── Booking phase ────────────────────────────────────────────────────────

    booking_candidates: list[dict] | None
    # AGENT-OWNED: Agent extracts from approved plan.hotels[] + plan.days[].activities
    # User cannot add items — booking candidates are strictly derived from the plan.
    # User can skip any item.

    booking_confirmations: list[dict]
    # CO-AUTHORED (agent proposes item, user confirms each):
    #   Agent surfaces each candidate as a booking proposal
    #   User taps "Book" (adds to confirmations) or "Skip" (removes from candidates)
    #   Once user confirms, agent cannot reverse without explicit user action
    #   Rule: agent never auto-confirms any booking — every item requires user tap

    booking_stage: str
    # AGENT-OWNED: Agent tracks based on confirmation progress.
    # "not_started" | "in_progress" | "complete"

    pending_booking_item: dict | None
    # CO-AUTHORED (agent surfaces, user resolves):
    #   Agent sets to the next unresolved booking candidate
    #   User resolves via Book or Skip
    #   Agent clears and moves to next item

    booking_disclaimer_acknowledged: bool
    # USER-OWNED: User dismisses "pricing approximate" banner on BookingPage entry.
    # Agent sets False on BookingPage load. User sets True on dismiss.
    # Booking actions gated until acknowledged.

    # ── Orientation ──────────────────────────────────────────────────────────

    current_stage: str
    # AGENT-OWNED: Derived from TripSathiState.current_node via React translation map.
    # "auth" | "onboarding" | "generating" | "reviewing" | "booking" | "done"
    # User views as progress indicator only.

    # ── Trust ────────────────────────────────────────────────────────────────

    known_limitations: list[str]
    # AGENT-OWNED: Static list hardcoded in React.
    # ["Pricing is approximate", "Operator names may vary", "No live availability"]
    # Shown as dismissible disclaimer. User cannot edit.
```

### Ownership Summary

| Ownership | Fields |
|---|---|
| USER-OWNED (10) | auth_method, phone_number, name, age_range, home_city, destination, travel_dates, party_composition, budget_range, trip_style, special_needs, refinement_request, preference_corrections, memory_acknowledged, booking_disclaimer_acknowledged |
| AGENT-OWNED (9) | user_id, is_authenticated, refinements_used, awaiting_feedback, can_regenerate, visible_refinement_history, interpreted_change, booking_candidates, booking_stage, current_stage, known_limitations |
| CO-AUTHORED (5) | gmail_connected, whatsapp_connected, travel_profile, memory_profile, pending_plan, booking_confirmations, pending_booking_item |

### Critical Co-Authoring Rules

1. **`pending_plan`** — agent must never remove a user-approved element across refinement cycles
2. **`memory_profile`** — user corrections always override agent-inferred values; user reset clears entirely
3. **`budget_range`** — agent never silently upgrades budget tier even if memory_profile suggests higher
4. **`booking_confirmations`** — every item requires explicit user tap; no auto-confirm ever
5. **`travel_profile` / `memory_profile`** — explicit per-trip inputs always win over enriched profile data

---

---

## Section 5: Interaction Flow

### Full User-Agent Choreography

```
╔══════════════════════════════════════════════════════════════╗
║  PHASE 1 — AUTH & ONBOARDING                                 ║
╚══════════════════════════════════════════════════════════════╝

  USER                          AGENT / SYSTEM
  ────                          ──────────────

  Enter mobile number           →  OTP dispatch (WhatsApp / SMS)
  [or] tap Google               →  OAuth redirect

  Submit OTP / OAuth callback   →  Verify → set is_authenticated
                                   Generate user_id
                                   Check: returning user?

  ── IF RETURNING USER ──────────────────────────────────────────
                                →  Load memory_profile from MemoryService
                                   Show "Here's what I know about you" prompt
                                   Set memory_acknowledged = False

  User reads memory summary     →  Tap dismiss
  [or] tap "Edit preferences"   →  Submit preference_corrections (USER-OWNED)
                                   Set memory_acknowledged = True

  ── IF NEW USER ────────────────────────────────────────────────
  Fill profile form:
    name (text)
    age_range (tap bracket)
    home_city (autocomplete)    →  POST /api/onboard
                                   Store profile to MemoryService (initial snapshot)

  ── BOTH PATHS ─────────────────────────────────────────────────
                                →  current_stage = "onboarding" ✓
                                   Navigate to ChatPage


╔══════════════════════════════════════════════════════════════╗
║  PHASE 2 — TRIP PLANNING                                     ║
╚══════════════════════════════════════════════════════════════╝

  USER                          AGENT / SYSTEM
  ────                          ──────────────

  Fill trip form:
    destination (text)
    travel_dates (date picker)
    duration (stepper)
    party_composition (tap)
    budget_range (tap bracket)  ←  memory_profile may suggest default
    trip_style (tap)                User must confirm — never auto-filled silently
    special_needs (optional)    →  POST /api/plan + thread_id generated

                                →  current_stage = "generating"
                                   Progress indicator: "Understanding your profile..."

  [User waits — no input]       →  Call 1: Persona Classification
                                   current_stage = "Researching destination..."
                                →  Call 2: RAG Query Expansion
                                →  LlamaIndex → Chroma
                                →  Call 3: Research Synthesis
                                   current_stage = "Generating your plan..."
                                →  Call 4: Plan Generation
                                   interrupt() → awaiting_feedback = True
                                   can_regenerate = True

  ── PLAN PRESENTED ─────────────────────────────────────────────
                                →  current_stage = "reviewing"
                                   Render PlanDisplay:
                                     day-by-day itinerary
                                     hotel cards (with content_source tag)
                                     budget breakdown (with "approximate" note)
                                     warnings array
                                   Show: "X of 5 refinements available"
                                   Show: [Regenerate] button (can_regenerate = True)

  ── USER APPROVES ──────────────────────────────────────────────
  Type "looks good" / "approve" →  POST /api/refine (approval signal)
                                   awaiting_feedback = False
                                   current_stage = "done"
                                →  Write episode to MemoryService:
                                     {destination, hotel_tier, trip_style,
                                      refinements_used, warnings_acknowledged}
                                   Navigate to BookingPage

  ── USER REQUESTS CHANGE ───────────────────────────────────────
  Type "change day 3 hotel"     →  POST /api/refine {thread_id, user_feedback}
                                   interpreted_change = "Changing accommodation on day 3
                                     to a different property..."
                                   Show interpreted_change for 2–3s

  [User sees: "Applying: ..."]  →  Call 4 (refinement)
                                   visible_refinement_history updated
                                   plan updated
                                   interrupt() again
                                   refinements_used += 1

                                →  Re-render PlanDisplay with updated plan
                                   "Change history" panel updates
                                   interpreted_change = None

  [Repeat up to 5 times]

  ── MAX REFINEMENTS HIT ────────────────────────────────────────
                                →  refinements_used = 5
                                   awaiting_feedback = False
                                   Show: "Maximum refinements reached — here's
                                          your final plan"
                                   can_regenerate still available

  ── USER REGENERATES ───────────────────────────────────────────
  Tap [Regenerate]              →  can_regenerate = False (during generation)
                                   Fresh Call 4 with same inputs
                                   New plan proposal
                                   can_regenerate = True
                                   refinements_used resets to 0

  ── UNCERTAINTY / ERROR ────────────────────────────────────────
  Error in Node 1/2/3           →  current_stage = "error"
                                   Show: "Something went wrong — try again"
                                   [Retry] button resets and re-runs graph

  RAG returns 0 chunks          →  Plan includes: "Limited local knowledge —
                                     verify recommendations independently"
                                   Plan not aborted; degraded gracefully


╔══════════════════════════════════════════════════════════════╗
║  PHASE 3 — BOOKING                                           ║
╚══════════════════════════════════════════════════════════════╝

  USER                          AGENT / SYSTEM
  ────                          ──────────────

  ── BOOKING PAGE ENTRY ─────────────────────────────────────────
                                →  booking_candidates extracted from plan.hotels[]
                                     + plan.days[].activities
                                   booking_stage = "not_started"
                                   booking_disclaimer_acknowledged = False

                                →  Show dismissible banner:
                                     "Pricing is approximate. Verify availability
                                      before confirming. TripSathi is not responsible
                                      for price changes or availability."

  Tap [Got it]                  →  booking_disclaimer_acknowledged = True
                                   booking_stage = "in_progress"
                                   Booking actions now enabled

  ── PER ITEM LOOP ──────────────────────────────────────────────
                                →  Show booking candidates in 3 sections:
                                     🏨 Hotels (required)
                                     ✈️ Flights (estimated)
                                     🎯 Activities (optional)
                                   pending_booking_item = first unresolved item

  User taps [Book]              →  POST /api/book {item, user_id}
  on hotel/flight/activity         Sprint 2: mock returns confirmation
                                   Sprint 3: Booking.com Affiliate API

                                →  booking_confirmations updated:
                                     {item, confirmation_id, status: "confirmed", amount}
                                   Item card flips to "Booked ✓ | TRP-KL-001"
                                   pending_booking_item = next unresolved item
                                →  Write booking to MemoryService:
                                     {hotel_tier, amount_spent, booking_timing}

  User taps [Skip]              →  Item marked as "Skipped"
                                   No MemoryService write for skipped items
                                   pending_booking_item = next unresolved item

  ── ALL ITEMS RESOLVED ─────────────────────────────────────────
                                →  booking_stage = "complete"
                                   Show BookingSummary:
                                     Confirmed bookings with confirmation IDs
                                     Total confirmed spend
                                     "Trip booking complete ✓"
                                →  Write session close to MemoryService:
                                     {total_spent, destinations, group_composition,
                                      booking_patterns}

  ── BOOKING ERROR ──────────────────────────────────────────────
  Mock/API call fails           →  Show: "Couldn't complete this booking — try again
                                     or book directly on [provider]"
                                   Item stays as "pending"
                                   [Retry] and [Book directly] options shown
```

---

### Interaction Checkpoints Summary

| Checkpoint | Phase | What User Does | What Agent Does |
|---|---|---|---|
| Memory review | Auth | Reads + corrects learned preferences | Loads memory_profile, applies corrections |
| Trip form submission | Planning | Confirms all trip inputs | Validates, generates thread_id |
| Plan review | Planning | Reads full plan, decides approve or refine | Waits at interrupt() |
| Interpretation echo | Planning | Reads agent's interpretation before refine | Shows interpreted_change for 2–3s |
| Change history | Planning | Views past refinements if agent regresses | Provides visible_refinement_history |
| Disclaimer acknowledgement | Booking | Dismisses pricing warning | Gates booking actions until acknowledged |
| Per-item Book / Skip | Booking | Taps to confirm each item individually | Calls BookingService, updates confirmations |

### Uncertainty and Error Handling

| Scenario | What User Sees | What User Can Do |
|---|---|---|
| Plan generation takes >30s | Progress indicator with current stage label | Wait; no timeout in Sprint 2 |
| Node error (persona/research/plan) | "Something went wrong — try again" | [Retry] restarts graph |
| RAG returns 0 chunks | Plan renders with "limited knowledge" warning | Proceed or request refinement |
| Refinement misunderstood | Sees interpreted_change before plan updates | Submit corrected refinement_request |
| Max refinements reached | "Final plan" message + can still regenerate | [Regenerate] for fresh start |
| MemorySaver lost (server restart) | "Session expired — please start a new plan" | Start fresh from ChatPage |
| Booking API fails | Item stays pending + retry + direct link | [Retry] or [Book directly] |

---

### Updated Project Structure (with UX additions)

```
tripsathi/
├── backend/
│   ├── main.py              # FastAPI — add /api/book endpoint (mock)
│   ├── graph.py
│   ├── nodes.py
│   ├── state.py
│   ├── prompts.py
│   └── rag/
│       └── knowledge/
│           ├── kerala.md
│           ├── puri.md
│           └── guwahati.md
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── services/
│       │   └── api.ts           ← NEW: mock/real API abstraction
│       ├── mocks/
│       │   ├── auth.json        ← NEW
│       │   ├── profile.json     ← NEW
│       │   ├── plan.json        ← NEW
│       │   ├── refine.json      ← NEW
│       │   └── booking.json     ← NEW
│       ├── pages/
│       │   ├── OnboardingPage.tsx   ← updated: auth + profile
│       │   ├── ChatPage.tsx         ← updated: trip form + HITL
│       │   └── BookingPage.tsx      ← NEW
│       └── components/
│           ├── AuthScreen.tsx       ← NEW
│           ├── OTPVerify.tsx        ← NEW
│           ├── ProfileForm.tsx      ← NEW
│           ├── TripForm.tsx         ← NEW
│           ├── PlanDisplay.tsx
│           ├── ChatInput.tsx
│           ├── HotelCard.tsx        ← NEW
│           ├── FlightSection.tsx    ← NEW
│           ├── ActivityCard.tsx     ← NEW
│           └── BookingSummary.tsx   ← NEW
└── data/
    └── evaluations_data.csv
```
