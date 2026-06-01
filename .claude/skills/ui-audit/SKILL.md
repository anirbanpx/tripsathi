---
description: Full UI audit of the TripSathi frontend using Playwright screenshots. Captures every screen, then reports pixel/alignment issues, color problems, information architecture gaps, and image placement. Use when asked to audit, review, or QA the UI.
---

# UI Audit Skill

You are performing a structured UX/UI audit of the TripSathi frontend.

## Step 1 — Verify servers are up

Check both servers before capturing anything:

```
GET http://localhost:5173  → frontend (Vite)
GET http://localhost:8000/health  → backend (FastAPI)
```

If the frontend is down, start it: `Set-Location frontend; npm run dev` (background).
If the backend is down, start it: `Set-Location backend; .\venv\Scripts\python.exe -m uvicorn main:app --port 8000` (background). Wait 5s and re-check.

## Step 2 — Capture all screens via Playwright

Write a temporary `audit.mjs` in `frontend/` and run it with `node audit.mjs`. Capture these screens in order — use `fullPage: true` for all:

| File | Screen | How to reach it |
|---|---|---|
| `audit-01-entry.png` | Entry page (above fold) | `goto('/')`, waitForTimeout 2000 |
| `audit-02-entry-scroll.png` | Entry page (full scroll) | scroll to bottom |
| `audit-03-stepper-step2.png` | Stepper step 2 (who) | click "Try the demo" |
| `audit-04-stepper-step3.png` | Stepper step 3 (budget) | click "next" |
| `audit-05-stepper-step4.png` | Stepper step 4 (style) | click "next" |
| `audit-06-stepper-step5.png` | Stepper step 5 (needs) | click "next" |
| `audit-07-progress.png` | Generation progress | intercept `/api/plan` with 5s delay + mock plan, click "sketch my plan", waitForTimeout 1500 |
| `audit-08-plan-swipe.png` | Plan display — swipe view | waitForSelector "plan, sketched" |
| `audit-09-plan-list.png` | Plan display — list view | click `button[title='List view']` |
| `audit-10-plan-map.png` | Plan display — map view | click `button[title='Map view']`, waitForTimeout 2000 |
| `audit-11-plan-bottom.png` | Plan display — budget/refinement | scroll to bottom |
| `audit-12-booking.png` | Booking screen | scroll to bottom, click "looks good" |

Mock plan path for route intercept: `src/mocks/plan.json`

Viewport: `{ width: 390, height: 844 }` (iPhone-sized — this is a mobile-first app).

Delete `audit.mjs` and all `audit-*.png` files after the audit is complete.

## Step 3 — Audit each screenshot systematically

For each screen read the screenshot and check these dimensions:

### Pixel & Alignment
- Are elements horizontally centered or left-aligned consistently?
- Do cards/containers have consistent padding (target: 16–20px horizontal)?
- Are there orphaned elements with asymmetric margins?
- Does the sticky bottom bar clip or overlap any content?
- Are images cropped correctly — no accidental overflow, no aspect ratio distortion?

### Color & Contrast
- Does text meet readable contrast against its background?
- Are interactive elements (buttons, chips) visually distinct from static content?
- Are color accents (rust, ochre, moss) used consistently or randomly?
- Are badges/tags using the same color system across screens?

### Typography
- Is the display font (Caprasimo) used only for headlines — not labels or body?
- Is the body font (Nunito) weight consistent (600 for body, 700–800 for labels)?
- Are font sizes consistent between equivalent elements across screens?

### Image Placement
- Are destination images proportioned correctly (not squashed or over-cropped)?
- Is there a visible fallback when an image is missing?
- Do images have appropriate overlay contrast when text is placed on them?

### Information Architecture
- Is the most important action always the most visually prominent?
- Does the user always know where they are in the flow (progress indicators)?
- Are there dead-end states with no clear next action?
- Is secondary information (disclaimers, trust signals) accessible but not distracting?

### Consistency
- Does the topbar treatment stay consistent across screens?
- Are loading/empty states handled gracefully?
- Are card styles (border-radius, shadow, padding) consistent?

## Step 4 — Report

Structure the report as:

```
## UI Audit — TripSathi

### Critical (breaks experience)
- [screen] Issue description — specific element, what's wrong, impact

### Major (degrades quality)
- [screen] Issue description

### Minor (polish)
- [screen] Issue description

### What's working well
- Callouts for things that look polished and should be preserved
```

Be specific: name the element, the screen, and what you observed in the screenshot. Don't speculate — only report what you can see.

After the report, ask the user: "Want me to propose fix options, or go ahead and fix the critical and major issues directly?"
