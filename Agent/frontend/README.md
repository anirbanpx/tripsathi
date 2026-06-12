# Frontend — React + Vite UI

React 19 + TypeScript + Vite chat interface for TripSathi.

---

## Setup

```bash
npm install
npm run dev
```

UI available at `http://localhost:5173`. Proxies `/api/*` requests to the backend at `http://localhost:8000` in dev mode (configured in `vite.config.ts`).

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL for production builds |

In production this is set to the Railway backend URL. There is also a hardcoded fallback in `src/services/api.ts` — update that line if the Railway URL changes.

For local dev, no env var is needed — Vite's proxy handles API routing.

---

## Project Structure

```
src/
├── components/
│   ├── planner/     # Core planning UI (TripInputStepper, PlanDisplay, GenerationProgress, BookingScreen, ...)
│   ├── auth/        # AuthNav, GoogleSignInButton
│   ├── booking/     # BookableItemCard, BookingSection
│   ├── explore/     # IndiaDestinationsMap (Leaflet)
│   └── shared/      # PageTransition
├── pages/
│   ├── OnboardingPage.tsx   # Persona wizard + interests
│   ├── PlannerPage.tsx      # Main chat + plan view
│   ├── ProfilePage.tsx      # Saved trips + wishlist
│   └── DemoEntryPage.tsx    # Entry page / homepage
├── lib/             # Auth helpers, image resolvers, destination data, utilities
├── services/        # api.ts — all backend calls
├── styles/          # Design tokens (tokens.css) + design system (ds.css)
├── types/           # Shared TypeScript types (index.ts)
└── mocks/           # Static JSON fixtures for offline dev
```

---

## Testing

```bash
# End-to-end tests (requires running backend + frontend)
npx playwright test frontend/e2e/

# Sanity + component tests
npx playwright test frontend/tests/
```

Playwright config is at `playwright.config.ts`.

---

## Build + Deploy (Vercel)

Standard `npm run build` won't pick up `VITE_*` env vars reliably via Vercel CLI. Use the pre-built deploy flow:

```bash
vercel pull --yes --environment production --scope tripsathi --token $VERCEL_TOKEN
vercel build --prod --yes --token $VERCEL_TOKEN --scope tripsathi
vercel deploy --prebuilt --prod --token $VERCEL_TOKEN --scope tripsathi
```

The `/dev-start` Claude Code skill handles local startup automatically.
