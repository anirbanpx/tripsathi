/**
 * Happy-path end-to-end tests for TripSathi.
 *
 * Three use cases:
 *   UC1 — Landing page renders correctly (no API calls)
 *   UC2 — Demo stepper: navigate all 6 steps with inputs, reach plan generation
 *   UC3 — Natural-language flow: type a trip description, mock backend, verify plan display
 *
 * Assumes the dev server is already running on http://localhost:5173
 * and the backend on http://localhost:8000.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const goaPlan = JSON.parse(
  readFileSync(join(__dirname, "fixtures/goa-plan.json"), "utf-8")
);

function makeGoaSseBody(): string {
  const events = [
    { type: "thread_id", thread_id: goaPlan.thread_id },
    { type: "stage", stage_label: "Researching your destination" },
    { type: "stage", stage_label: "Personalising your plan" },
    { type: "stage", stage_label: "Generating your itinerary" },
    {
      type: "done",
      plan: goaPlan.plan,
      thread_id: goaPlan.thread_id,
      stage_label: goaPlan.stage_label,
      refinement_count: 0,
    },
  ];
  return events.map((e) => `data: ${JSON.stringify(e)}`).join("\n\n") + "\n\n";
}

// ─── UC1: Landing page ────────────────────────────────────────────────────────

test.describe("UC1 — Landing page", () => {
  test("hero, CTAs, and map section render", async ({ page }) => {
    await page.goto("/");

    // Brand
    await expect(page.locator(".brand .word")).toContainText("tripsathi");

    // Hero headline
    await expect(page.locator("h1")).toContainText("plan Indian");

    // Primary CTA
    const demoCta = page.getByRole("button", { name: /try the demo/i });
    await expect(demoCta).toBeVisible();

    // Secondary CTA
    const signInCta = page.getByRole("button", { name: /sign in to plan your own/i });
    await expect(signInCta).toBeVisible();

    // Eyebrow copy
    await expect(page.getByText(/Travel AI · for India/i)).toBeVisible();

    // Scroll cue
    await expect(page.getByText(/explore destinations/i)).toBeVisible();

    // Map section (below fold) — the container renders even before the tiles load
    const mapSection = page.locator(".leaflet-container").first();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(mapSection).toBeVisible({ timeout: 8_000 });
  });

  test("primary CTA navigates to /planner", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /try the demo/i }).click();
    await expect(page).toHaveURL(/\/planner/);
  });

  test("secondary CTA navigates to /onboarding", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /sign in to plan your own/i }).click();
    await expect(page).toHaveURL(/\/onboarding/);
  });
});

// ─── UC2: Demo stepper — full form navigation ─────────────────────────────────

test.describe("UC2 — Demo stepper navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /try the demo/i }).click();
    await expect(page).toHaveURL(/\/planner/);
  });

  test("demo banner is shown with Kerala pre-fill", async ({ page }) => {
    await expect(page.getByText(/using a sample Kerala trip/i)).toBeVisible();
  });

  test("stepper starts at step 3 (who's coming) with Kerala pre-filled", async ({ page }) => {
    // Demo mode starts at step index 2 = "who's coming"
    await expect(page.getByText(/step 3 of 6/i)).toBeVisible();
    // Kerala destination is pre-filled — visible in the recap row value
    await expect(page.locator(".recap-item .val").filter({ hasText: "Kerala" })).toBeVisible();
  });

  test("navigates all remaining steps and reaches sketch my plan", async ({ page }) => {
    // Step 3 → 4 → 5 → 6 (next ×3)
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /^next/i }).click();
    }
    // Now at step 6 (step index 5 = special needs) — "sketch my plan" button visible
    await expect(page.getByRole("button", { name: /sketch my plan/i })).toBeVisible();
    await expect(page.getByText(/step 6 of 6/i)).toBeVisible();
  });

  test("back navigation works — returning to a previous step shows its question", async ({ page }) => {
    // Advance to step 4 (budget)
    await page.getByRole("button", { name: /^next/i }).click();
    await expect(page.getByText(/what's your/i)).toBeVisible();

    // Go back — should return to step 3 (who's coming).
    // Use the stepper "← back" span (not the "← back to prompt" button).
    await page.locator("span.back-link").click();
    await expect(page.getByText(/step 3 of 6/i)).toBeVisible();
  });

  test("recap chips show completed steps after step 4", async ({ page }) => {
    // Move to step 5 (style) — recap chips for steps 1-4 should be shown
    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: /^next/i }).click();
    }
    // At step 5 recap chips should be rendered
    await expect(page.getByText(/step 5 of 6/i)).toBeVisible();
    // Chips for completed steps — check at least "where" label
    await expect(page.locator(".stepper-grid")).toContainText("Kerala");
  });
});

// ─── UC3: Natural language flow → plan display ────────────────────────────────

test.describe("UC3 — Natural language flow with mocked backend", () => {
  test.beforeEach(async ({ page }) => {
    // Mock all three API calls that the NL flow makes
    await page.route("**/api/parse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          destination: "Goa",
          start_date: "2026-07-10",
          duration_days: 3,
          party_size: 2,
          kid_ages: [],
          elderly: false,
          budget_bracket: "mid",
          trip_style: ["beaches", "food"],
          special_needs: "",
        }),
      });
    });

    // Use ** suffix to match the query string (?user_id=...&destination=...)
    await page.route("**/api/clarify/questions**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route("**/api/plan/stream", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: makeGoaSseBody(),
      });
    });
  });

  test("typing a trip description enables the submit button", async ({ page }) => {
    // Sign-in path lands on onboarding; navigate directly to planner in auth mode
    // so we get the NL input box
    await page.goto("/");
    await page.getByRole("button", { name: /sign in to plan your own/i }).click();
    await expect(page).toHaveURL(/\/onboarding/);

    // Come back to entry and navigate via the planner URL directly in auth mode
    // (simpler: just go to /planner — it renders NL mode because ctx.mode defaults to "demo"
    //  which starts stepper; instead use the NL chip shortcut on the entry page)
    await page.goto("/");
    await page.getByRole("button", { name: /try the demo/i }).click();

    // Switch from stepper → NL mode via the "← back to prompt" link
    await page.getByText(/← back to prompt/i).click();

    const textarea = page.locator("textarea.journal-textarea");
    await expect(textarea).toBeVisible();

    // Submit button starts disabled
    await expect(page.getByRole("button", { name: /sketch my plan/i })).toBeDisabled();

    // After typing, button enables
    await textarea.fill("3-night Goa beach trip, couple, mid-range budget");
    await expect(page.getByRole("button", { name: /sketch my plan/i })).not.toBeDisabled();
  });

  test("suggestion chips populate the textarea", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /try the demo/i }).click();
    await page.getByText(/← back to prompt/i).click();

    // Click the first suggestion chip
    await page.getByText("5-night Kerala family trip, mid-range budget").click();

    const textarea = page.locator("textarea.journal-textarea");
    await expect(textarea).toHaveValue("5-night Kerala family trip, mid-range budget");
    await expect(page.getByRole("button", { name: /sketch my plan/i })).not.toBeDisabled();
  });

  test("submitting shows generation screen and then plan display", async ({ page }) => {
    // Capture any browser alerts so they don't silently swallow failures
    const dialogs: string[] = [];
    page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss(); });

    await page.goto("/");
    await page.getByRole("button", { name: /try the demo/i }).click();
    await page.getByText(/← back to prompt/i).click();

    const textarea = page.locator("textarea.journal-textarea");
    await textarea.fill("3-night Goa beach trip, couple, mid-range budget");
    await page.getByRole("button", { name: /sketch my plan/i }).click();

    // GenerationProgress screen should appear while streaming
    await expect(page.getByText(/Goa/i).first()).toBeVisible({ timeout: 5_000 });

    // After mock SSE resolves, plan display should arrive
    await expect(page.locator("h1").filter({ hasText: /plan, sketched/i })).toBeVisible({
      timeout: 15_000,
    });

    // Assert no silent errors occurred
    expect(dialogs, `Unexpected alert: ${dialogs.join("; ")}`).toHaveLength(0);

    // Plan content: day locations (multiple elements contain these strings — use first())
    await page.getByTitle("List view").click();
    await expect(page.getByText("North Goa").first()).toBeVisible();
    await expect(page.getByText("South Goa").first()).toBeVisible();

    // Budget total
    await expect(page.getByText(/24,700/)).toBeVisible();

    // Warning surfaced
    await expect(page.getByText(/North Goa beaches/i)).toBeVisible();
  });
});
