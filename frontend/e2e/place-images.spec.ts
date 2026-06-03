import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const jaipurPlan = JSON.parse(
  readFileSync(join(__dirname, "fixtures/jaipur-plan.json"), "utf-8")
) as typeof import("./fixtures/jaipur-plan.json");

// Build the SSE body that streamPlan() parses on the frontend.
function makeSseBody(plan: typeof jaipurPlan): string {
  const events = [
    { type: "thread_id", thread_id: plan.thread_id },
    { type: "stage", stage_label: "Researching Jaipur..." },
    { type: "done", plan: plan.plan, stage_label: plan.stage_label, refinement_count: 0 },
  ];
  return events.map((e) => `data: ${JSON.stringify(e)}`).join("\n\n") + "\n\n";
}

/** Navigate the demo stepper and generate a plan (shared between both tests). */
async function generatePlan(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByText("Try the demo").click();
  // Demo starts at stepper step 2 ("who's coming") — click next 3 times → step 5
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: /next/i }).click();
  }
  await page.getByRole("button", { name: /sketch my plan/i }).click();
  // Wait for PlanDisplay to mount
  await expect(page.getByText(/plan, sketched/i)).toBeVisible({ timeout: 15_000 });
  // Switch to list view so all day cards are in the layout (not a carousel)
  await page.getByTitle("List view").click();
}

test.describe("Place image thumbnails", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept the SSE plan endpoint and return our Jaipur fixture.
    await page.route("**/api/plan/stream", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: makeSseBody(jaipurPlan),
      });
    });
  });

  test("shows place image thumbnails in the activity list", async ({ page }) => {
    await generatePlan(page);

    const thumbnails = page.locator('img[src^="/images/places/"]');

    // Scroll the first thumbnail into view, then assert visibility
    await thumbnails.first().scrollIntoViewIfNeeded();
    await expect(thumbnails.first()).toBeVisible();

    // All 5 Jaipur activities have matching images in placesMap.generated.json
    const count = await thumbnails.count();
    expect(count).toBe(5);

    // Spot-check a specific image path
    const amberFortImg = page.locator('img[src="/images/places/amber_fort_jaipur.jpg"]');
    await amberFortImg.scrollIntoViewIfNeeded();
    await expect(amberFortImg).toBeVisible();
  });

  test("activity names are visible alongside their thumbnails", async ({ page }) => {
    await generatePlan(page);

    // Target the activity name <div> specifically (exact match avoids collision
    // with the warning text that also starts with the place name).
    for (const name of ["Amber Fort", "Nahargarh Fort", "Hawa Mahal", "City Palace", "Jantar Mantar"]) {
      const el = page.getByText(name, { exact: true });
      await el.scrollIntoViewIfNeeded();
      await expect(el).toBeVisible();
    }
  });
});
