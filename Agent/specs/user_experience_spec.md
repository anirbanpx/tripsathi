# User Experience Specification
# TripSathi — Sprint 2 (deadline: May 31)

---

## Section 0: Sprint 2 UX Decisions (Locked)

These four decisions shape every downstream section. They emerged from a UX critique pass
before mockup generation in Claude Design.

### Decision 1 — Demo Mode entry path (no auth wall for visitors)

Sprint 2 is a portfolio demo. Recruiters, bootcamp reviewers, and peers will not give a
phone number to see a working agent.

**Solution:** First screen offers two paths:
- **[Try Demo]** — single tap, drops user into ChatPage with a pre-loaded Kerala family
  trip scenario. No auth, no profile, no PII. Demonstrates the full plan + refinement +
  booking flow end-to-end.
- **[Sign In to Plan]** — opens the actual auth flow (WhatsApp / SMS / Google).

Mock booking and mock memory work identically in both paths; real users in Sprint 3 get
real auth + real bookings.

### Decision 2 — Single-page layout, not 3-page linear

Real travelers iterate non-linearly: plan → refine → check budget → revisit plan → book.
A linear `Onboarding → Chat → Booking` flow forces back-button gymnastics.

**Solution:** Single scrollable PlannerPage with three vertical sections:
- **Top:** Trip Input (conversational form with chips)
- **Middle:** Plan Display (full itinerary + refine/regenerate controls)
- **Bottom:** Booking Section (appears after plan approval; collapsible)

OnboardingPage stays separate (one-time auth + profile). Once authenticated or in demo,
the user lives on PlannerPage.

### Decision 3 — Fake progress UI for plan generation

Sprint 2 has no streaming. The blocking `graph.invoke()` call takes 30–60 seconds.
Building real SSE costs 8–10 hours and adds async LangGraph complexity. The user-visible
information would be identical to a fake-progress approximation.

**Solution:** Frontend-driven `setTimeout` progress UI calibrated to typical node
durations. Backend writes `stage_label` to state, but Sprint 2 frontend uses hardcoded
timings (since it can't poll mid-call without streaming). Sprint 3: replace with real
SSE via `graph.astream_events` — same UI component, same labels, same UX.

```ts
const stages = [
  { label: "Understanding your profile",   duration: 4000  },
  { label: "Researching your destination", duration: 12000 },
  { label: "Reading destination guides",   duration: 6000  },
  { label: "Generating your itinerary",    duration: 25000 },
  { label: "Adding personal touches",      duration: 8000  },
]
// Real graph.invoke() runs in parallel; on completion, jump to "done"
// Minimum 1500ms per stage so labels are readable
// After 60s on final stage: show "Taking a bit longer than usual..."
```

### Decision 4 — Conversational chip-based trip form (no Call 0)

Spec previously had a 7-field form wall, contradicting the "ask in natural language"
problem statement. Adding a new Call 0 (free-text parser) costs 2–3 hours of Sprint 2.

**Solution:** Keep structured form (no new LLM call), redesign as stepped chip UI:

```
Step 1: Where are you going?            [Kerala_____]    [Next →]
Step 2: When and how long?              [Jun 10 ▼] [5 nights ▼]
Step 3: Who's coming?                   [Family ▼] [Adults: 2] [Kids: 1] [Ages: 5]
Step 4: Budget?                         [₹50k–80k] [₹80k–1.5L] [₹1.5L+]
Step 5: Trip style?                     [Relaxed] [Adventure] [Cultural] [Mix]
Step 6: Anything special?              [Optional free text — physical limits,
                                         dietary needs, must-haves...]
                                        [Generate Plan →]
```

Each step is a single question with chip-style inputs. User can revisit previous steps
via back arrow. Same `trip_parameters` object lands at the backend — backend code
unchanged from `mvp_specs.md`.

---

## Section 1: UserContext Schema (Final)

```python
class UserContext(BaseModel):

    # ── Mode (Sprint 2 entry path) ───────────────────────────────────────────
    mode: str                           # "demo" | "authenticated"
    # Demo mode bypasses auth + uses Kerala family pre-loaded scenario.
    # All booking/memory writes still go through mock endpoints, marked is_demo.

    # ── Auth / Identity (Sprint 3 build, designed now) ───────────────────────
    user_id: str | None                 # None in demo mode; generated post-auth otherwise
    auth_method: str | None             # "whatsapp_otp" | "sms_otp" | "google"
    phone_number: str | None
    is_authenticated: bool

    # ── Connected data sources (Sprint 3+) ──────────────────────────────────
    gmail_connected: bool
    whatsapp_connected: bool

    # ── Layer 1 — Manual profile ─────────────────────────────────────────────
    name: str                           # "Demo Traveller" in demo mode
    age_range: str                      # "Under 25" | "25–35" | "35–50" | "50+"
    home_city: str

    # ── Layer 1b — Enriched profile (Sprint 3+) ──────────────────────────────
    travel_profile: dict | None

    # ── Agent memory (Sprint 2: collect; Sprint 3: use) ─────────────────────
    memory_profile: dict | None
    preference_corrections: list[dict]

    # ── Layer 2 — Trip inputs (per trip) ─────────────────────────────────────
    destination: str
    travel_dates: dict                  # {start: date, duration_nights: int}
    party_composition: str
    kid_ages: list[int]                 # extracted from party step
    budget_range: str                   # bracket label
    trip_style: str
    special_needs: str | None

    # ── Generation progress (fake-progress UI) ───────────────────────────────
    generation_active: bool             # True while plan is being generated
    fake_stage_index: int               # which step in the hardcoded progress array
    fake_stage_label: str               # current label shown to user
    fake_stage_extended: bool           # True after 60s on final stage — shows
                                        # "Taking a bit longer than usual..."

    # ── Planning HITL ────────────────────────────────────────────────────────
    pending_plan: dict | None
    refinement_request: str | None
    refinements_used: int               # tracked; NOT shown to user unless soft-warning
    refinement_warning_shown: bool      # True after refinement 4 → soft "regenerate?" hint
    awaiting_feedback: bool
    can_regenerate: bool
    interpreted_change: str | None      # persistent banner during refinement, not 2-3s flash

    # ── Booking phase (Sprint 2: mocked with DEMO watermark) ────────────────
    booking_candidates: list[dict] | None
    booking_confirmations: list[dict]
    booking_stage: str                  # "not_started" | "in_progress" | "complete"
    pending_booking_item: dict | None

    # ── Orientation ──────────────────────────────────────────────────────────
    current_stage: str                  # reads from backend stage_label directly
                                        # "Understanding your profile" |
                                        # "Researching destination" | "Review your plan" |
                                        # "Plan finalised" | "Booking" | etc.

    # ── Trust ────────────────────────────────────────────────────────────────
    # NOTE: known_limitations removed as static field — now contextual
    # disclaimers rendered inline at point-of-decision (see Section 6)
```

### Removed / Changed from Previous Schema

| Field | Change | Reason |
|---|---|---|
| `booking_disclaimer_acknowledged` | **Removed** | Replaced with inline per-item disclaimers — no upfront gate banner (Issue 14) |
| `visible_refinement_history` | **Removed** | Replaced with inline change annotations next to changed days/items (Issue 12) |
| `memory_acknowledged` | **Removed** | Memory used silently; user corrects only when wrong (Issue 11) |
| `known_limitations` | **Removed as field** | Contextual inline disclaimers replace static list (Issue 17) |
| `current_stage` | **Now reads `stage_label` from backend directly** | No frontend translation map (Issue 18 / 22) |
| `interpreted_change` | **Now persistent during refinement, not 2-3s flash** | Less fragile UX (Issue 13) |
| `refinements_used` | **No longer shown as "X of 5"** | Soft warning at refinement 4 instead (Issue 9) |
| `mode` | **Added** | Demo path vs authenticated path (Issue 1) |
| `generation_active`, `fake_stage_*` | **Added** | Fake-progress UI state (Issue 2) |
| `refinement_warning_shown` | **Added** | Soft warning replaces hard counter (Issue 9) |
| `kid_ages` | **Added** | Surfaced separately from `party_composition` for clearer UI |

---

## Section 2: Context Mapping (UserContext → AgentContext)

### User-Facing Components

```
DemoEntryPage   →  PlannerPage (single page)
                     ├── TripInputSection (chip-based stepper)
                     ├── PlanDisplaySection (itinerary + refine/regenerate)
                     └── BookingSection (appears post-approval, collapsible)

OnboardingPage  →  Auth + profile (Sprint 3 build, designed now)
                     ├── AuthScreen (WhatsApp primary)
                     ├── OTPVerify
                     └── ProfileForm
```

Booking is NOT part of LangGraph — handled by `/api/book` (mocked Sprint 2, real Sprint 3).

### Part 1 — Mode + Auth fields: FastAPI session only

| UserContext Field | TripSathiState | Notes |
|---|---|---|
| `mode` | — | React-only; gates demo vs authenticated paths |
| `user_id` | — | FastAPI session |
| `auth_method`, `phone_number`, `is_authenticated` | — | FastAPI middleware |
| `gmail_connected`, `whatsapp_connected` | — | Sprint 3+ profile service |

### Part 2 — Profile fields: user → agent (transformed)

| UserContext Field | TripSathiState Field | Relationship |
|---|---|---|
| `name` | `user_profile.name` | transformed via Call 1 |
| `age_range` | `user_profile.age_range` | transformed |
| `home_city` | `trip_parameters.from_city` | 1:1 copy |
| `travel_profile`, `memory_profile` | `user_profile` (enrichment) | Sprint 3+ |

### Part 3 — Trip inputs: user → agent

| UserContext Field | TripSathiState Field | Notes |
|---|---|---|
| `destination` | `destination` | 1:1 copy |
| `travel_dates` | `trip_parameters.start_date`, `.duration_nights` | split into trip_parameters |
| `party_composition` + `kid_ages` | `onboarding_answers` + `user_profile.constraints.kid_ages` | both flow through onboarding_answers; kid_ages explicit field for Call 1 |
| `budget_range` | `trip_parameters.budget_total` | 1:1 copy |
| `trip_style` | `onboarding_answers` + `user_profile.preferences` | shapes RAG queries |
| `special_needs` | `onboarding_answers` + `user_profile.constraints` | critical for Call 4 |

### Part 4 — Generation progress + Planning HITL

| UserContext Field | TripSathiState Field | Notes |
|---|---|---|
| `generation_active`, `fake_stage_*` | — | React-only; runs in parallel with blocking `graph.invoke()` |
| `current_stage` | `stage_label` | **1:1 copy from backend** — no React translation map. Backend writes human-readable strings directly |
| `pending_plan` | `plan` | 1:1 mapped; includes new fields `hotels[].content_source`, `hotels[].bookable`, `days[].activities[].bookable` |
| `refinement_request` | `user_feedback` | 1:1 copy |
| `refinements_used` | `refinement_count` | 1:1 (used for soft warning trigger, not display) |
| `awaiting_feedback` | `awaiting_feedback` | 1:1 copy |
| `can_regenerate` | derived (`awaiting_feedback == True`) | React-computed |
| `interpreted_change` | — | React-computed from `refinement_request` and last submission |

### Part 5 — Booking: plan → BookingService (separate from LangGraph)

| UserContext Field | Source | Notes |
|---|---|---|
| `booking_candidates` | derived from `plan.hotels[]` + `plan.days[].activities[]` | only items where `bookable: true` get a Book button; rest informational |
| `booking_confirmations` | BookingService `/api/book` response | includes `is_demo: true` flag → React renders DEMO watermark |
| `booking_stage`, `pending_booking_item` | React-tracked | local to BookingSection |

**Mock booking response (Sprint 2 — `/api/book`):**

```json
{
  "confirmation_id": "TRP-DEMO-A3F2B981",
  "status": "confirmed",
  "provider": "Booking.com (DEMO)",
  "item_name": "Pagoda Resort Alleppey",
  "amount_charged": 12500,
  "check_in": "2026-06-10",
  "check_out": "2026-06-12",
  "is_demo": true
}
```

Sprint 3: `is_demo` becomes False, `provider` becomes "Booking.com" — same response shape from Affiliate API.

---

## Section 3: UX Risk Mitigations (refined)

### LLM Risk Coverage Table

| Risk | Where It Occurs | User Oversight Mechanism |
|---|---|---|
| Hallucination | Call 3 (local risks), Call 4 (hotel names, budget) | HITL plan review; `content_source` tag drives "verify before booking" badge on `general` hotels; inline price disclaimer on each hotel card |
| Stochastic Behavior | All 4 LLM calls | "Regenerate" button — triggers `/api/regenerate` with variation prompt (substantively different plan, not a same-prompt re-roll) |
| Context Loss | MemorySaver in-process; LLM regression on earlier changes | Inline change annotations next to changed days/items show what changed in last refinement |
| Instruction Following Failures | Call 4 refinement — ambiguous change requests | Persistent banner during refinement: "Applying your change: [interpreted_change]" — visible until plan re-renders |
| Prompt Injection | `special_needs` and `refinement_request` → prompts | FastAPI Pydantic validation; injection-anchoring lines added to `PERSONA_CLASSIFICATION_SYSTEM`, `PLAN_GENERATION_SYSTEM`, `PLAN_REFINEMENT_SYSTEM` |
| Overconfidence | `plan.budget_breakdown`, `plan.hotels[]`, `booking_candidates` | Inline contextual disclaimers per item ("~₹12,500 — verify on Booking.com"); demo watermark on mock bookings |

### Regenerate vs Refine — disambiguation

| Action | When User Uses It | Backend Behaviour |
|---|---|---|
| **Refine** | "Change day 3 to a beach" | `/api/refine` with feedback text → Call 4 with REFINEMENT prompt + previous_plan + history |
| **Regenerate** | "I don't like this plan but can't say why" | `/api/regenerate` → Call 4 with REGENERATE prompt + previous_plan (anti-repetition) → produces substantively different plan; refinement count resets |

The Regenerate button reads as meaningful action — different routing, different hotels — not a same-prompt re-roll.

### Refinement counter — soft warning, not hard meter

- Refinements 1–3: no UI indicator at all
- Refinement 4: appears as small text next to chat input — *"Heads up: try regenerating for a fresh approach if you're not converging"*
- Refinement 5: same text, slightly more emphasis
- After 5: system auto-terminates, shows *"Here's your plan — you can still regenerate or book"*

User never sees "X of 5 remaining" as a paywall-style counter.

---

## Section 4: Agent Memory Construct (unchanged from prior)

3-layer memory: Working (LangGraph state) / Episodic (per-trip) / Semantic (distilled preferences).

**Sprint 2:** write episodes only, no read-back. Local JSON/SQLite via `MemoryService`.
**Sprint 3:** Mem0 / Zep + read into Call 1 + Call 4; Preferences UI panel.

Memory is used SILENTLY (Issue 11) — agent applies what it knows without "Here's what I know about you" prompt. User can correct preferences via a settings link (`/profile/preferences`), not a forced acknowledgement screen.

---

## Section 5: Context Ownership Rules

Ownership types: **USER-OWNED** / **AGENT-OWNED** / **CO-AUTHORED**.

### Critical Co-Authoring Rules (unchanged)

1. `pending_plan` — agent must never remove a user-approved element across refinement cycles
2. `memory_profile` — user corrections always override agent-inferred values
3. `budget_range` — agent never silently upgrades budget tier
4. `booking_confirmations` — every item requires explicit user tap; no auto-confirm
5. `travel_profile` / `memory_profile` — explicit per-trip inputs always win over enriched profile data

### Ownership Per Field (summary table)

| Ownership | Fields |
|---|---|
| USER-OWNED | mode, auth_method, phone_number, name, age_range, home_city, destination, travel_dates, party_composition, kid_ages, budget_range, trip_style, special_needs, refinement_request, preference_corrections |
| AGENT-OWNED | user_id, is_authenticated, generation_active, fake_stage_*, refinements_used, refinement_warning_shown, awaiting_feedback, can_regenerate, interpreted_change, booking_candidates, booking_stage, pending_booking_item, current_stage |
| CO-AUTHORED | gmail_connected, whatsapp_connected, travel_profile, memory_profile, pending_plan, booking_confirmations |

---

## Section 6: Inline Contextual Disclaimers

Replaces the previous "known_limitations static list" approach. Disclaimers appear at the
point of decision, not as a separate dismissible panel.

| Location | Disclaimer | When Shown |
|---|---|---|
| Hotel card (`content_source: "general"`) | *"General recommendation — verify on Booking.com or Google Maps before booking"* | Always for `general` hotels |
| Hotel card (`content_source: "rag"`) | No disclaimer — content was RAG-grounded | — |
| Hotel approx_cost | *"~₹12,500 per night — actual price may vary"* | Always |
| Budget breakdown total | *"Estimates only — book to see actual prices"* | Always |
| `plan.warnings[]` items | Rendered as amber warning banner above the relevant day | Always when warnings present |
| Mock booking confirmation | **DEMO** watermark across the card, *"This is a demo — no actual booking made"* | When `is_demo: true` |
| Demo mode active | Persistent thin banner at top: *"Demo mode — using sample Kerala trip"* | Throughout demo path |

---

## Section 7: Mobile Breakpoints

Tailwind breakpoints used:

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | < 768px (`base`) | Single column. Hotel cards stack. Booking section collapses by default. Chip-form steps full width. |
| Tablet | 768–1024px (`md`) | Single column with wider padding. Hotel cards still stacked but with image left + text right. |
| Desktop | ≥ 1024px (`lg`) | Two-column option: plan left, refinement chat docked right. Booking section can render as grid (3 hotels per row). |

**Mobile-first build order:** Build mobile layout first using Tailwind base classes; add `md:` and `lg:` overrides only where the desktop layout genuinely improves usability. Default behavior is mobile.

**Specific mobile constraints:**
- Plan generation progress: full-width centered card with stage label + progress dots
- Hotel cards: thumbnail-left, text-right on mobile; image-top on cards smaller than 320px
- Refinement chat input: fixed bottom on mobile (like WhatsApp); inline below plan on desktop
- Booking section: vertical stack on mobile; toggle to collapse/expand each subsection (Hotels / Flights / Activities)
- Demo mode banner: dismissible on mobile (takes vertical space); persistent on desktop

---

## Section 8: Empty States and Error States

### Empty States (defined for Claude Design)

| Empty State | Where | Design |
|---|---|---|
| PlannerPage — pre-submit | Before trip form submitted | Hero text: "Where would you like to go?" + chip stepper as primary CTA |
| Plan with no hotels | RAG returned 0 chunks for destination | Plan still renders; section shows: *"Limited hotel knowledge for this destination — we'll surface general suggestions; verify each independently"* + general suggestions |
| Booking section pre-approval | Plan not yet approved | Hidden; only appears after `status: "done"` |
| Booking section with 0 bookable items | All activities are non-bookable | Shows: *"Your plan has no items requiring booking — visit each destination directly"* + summary list of activities |
| Memory profile empty (new user) | First-time user | Silent — no panel shown, no prompt |
| Refinement history (Sprint 3 panel) | New conversation | Hidden until first refinement |

### Error States

| Error | UI Pattern | Recovery Action |
|---|---|---|
| Network failure on `/api/plan` | Full-page error card mid-PlannerPage: *"Couldn't reach the planner — check your connection"* | [Try Again] button retries with same inputs |
| LLM JSON parse error (Call 1/3/4) | Inline toast at top: *"Something glitched — let's try once more"* (auto-retry happens) | After 2 retries: full-page error with [Start Over] |
| LlamaIndex returns 0 chunks | NOT an error — plan renders with "limited knowledge" warning inline | None — graceful degradation |
| MemorySaver state lost (server restart) | Full-page error on /api/refine: *"Your session expired — please start a new plan"* | [Start New Plan] button → resets form |
| Booking API mock failure (`is_demo: true` but call fails) | Per-item toast: *"Couldn't process this demo booking — try again"* | [Retry] on the item card |
| Refinement misunderstood (user says so) | No automatic detection — user re-submits with clearer feedback | Manual — that's why interpreted_change banner exists |

Toast pattern: top-right, 4 second auto-dismiss, manual close icon.
Full-page error pattern: centered card with icon + message + primary action button.

---

## Section 9: Mock Data Shapes (must match real API contracts)

All mocks live in `frontend/src/mocks/`. Mock data shapes MUST exactly match the real
API response contracts defined in `specs/mvp_specs.md`. Schema drift = Sprint 3 rework.

### `mocks/auth.json` — used during signup flow demo

```json
{
  "user_id": "usr_demo_001",
  "auth_method": "whatsapp_otp",
  "phone_number": "+91XXXXX12345",
  "is_authenticated": true,
  "name": "Demo Traveller"
}
```

### `mocks/profile.json` — used post-onboarding

```json
{
  "user_profile": {
    "name": "Demo Traveller",
    "age_range": "35–50",
    "home_city": "Mumbai",
    "persona_type": "family_with_kids",
    "constraints": { "kid_ages": [5], "elderly": false, "mobility_limited": false }
  }
}
```

### `mocks/plan.json` — initial plan response (Kerala demo)

```json
{
  "plan": {
    "days": [
      {
        "day_number": 1,
        "location": "Munnar",
        "activities": [
          { "name": "Tea estate walk at Lockhart Tea Estate", "bookable": false, "approx_cost": null },
          { "name": "Eravikulam NP entry (optional — flagged for elderly)", "bookable": true, "approx_cost": 500 }
        ],
        "meals": { "breakfast": "Hotel", "lunch": "Saravana Bhavan", "dinner": "Hotel" },
        "notes": "Drive day — leave Kochi airport by 11 AM; expect 4-5 hr drive"
      }
    ],
    "hotels": [
      {
        "location": "Munnar",
        "name": "Windermere Estate",
        "reasoning": "Lift access + ground-floor rooms available; in-house restaurant; central location near tea estates",
        "approx_cost_per_night": 5500,
        "content_source": "rag",
        "bookable": true
      }
    ],
    "budget_breakdown": {
      "accommodation": 27500,
      "transport": 18000,
      "activities": 6500,
      "food": 12000,
      "total": 64000
    },
    "warnings": [
      "Houseboat booking: route through hotel operator, not direct cold-approach",
      "Eravikulam NP terrain not suitable for elderly with knee issues"
    ]
  },
  "thread_id": "thread_demo_001",
  "status": "awaiting_feedback",
  "stage_label": "Review your plan"
}
```

### `mocks/refine.json` — refinement response

```json
{
  "plan": { "...": "same shape as plan.json; one day's activities updated" },
  "thread_id": "thread_demo_001",
  "status": "awaiting_feedback",
  "stage_label": "Review your plan",
  "refinement_count": 2
}
```

### `mocks/booking.json` — booking response (matches `/api/book` real shape)

```json
{
  "confirmation_id": "TRP-DEMO-A3F2B981",
  "status": "confirmed",
  "provider": "Booking.com (DEMO)",
  "item_name": "Windermere Estate",
  "amount_charged": 11000,
  "check_in": "2026-06-10",
  "check_out": "2026-06-12",
  "is_demo": true
}
```

---

## Section 10: Interaction Flow (single-page model)

```
╔══════════════════════════════════════════════════════════════╗
║  ENTRY                                                       ║
╚══════════════════════════════════════════════════════════════╝

  USER                          AGENT / SYSTEM
  ────                          ──────────────

  Land on DemoEntryPage         →  Show hero: "Plan Indian trips in minutes"
                                   Two CTAs: [Try Demo] | [Sign In to Plan]

  ── PATH A: DEMO MODE ─────────────────────────────────────────
  Tap [Try Demo]                →  mode = "demo"
                                   Navigate to PlannerPage with Kerala scenario
                                     pre-filled in TripInputSection
                                   Persistent thin banner: "Demo mode — using
                                     sample Kerala trip"

  ── PATH B: AUTHENTICATED ─────────────────────────────────────
  Tap [Sign In to Plan]         →  Navigate to OnboardingPage
  Enter mobile number           →  Default action: [Send OTP on WhatsApp]
                                   Secondary text links below:
                                     [or use SMS] [or Continue with Google]
  Submit OTP                    →  Verify → set user_id, is_authenticated
  Fill profile chips:
    name | age_range | home_city → POST /api/onboard
                                   Write profile to MemoryService
                                   Navigate to PlannerPage


╔══════════════════════════════════════════════════════════════╗
║  PLANNERPAGE — TripInputSection                              ║
╚══════════════════════════════════════════════════════════════╝

  USER                          AGENT / SYSTEM
  ────                          ──────────────

  Step 1: destination chip      →  next step
  Step 2: dates + duration      →  next step
  Step 3: party + kid_ages      →  next step
  Step 4: budget bracket        →  next step
  Step 5: trip_style            →  next step
  Step 6: special_needs (opt)   →  [Generate Plan] button enabled

  Tap [Generate Plan]           →  POST /api/plan + thread_id generated
                                   generation_active = true
                                   START fake-progress UI:
                                     stage 1 (4s) → stage 2 (12s) → ...

  [User watches progress UI]    →  Real graph.invoke() running in parallel
                                   Calls 1 → 2 → 3 → 4

                                →  Real response arrives — jump to "done"
                                   plan rendered in PlanDisplaySection
                                   awaiting_feedback = true
                                   can_regenerate = true


╔══════════════════════════════════════════════════════════════╗
║  PLANNERPAGE — PlanDisplaySection                            ║
╚══════════════════════════════════════════════════════════════╝

  USER                          AGENT / SYSTEM
  ────                          ──────────────

                                →  Render day-by-day itinerary
                                   Hotel cards (per content_source):
                                     - rag-grounded: no disclaimer
                                     - general: amber "verify before booking"
                                   Inline price disclaimers
                                   Warning banners (from plan.warnings[])

                                   Controls below plan:
                                     [Suggest a change...] (text input)
                                     [Regenerate] (secondary button)
                                     [Approve & Book] (primary button)

  ── APPROVE PATH ──────────────────────────────────────────────
  Type "looks good" or
  Tap [Approve & Book]          →  POST /api/refine (approval signal)
                                   awaiting_feedback = false
                                   current_stage = "Plan finalised"
                                   Write episode to MemoryService
                                   BookingSection expands below plan

  ── REFINE PATH ───────────────────────────────────────────────
  Type "change day 3 hotel"
  Tap [Send]                    →  POST /api/refine {thread_id, user_feedback}
                                   Set interpreted_change = "Changing
                                     accommodation on day 3..."
                                   Persistent banner shown above plan

  [Banner stays visible]        →  Call 4 refinement runs
                                   plan updates with new day 3
                                   Show inline annotation on day 3:
                                     "↻ Updated: hotel changed in this refinement"
                                   refinement_count += 1
                                   Clear interpreted_change

  ── REGENERATE PATH ───────────────────────────────────────────
  Tap [Regenerate]              →  POST /api/regenerate {thread_id}
                                   Trigger fake-progress UI again
                                   Backend: Call 4 with REGENERATE prompt
                                   previous_plan kept for anti-repetition

                                →  New plan renders — notably different routing
                                   refinement_count reset to 0
                                   No persistent banner (this is full new plan,
                                     not a partial change)

  ── REFINEMENT WARNING ────────────────────────────────────────
                                →  At refinement_count == 4:
                                     Small text near chat input:
                                     "Heads up: try regenerating for a fresh
                                      approach if you're not converging"


╔══════════════════════════════════════════════════════════════╗
║  PLANNERPAGE — BookingSection                                ║
╚══════════════════════════════════════════════════════════════╝

  USER                          AGENT / SYSTEM
  ────                          ──────────────

                                →  Extract bookable items only from plan:
                                     plan.hotels[] (all)
                                     plan.days[].activities[] where bookable=true
                                   Non-bookable activities listed as "Plan to visit"
                                     in a separate informational subsection

                                   Section header: "Ready to book? (DEMO mode)"
                                   Each item card: name, location, ~price,
                                     [Book Demo] button + inline disclaimer

  Tap [Book Demo] on hotel      →  POST /api/book {user_id, item}
                                   Sprint 2: hardcoded mock response
                                   Sprint 3: Booking.com Affiliate API

                                →  Response includes is_demo: true
                                   Card flips: "Booked ✓ | TRP-DEMO-A3F2B981"
                                   DEMO watermark across card
                                   Write booking to MemoryService

  Tap [Skip] on item            →  Item marked skipped, removed from candidates

  ── ALL ITEMS RESOLVED ────────────────────────────────────────
                                →  booking_stage = "complete"
                                   Show summary: "Demo booking complete ✓"
                                   Total demo spend
                                   Persistent reminder: "No real bookings made
                                     — Sprint 3 connects real APIs"
```

---

## Section 11: Updated Project Structure

```
tripsathi/
├── backend/
│   ├── main.py                    # FastAPI — endpoints:
│   │                                  /api/onboard, /api/plan, /api/refine,
│   │                                  /api/regenerate, /api/book,
│   │                                  /api/memory/episode (Sprint 2 write-only)
│   ├── graph.py
│   ├── nodes.py                   # 3 nodes; plan_assembly has 3 branches
│   │                                  (regenerate / refine / initial)
│   ├── state.py                   # TripSathiState with stage_label, regenerate_requested,
│   │                                  previous_plan additions
│   ├── prompts.py                 # 5 system prompts including PLAN_REGENERATE_SYSTEM
│   │                                  All prompts include INSTRUCTION ANCHORING block
│   ├── memory/
│   │   └── service.py             # MemoryService — local JSON/SQLite writes Sprint 2
│   ├── rag/
│   │   ├── indexer.py
│   │   └── knowledge/
│   │       ├── kerala.md          # MUST include houseboat operator trust content
│   │       ├── puri.md
│   │       └── guwahati.md
│   ├── data/
│   │   └── memory/                # local episode store (Sprint 2)
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── services/
│       │   └── api.ts             # VITE_USE_MOCK flag controls mock vs real
│       ├── mocks/
│       │   ├── auth.json
│       │   ├── profile.json
│       │   ├── plan.json
│       │   ├── refine.json
│       │   └── booking.json
│       ├── pages/
│       │   ├── DemoEntryPage.tsx          ← NEW: hero + Try Demo / Sign In
│       │   ├── OnboardingPage.tsx         ← Sprint 3 build; designed for now
│       │   └── PlannerPage.tsx            ← single page (3 sections)
│       ├── components/
│       │   ├── auth/
│       │   │   ├── AuthScreen.tsx          ← WhatsApp primary, others secondary
│       │   │   ├── OTPVerify.tsx
│       │   │   └── ProfileForm.tsx
│       │   ├── planner/
│       │   │   ├── TripInputStepper.tsx   ← 6-step chip flow
│       │   │   ├── GenerationProgress.tsx ← fake-progress UI
│       │   │   ├── PlanDisplay.tsx        ← itinerary + inline disclaimers
│       │   │   ├── HotelCard.tsx          ← content_source + bookable aware
│       │   │   ├── DayCard.tsx            ← activities with bookable flags
│       │   │   ├── InterpretedChangeBanner.tsx
│       │   │   ├── RefinementInput.tsx
│       │   │   └── RegenerateButton.tsx
│       │   └── booking/
│       │       ├── BookingSection.tsx      ← collapsible
│       │       ├── BookableItemCard.tsx    ← demo watermark when is_demo
│       │       ├── NonBookableList.tsx     ← "Plan to visit"
│       │       └── BookingSummary.tsx
│       └── lib/
│           ├── fakeProgress.ts             ← setTimeout-driven stages
│           └── disclaimers.tsx             ← inline disclaimer renderers
└── data/
    └── evaluations_data.csv
```

---

## Section 12: Sprint 2 Build Priority (if time runs short)

If timeline pressure hits, build in this order — each layer is independently demoable:

| Priority | Slice | Hours | Deferrable? |
|---|---|---|---|
| P0 | Backend graph + 4 LLM calls + RAG | 17h | No — core |
| P0 | Mock API service layer + mock JSON | 1h | No — required for parallel UI work |
| P1 | DemoEntryPage + PlannerPage TripInput + PlanDisplay (mobile-first) | 8h | No — primary demo surface |
| P1 | Fake-progress UI + interpreted_change banner | 2h | No — perceived performance critical |
| P2 | Regenerate button + variation prompt | 1h | Yes — can ship without; refine alone is enough |
| P2 | BookingSection + mock /api/book | 4h | **Yes — defer to last week** if backend is late |
| P3 | OnboardingPage (auth flow) | 4h | Yes — defer to Sprint 3 entirely |
| P3 | MemoryService writes | 2h | Yes — defer; episodic data not used Sprint 2 anyway |
| P3 | Mobile breakpoint polish (lg desktop layouts) | 2h | Yes — mobile works alone for demo |

**Minimum demoable Sprint 2:** DemoEntry → PlannerPage (TripInput + PlanDisplay) with refinement loop. Booking and Auth can both slip to Sprint 3 entry if needed. Use the saved time on RAG corpus quality and houseboat trust gap fix.

---

## Section 13: What This Spec Hands Off to Claude Design

When you paste this into Claude Design, prioritise generating mockups for these screens:

1. **DemoEntryPage** — hero with two CTAs; mobile-first
2. **PlannerPage — TripInputStepper** — 6 steps, chip-based; mobile-first
3. **PlannerPage — GenerationProgress** — fake-progress stages with stage label, dots, optional "taking longer" extension
4. **PlannerPage — PlanDisplay** — day cards + hotel cards with `content_source` differentiation, inline price disclaimers, warning banners
5. **PlannerPage — InterpretedChangeBanner** — persistent during refinement, dismisses on plan update
6. **PlannerPage — BookingSection** — bookable item cards with DEMO watermark, non-bookable "Plan to visit" list, summary state
7. **OnboardingPage (Sprint 3 build)** — auth screen with WhatsApp primary; OTP verify; profile form chips
8. **Error states** — network failure full-page, session expired, refinement misunderstood (no auto-detection, just give the user the input back)
9. **Empty states** — pre-submit hero, zero bookable items list

Mobile-first for every screen. Desktop variants only where layout differs meaningfully.
