import { test, expect } from "@playwright/test";

// ── Entry page ────────────────────────────────────────────────────────────────

test("entry page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("text=plan Indian")).toBeVisible();
  await expect(page.locator("text=Try the demo")).toBeVisible();
});

// ── India destinations map ────────────────────────────────────────────────────

test("India destinations map renders on entry page", async ({ page }) => {
  await page.goto("/");
  // Wait for Leaflet container
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 10000 });
  // At least some markers present
  const markers = page.locator(".leaflet-marker-icon");
  await expect(markers.first()).toBeVisible({ timeout: 10000 });
  const count = await markers.count();
  expect(count).toBeGreaterThan(40);
});

test("clicking a map marker shows popup with destination name", async ({ page }) => {
  await page.goto("/");
  await page.locator(".leaflet-marker-icon").first().click();
  // Popup should appear with some text
  await expect(page.locator(".leaflet-popup-content")).toBeVisible({ timeout: 5000 });
  const text = await page.locator(".leaflet-popup-content").textContent();
  expect(text?.trim().length).toBeGreaterThan(0);
});

test("destination image loads inside map popup", async ({ page }) => {
  // Track image requests and their responses
  const imageResponses: number[] = [];
  page.on("response", (res) => {
    if (res.url().includes("/images/destinations/")) {
      imageResponses.push(res.status());
    }
  });

  await page.goto("/");
  await page.locator(".leaflet-marker-icon").first().click();
  await page.waitForTimeout(2000);

  // Check if any image request was made and whether it succeeded
  if (imageResponses.length > 0) {
    expect(imageResponses[0]).toBe(200);
  } else {
    // No image request made at all — image URL not being fetched
    throw new Error("No /images/destinations/ request made — image URL broken or missing");
  }
});

// ── Demo flow ─────────────────────────────────────────────────────────────────

test("demo button navigates to planner", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Try the demo");
  await expect(page).toHaveURL("/planner");
});

// ── Itinerary map (PlanDisplay) ───────────────────────────────────────────────

test("itinerary map renders with day markers and hotel pins", async ({ page }) => {
  // Intercept /api/plan so we don't wait for the real backend
  await page.route("**/api/plan", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      path: "src/mocks/plan.json",
    });
  });

  await page.goto("/");
  await page.click("text=Try the demo");
  await expect(page).toHaveURL("/planner");

  // Demo starts at step 2 — click next through steps 2→3→4→5
  for (let i = 0; i < 3; i++) {
    await page.click("button:has-text('next')");
    await page.waitForTimeout(200);
  }

  // Step 5: generate
  await page.click("button:has-text('sketch my plan')");

  // Wait for plan display (generation progress clears, plan header appears)
  await expect(page.locator("text=plan, sketched")).toBeVisible({ timeout: 15000 });

  // Switch to map view
  await page.click("button[title='Map view']");
  await page.waitForTimeout(2000);

  // Leaflet map should be visible
  await expect(page.locator(".leaflet-container").last()).toBeVisible({ timeout: 8000 });

  // Day markers (numbered circles) should be present
  const markers = page.locator(".leaflet-marker-icon");
  const count = await markers.count();
  expect(count).toBeGreaterThan(0);
});

test("itinerary map popups show day activities", async ({ page }) => {
  await page.route("**/api/plan", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      path: "src/mocks/plan.json",
    });
  });

  await page.goto("/");
  await page.click("text=Try the demo");
  for (let i = 0; i < 3; i++) {
    await page.click("button:has-text('next')");
    await page.waitForTimeout(200);
  }
  await page.click("button:has-text('sketch my plan')");
  await expect(page.locator("text=plan, sketched")).toBeVisible({ timeout: 15000 });

  await page.click("button[title='Map view']");
  await page.waitForTimeout(2000);

  // Click the first day marker — force bypasses Leaflet inner-div pointer interception
  await page.locator(".leaflet-marker-icon").first().click({ force: true });
  await page.waitForTimeout(1000);

  // Popup should show location + at least one activity
  await expect(page.locator(".leaflet-popup-content")).toBeVisible({ timeout: 5000 });
  const popupText = await page.locator(".leaflet-popup-content").textContent();
  expect(popupText?.length).toBeGreaterThan(10);
});
