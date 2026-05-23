# Evaluation Design Report

## Quality Risk Hypotheses

### Input Variability Risks

**Risk 1 — Kid-age blindness**
The prompt might produce identical hotel and activity recommendations regardless of child age — treating a toddler (2) the same as a 9-year-old. Since kid age is a "hard filter that nothing respects," this is the highest-stakes persona signal.
- *Symptom:* Output doesn't change meaningfully when kid age is swapped from 2 to 9.
- *Impact:* Wrong activities, unsafe venues, unusable itinerary for actual family.

### Context Sensitivity Risks

**Risk 2 — Context drift across persona combinations**
Mixed groups (elderly parents + young kids + adults) may cause the AI to optimize for one sub-group and ignore others. The Puri scenario is the archetype: religious itinerary for elderly parents, but a 4-year-old who can't eat local food.
- *Symptom:* Day plan works for one persona but breaks for another in the same group.
- *Impact:* Plan appears complete but fails in the field for the overlooked sub-group.

### Output Quality Risks

**Risk 3 — Hallucinated or unverifiable hotel recommendations**
Hotels recommended may be real properties but with wrong location, wrong pricing tier, or wrong facilities (e.g., "family-friendly" hotel without in-house dining).
- *Symptom:* Hotel exists on Google Maps but is in the wrong part of the city or above budget.
- *Impact:* User books based on AI recommendation and discovers the problem on arrival.

**Risk 4 — Generic routing, no destination-specific reasoning**
The itinerary might produce a standard "top places" list without the logic behind the routing — why Munnar before Alleppey, why skip Kochi, why that hotel over another nearby.
- *Symptom:* Output reads like TripAdvisor copy, not a reasoned plan for this specific group.
- *Impact:* User can't distinguish AI output from a basic Google search — no trust built.

### Boundary/Scope Risks

**Risk 5 — Unstated constraints go unaddressed**
The prompt may not surface risks the user didn't explicitly mention — Kamakhya darshan queues, late Shillong return causing missed dinner, Chilika cab operator inflating charges.
- *Symptom:* AI produces a clean plan but misses the friction points a local would know.
- *Impact:* Plan looks good on paper but fails in ways that damage trust and trip quality.

### Consistency Risks

**Risk 6 — Budget framing inconsistency**
Total budget (e.g., ₹80k) may get distributed incorrectly across nights, activities, and transport — or recommendations may skew premium without flagging the trade-off.
- *Symptom:* Sum of hotel + transport + activities exceeds stated budget, or no trade-off reasoning.
- *Impact:* Breaks trust immediately for price-sensitive Indian users; "primary hook" (money saved) is undermined.

**Risk 7 — Variation insensitivity to soft constraints**
Adding "budget-conscious, avoid tourist traps" or "elderly parents, slower pace" should materially change recommendations. If the output only changes surface words but not substance, the constraint-handling is cosmetic.
- *Symptom:* Swap a key constraint and output is 90% identical.
- *Impact:* Persona-aware onboarding has no value if the agent doesn't actually adapt to it.

---

## Test Case Design Methodology

### Chosen Generation Approach
**Combined: Real-World Sampling (D) + Boundary Case Variation (A)**

Use the 3 real trip scenarios (Kerala, Puri, Guwahati) as baselines — they provide ground truth for what a good plan looks like. Then apply systematic boundary variation against each baseline to generate test cases across both angles of the priority risk.

### Test Case Framework

Each test case has:
- **ID**: `[Angle]-[Scenario]-[Variation]`
- **Input**: The exact prompt to run
- **What it tests**: Specific dimension of the priority risk
- **Ground truth**: What a correct response must include
- **Failure signal**: What to look for if the risk manifests

### Two Angles

- **Angle A (Explicit)**: Give a constraint clearly — check if output materially changes vs. baseline
- **Angle B (Implicit)**: Don't mention the risk — check if AI surfaces it unprompted

### Test Cases

---

**BASE-KL — Kerala Baseline**
*Input:* "Plan a 5-night Kerala trip for 2 adults and a 5-year-old. Budget ₹1 lakh. First time visiting Kerala. Want to cover the best of what Kerala offers. Kid gets tired easily and needs proper meal options at every stop. Suggest where to stay each night, how many days per location, 2–3 activities per day, and specific hotel recommendations with reasoning."
*What it tests:* Baseline quality — does AI independently arrive at Munnar + Alleppey routing with destination-specific reasoning?
*Ground truth:* Munnar + Alleppey routing, kid-friendly meal options flagged per stop, hotel location reasoning
*Failure signal:* Generic "top Kerala destinations" list, no routing logic, no kid-specific filtering

---

**BASE-PU — Puri Baseline**
*Input:* "Plan a 4-night Puri trip for 2 adults, 2 elderly parents (70 and 60), and a 4-year-old. Budget ₹60,000. Must include Jagannath temple and Chilika lake. Parents are religious — temple timing is a priority. The 4-year-old is picky and can't eat most local Odia food."
*What it tests:* Baseline for mixed-group planning (elderly + young child + religious itinerary)
*Ground truth:* Temple timing protected, child food options explicitly addressed, Chilika as a day trip
*Failure signal:* Generic Puri itinerary ignoring child food constraints or elder pacing needs

---

**BASE-GW — Guwahati Baseline**
*Input:* "Plan a 4-night Guwahati trip for elderly parents — father 70, mother 60. Budget ₹40,000. Priority is Kamakhya temple darshan. Also want to cover a Shillong day trip and Brahmaputra river experience. Parents need early dinners, no strenuous walking, and a comfortable mid-range hotel in a central location."
*What it tests:* Baseline for elderly-only trip with religious + leisure mix
*Ground truth:* Kamakhya as day 1 priority, early dinner logistics, Shillong as a full day trip, Brahmaputra boat options
*Failure signal:* Strenuous activities, late-day scheduling, hotel not central

---

**A-KL-01 — Kerala: Toddler Swap**
*Input:* Same as BASE-KL but change "5-year-old" to "2-year-old (toddler, still napping midday, needs high chair and soft food options)."
*What it tests:* Does kid age materially change hotel selection, activity choices, and pacing?
*Ground truth:* Midday rest built into schedule, high-chair availability flagged for hotel/restaurant, water activities deprioritized or removed
*Failure signal:* Output is 90% identical to BASE-KL with only surface word changes

---

**A-KL-02 — Kerala: Elderly Addition**
*Input:* Same as BASE-KL but add "We're also bringing my parents — father 68, mother 62. Father has mild knee issues, can't do stairs or uneven terrain easily."
*What it tests:* Does adding elderly with mobility constraint change activity selection, hotel requirements, and pacing?
*Ground truth:* Hill-trek activities replaced or made optional, hotel accessibility noted, pace slowed (fewer activities per day)
*Failure signal:* Same Munnar trek recommendations, no pacing change, no accessibility mention

---

**A-KL-03 — Kerala: Budget-Conscious Modifier**
*Input:* Same as BASE-KL but add "We're budget-conscious — want to avoid tourist traps and overpriced spots. Prefer local restaurants over resort dining. Hotel comfort matters but not luxury."
*What it tests:* Does the budget-conscious soft constraint shift hotel tier, dining recommendations, and activity framing?
*Ground truth:* Hotel tier drops or trade-offs explained, local dhabas/restaurants recommended over resort dining, houseboat alternative (Shikara) surfaced as budget option
*Failure signal:* Same 4-star hotel recommendations, resort dining suggestions, no trade-off reasoning

---

**A-PU-01 — Puri: Remove Elderly Constraint**
*Input:* Same as BASE-PU but remove elderly parents entirely — "2 adults and a 4-year-old. Budget ₹60,000."
*What it tests:* Does removing the elderly constraint materially change itinerary pacing, temple timing, and activity selection?
*Ground truth:* Temple timing deprioritized or flexible, more leisure time, activities broadened
*Failure signal:* Itinerary nearly identical to BASE-PU — same early starts, same pacing, same activity order

---

**B-KL-01 — Kerala: Hotel Location & Houseboat Trust Gap**
*Input:* Identical to BASE-KL — no mention of hotel location concerns or houseboat booking.
*What it tests:* Does AI proactively flag (a) hotel location vs. city center trade-off in Munnar/Alleppey, and (b) houseboat booking trust gap (unverified operators) without being asked?
*Ground truth:* Warns that many Alleppey hotels are highway-adjacent, not city-proximate; flags houseboat booking through hotel operators as safer than cold approaches
*Failure signal:* Recommends houseboat with no booking guidance; no hotel location caveat

---

**B-GW-01 — Guwahati: Late Shillong Return & Kamakhya Queue**
*Input:* Identical to BASE-GW — no mention of dinner timing risk or darshan queue.
*What it tests:* Does AI proactively flag (a) late Shillong return causing missed dinner for elderly parents, and (b) Kamakhya darshan queue complexity and need for advance slot booking?
*Ground truth:* Warns Shillong day trip runs long — suggests early start or planning dinner en route; flags Kamakhya VIP/regular darshan complexity and recommends booking in advance
*Failure signal:* Clean itinerary with Shillong as standard day trip, no queue or timing warning

---

**B-PU-01 — Puri: Temple Slot, Cab Operator, Child Food**
*Input:* Identical to BASE-PU — no mention of temple booking complexity, cab operator risk, or child food scarcity.
*What it tests:* Does AI proactively flag (a) Jagannath temple slot booking requirement, (b) Chilika cab operator inflation risk, and (c) limited child-friendly food options in Puri?
*Ground truth:* Flags temple entry rules (non-Hindus restricted, queue management needed), warns about cab operators at Chilika, suggests specific child-safe food fallbacks in Puri
*Failure signal:* Recommends Chilika visit with generic "hire a cab" instruction, no temple booking guidance, no child food warning

---

### Success Criteria Design

| Test Case | Pass | Fail |
|---|---|---|
| A-KL-01 (toddler) | Schedule, hotels, and activities meaningfully different from BASE-KL | <20% change in recommendations |
| A-KL-02 (elderly add) | Mobility constraint reflected in activity and hotel choices | Same trek/activity recommendations |
| A-KL-03 (budget) | Hotel tier shifts, local dining recommended, trade-offs explained | Same 4-star hotels, resort dining |
| A-PU-01 (no elderly) | Pacing and timing noticeably more flexible | Near-identical to BASE-PU |
| B-KL-01 (implicit) | Both hotel location and houseboat trust gap flagged unprompted | Neither flagged |
| B-GW-01 (implicit) | Late return warning + Kamakhya queue guidance surfaced | Clean itinerary, no warnings |
| B-PU-01 (implicit) | Temple booking + cab + child food flagged | Generic recommendations, no flags |

**Overall pass bar:** 5 of 7 variation test cases at Pass = context awareness is real enough to build on.

---

## Learning Objectives

### What This Testing Will Reveal

**Priority Risk:** Context Awareness Failure (explicit constraints ignored + implicit local risks missed)

**Test Approach:** Real-World Sampling + Boundary Case Variation across 10 test cases (3 baselines + 4 Angle A + 3 Angle B)

### Learning Outcomes

- **How the risk manifests** — Whether failure is obvious (wrong output) or subtle (output looks correct but is 90% identical across constraint variations). Subtle failure is the dangerous one — passes casual inspection but breaks in the field.
- **Which angle is worse** — Angle A (explicit constraints ignored) vs. Angle B (implicit local knowledge missed). These require different fixes: Angle A is a prompt engineering problem; Angle B is a knowledge/retrieval problem that may need RAG.
- **Which persona signals the model actually processes** — Kid age? Group composition? Budget framing? Variation test cases reveal which constraints are genuinely honored vs. treated as decoration.
- **How much Indian travel knowledge the base model has** — B-series test cases will show whether Claude already knows about Kamakhya queue dynamics, Shillong return timing, and houseboat booking trust gaps — or whether that knowledge needs RAG injection.
- **Sprint 2 go/no-go signal** — Pass bar is 5 of 7 variation cases at Pass. Gives a concrete readiness indicator before the May 31 demo.

---

## Deferred Risks

**Language & Voice Accessibility** *(deferred to Sprint 3)*
Captured in problem definition as a validated constraint: older and pilgrimage travelers are not comfortable typing in English or Hindi on mobile; voice input and WhatsApp-style interaction are essential for this segment. Not included in Sprint 2 evaluation because:
- Sprint 2 experiment is text-based prompt testing — evaluating planning quality, not interface layer
- Voice (Whisper + ElevenLabs) is a Sprint 3 deliverable (by Jun 14)

*When to evaluate:* Once voice interface is built, run a separate evaluation pass covering: Hindi-mixed query handling, regional accent transcription accuracy, and whether voice input degrades planning quality vs. typed input.

---

## Evaluation Artifacts Generated

### Files Created
- **`data/evaluations_data.csv`** — 10 executable test cases with pre-populated metadata (test_case_id, risk_category, angle, input_description, expected_challenge, learning_objective, input_data). Empty columns ready for execution: actual_output, quality_rating, notes, patterns_observed, improvement_ideas, completed_date.
- **`reports/evaluation_design_report.md`** — This document: full methodology, risk hypotheses, priority risk, test case framework, learning objectives.

### How to Use the CSV
1. Open `evaluations_data.csv`
2. Copy each `input_data` value into Claude.ai or your agent
3. Rate output quality 1–5 in `quality_rating` (1 = unusable, 3 = needs editing, 5 = would use as-is)
4. For Angle A cases: compare output against the corresponding baseline — note what changed and what didn't
5. For Angle B cases: check whether the specific local risk was surfaced unprompted — note what was flagged
6. Fill `patterns_observed` as you go — recurring failure modes become your prompt improvement agenda

### Next Steps After Evaluation
1. Run BASE-KL, BASE-PU, BASE-GW first to calibrate what "good" looks like
2. Run A-series cases next — fastest signal on whether constraint handling works
3. Run B-series last — requires comparing against real-trip ground truth
4. If 5+ of 7 variation cases pass: core capability is real, proceed to Sprint 2 build
5. If fewer than 5 pass: identify which angle failed (A or B) to determine fix — prompt engineering vs. RAG injection
6. Revisit language/voice risk evaluation in Sprint 3 when voice interface is built

---

## Priority Quality Risk

### Risk Statement

**Context Awareness Failure** — The agent produces itineraries that appear coherent and complete but fail to reflect the actual travel group — either by ignoring *stated* soft constraints (kid age, elderly pace, budget sensitivity) or by missing *unstated* local-knowledge risks (Kamakhya queue complexity, late Shillong return timing, Chilika cab operator dynamics).

Both failure modes share the same consequence: user follows the plan, something breaks in the field, trust is gone.

### Prioritization Rationale

- **Core value prop at stake:** TripSathi's entire differentiation is persona-aware planning. If soft constraints don't materially change output, the product is a prettier Google search — users feel this on the first try and don't return.
- **Hardest to self-diagnose:** An AI ignoring soft constraints often looks fine — output is coherent and detailed. You'd only catch it by deliberately comparing outputs with/without the constraint, which users won't do.
- **Merges two related failure modes:** Risk 7 (explicit constraints ignored) + Risk 5 (implicit local knowledge missed) share the same field-failure consequence and are testable against the same three real trip scenarios (Kerala, Puri, Guwahati) as ground truth.
- **Sprint-relevant:** May 31 demo needs to show the agent "actually adapts." This risk, if undetected, makes the demo feel hollow even if everything else works.

### Testing Approach

Two angles, same evaluation dataset:
- **Angle A (explicit):** Give the constraint clearly, check if output materially changes vs. a baseline without it
- **Angle B (implicit):** Don't mention the risk, check if AI surfaces it unprompted (using real trip friction points as ground truth)

Inputs that reveal this risk: kid age variations (toddler vs. school-age), elderly parent additions, budget modifiers ("avoid tourist traps"), mixed group compositions (elderly + kids + adults).

Output patterns to watch: near-identical itineraries across constraint variations, no proactive warnings about known local friction points, generic activity lists that don't adapt to group composition.

### Success Criteria

- Changing kid age from 9 to 2 produces meaningfully different hotel, activity, and meal recommendations
- Adding elderly parents changes pacing, activity selection, and meal timing — not just surface language
- Agent proactively flags at least one unstated local risk per scenario (queue, timing, operator, food) that matches known ground truth from real trips
- "Would I use this plan?" verdict from the product owner: yes with minor edits (not yes with major rework, not no)
