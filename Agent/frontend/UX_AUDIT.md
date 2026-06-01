# UX Audit — TripSathi
**Date:** 2026-06-02  
**Viewport:** 390×844 (iPhone mobile-first)  
**Method:** Playwright screenshots across 12 screens

---

## Fixed tonight (critical + major)

| # | Screen | Issue | Fix applied |
|---|---|---|---|
| 1 | Stepper Step 2 | Kid age row hidden behind sticky bottom bar | Spacer 90 → 180px + scroll-to-top on step change |
| 2 | Stepper Step 5 | Special needs textarea invisible behind sticky bar | Scroll-to-bottom on step 5 so textarea clears the bar |
| 3 | Progress screen | Stepper bottom bar (z-100) bleeding over progress overlay (z-50) | GenerationProgress overlay z-index → 110 |
| 4 | Progress screen | "sketch my plan" button tappable during generation → double API fire | Guard: `if (ctx.generation_active) return` in both generate handlers |
| 5 | Plan bottom | "looks good — book it" button used moss green instead of rust CTA color | `.approve-btn` → `var(--accent)` + `var(--rust-deep)` |
| 6 | Plan list / map panel | Raw LLM notes in activity names ("check kerala advisability", dangling parens) | `cleanName()` utility strips `") — check..."` / `" — verify..."` patterns at render |

---

## Remaining — Minor (polish pass)

| # | Screen | Issue | Suggested fix |
|---|---|---|---|
| M1 | Progress screen | Mini-map marker (✦) uses `#B45309` amber — doesn't match design tokens | Use `RUST` constant (`#B0492F`) consistent with MapView markers |
| M2 | Stepper Step 5 | Five recap rows are card-height (~50px each = 250px) — crushes viewport on short phones | Compact recap into a single horizontal pill row when > 3 completed steps |
| M3 | Warning carousel | Warning text truncates mid-sentence with no "read more" | Line-clamp 3 rows + expand on tap |
| M4 | Booking screen | Hotels and activities use identical card style — no visual hierarchy | Hotels: keep photo card. Activities: switch to lighter row format (icon + name + cost, no photo) |
| M5 | Booking screen | "PLAN TO VISIT" non-bookable section indistinguishable from bookable section | Add a visual divider / muted background section or collapse behind a toggle |
| M6 | Plan map mobile | Stop-list text in "full journey" right panel is ~10px — unreadable in stacked layout | Bump to 12px min in stacked (< 640px) media query |
| M7 | Entry page | Page fits in one viewport — India map and polaroid compete; no meaningful scroll | Separate map below the fold with a scroll cue arrow |

---

## What's working well (preserve these)

- Caprasimo / Nunito / Caveat font hierarchy — consistent across all 12 screens
- Destination image band in stepper — beautiful, strong sense of place from step 2 onward
- Stepper progress bar + recap items — great spatial awareness, easy back-editing
- Generation progress screen — polished checklist + DID YOU KNOW fact card + reassurance copy
- Per-day colored route markers on map — rust → ochre → moss cycling working correctly
- Hotel cards — photo / script name / reasoning / price stamp hierarchy is strong
- Demo banner consistently present without being intrusive
- Budget breakdown bar — honest summary that earns trust before booking

---

## Files changed in this session (2026-06-02)

```
frontend/src/components/planner/TripInputStepper.tsx   — journal textarea, scroll fixes, double-fire guard
frontend/src/components/planner/MapView.tsx            — per-day colored segments, cinematic flyTo, pulse marker
frontend/src/components/planner/PlanDisplay.tsx        — split map panel, cleanName(), approve-btn class
frontend/src/components/planner/GenerationProgress.tsx — map zoom 9 → 7
frontend/src/pages/PlannerPage.tsx                     — progress overlay z-index 50 → 110
frontend/src/lib/destinationCoordinates.ts             — 80+ aliases, fuzzy candidate matching
frontend/src/styles/ds.css                             — journal-page, map-split, approve-btn color
frontend/tests/sanity.spec.ts                          — button text updated (guide me through it)
frontend/tests/e2e.spec.ts                             — button text updated (guide me through it)
```

---

## Test status

- `sanity.spec.ts`: **17/17 passed**
- `e2e.spec.ts` tests 1–4: **passed** | test 5 (full LLM gen): **backend latency** — plan loads but after 120s timeout; not a code bug
