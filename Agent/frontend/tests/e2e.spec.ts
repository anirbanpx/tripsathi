import { test, expect } from "@playwright/test";

test("landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".brand")).toBeVisible();
  await expect(page.getByText("Try the demo")).toBeVisible();
  await expect(page.getByText("Sign in")).toBeVisible();
});

test("demo flow: land on planner at step 3 (stepper mode)", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Try the demo").click();
  await expect(page).toHaveURL(/\/planner/);
  await expect(page.getByText("Step 3 of 6")).toBeVisible();
  await expect(page.locator(".demo-banner")).toBeVisible();
});

test("regular flow: planner opens in natural language mode", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Sign in to plan your own").click();
  await expect(page).toHaveURL(/\/planner/);
  // Natural language textarea should be the primary visible input
  await expect(page.locator("textarea")).toBeVisible();
  await expect(page.getByText("tell me everything")).toBeVisible();
  // Step-by-step toggle should be a subtle link, not a dominant button
  await expect(page.getByText("guide me through it")).toBeVisible();
  // Stepper progress bar should NOT be visible by default
  await expect(page.getByText("Step 1 of 6")).not.toBeVisible();
});

test("switching from natural to stepper mode and back", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Sign in to plan your own").click();

  // Natural mode is default
  await expect(page.locator("textarea")).toBeVisible();

  // Click "guide me through it"
  await page.getByText("guide me through it").click();
  await expect(page.getByText("Step 1 of 6")).toBeVisible();
  await expect(page.getByText("← back to prompt")).toBeVisible();

  // Click back to prompt
  await page.getByText("← back to prompt").click();
  await expect(page.locator("textarea")).toBeVisible();
  await expect(page.getByText("guide me through it")).toBeVisible();
});

test("full plan generation flow", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("/");
  await page.getByText("Try the demo").click();
  await expect(page).toHaveURL(/\/planner/);

  // Step 3 pre-filled (demo) — advance to step 4
  await page.getByText("next").click();
  await expect(page.getByText("Step 4 of 6")).toBeVisible();

  // Step 4: budget — mid already selected, advance
  await page.getByText("next").click();
  await expect(page.getByText("Step 5 of 6")).toBeVisible();

  // Step 5: trip style — pick nature
  await page.getByText("nature").click();
  await page.getByText("next").click();
  await expect(page.getByText("Step 6 of 6")).toBeVisible();

  // Step 6: submit
  await page.getByText("sketch my plan").click();

  // Progress overlay
  await expect(page.getByText("Understanding your profile...").first()).toBeVisible({ timeout: 5000 });

  // Wait for plan — LLM pipeline takes time
  await expect(page.getByText(/Day 1/i).first()).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/Kerala|Kochi|Munnar/i).first()).toBeVisible();
  console.log("✓ Plan displayed");

  // Refinement input
  const refineInput = page.locator('input[placeholder*="want a change"]');
  await expect(refineInput).toBeVisible();
  await refineInput.fill("add more vegetarian food options on day 2");
  await refineInput.press("Enter");

  await expect(page.getByText(/Day 1/i).first()).toBeVisible({ timeout: 60_000 });
  console.log("✓ Refinement submitted");

  // Approve and move to booking
  await page.getByText("looks good — book it").click();
  await expect(page.getByText(/book|confirm/i).first()).toBeVisible({ timeout: 5000 });
  console.log("✓ Moved to booking");
});
