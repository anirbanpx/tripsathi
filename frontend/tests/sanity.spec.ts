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

// ── Entry page real photo (UX overhaul) ──────────────────────────────────────

test("entry page shows real Kerala photo not CSS illustration", async ({ page }) => {
  const imageStatuses: number[] = [];
  page.on("response", (res) => {
    if (res.url().includes("/images/destinations/kerala")) imageStatuses.push(res.status());
  });

  await page.goto("/");
  await page.waitForTimeout(1000);

  // Real <img> tag inside the polaroid — not CSS children
  const polaroidImg = page.locator(".polaroid img[alt='Kerala backwaters']");
  await expect(polaroidImg).toBeVisible({ timeout: 5000 });

  // Image loaded successfully
  expect(imageStatuses.some(s => s === 200)).toBeTruthy();
});

// ── Planner stepper ───────────────────────────────────────────────────────────

test("destination image appears in stepper after step 1", async ({ page }) => {
  const imageStatuses: number[] = [];
  page.on("response", (res) => {
    if (res.url().includes("/images/destinations/")) imageStatuses.push(res.status());
  });

  await page.goto("/");
  await page.click("text=Try the demo");
  await expect(page).toHaveURL("/planner");

  // Demo starts at step 2 (destination=Kerala already set) — image should be visible
  await expect(page.locator("img[alt='Kerala']")).toBeVisible({ timeout: 5000 });

  // Image request succeeded
  expect(imageStatuses.some(s => s === 200)).toBeTruthy();
});

test("destination name label renders on image card", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Try the demo");

  // The overlay label should say "Kerala"
  await expect(page.locator("text=Kerala ✦")).toBeVisible({ timeout: 5000 });
});

test("sticky destination band visible at top of stepper", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Try the demo");

  // .dest-band should be in the DOM and visible (not clipped below sticky bar)
  const band = page.locator(".dest-band");
  await expect(band).toBeVisible({ timeout: 5000 });

  // The band image should be in the top half of the viewport — not bottom-clipped
  const box = await band.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeLessThan(220); // top edge below demo banner + topbar
  expect(box!.y + box!.height).toBeLessThan(340); // bottom edge still in upper third
});

test("generation progress shows full-bleed image and bottom sheet", async ({ page }) => {
  await page.route("**/api/plan", async (route) => {
    await new Promise(r => setTimeout(r, 5000));
    route.fulfill({ status: 200, contentType: "application/json", path: "src/mocks/plan.json" });
  });

  await page.goto("/");
  await page.click("text=Try the demo");
  for (let i = 0; i < 3; i++) { await page.click("button:has-text('next')"); await page.waitForTimeout(200); }
  await page.click("button:has-text('sketch my plan')");
  await page.waitForTimeout(1800);

  // Full-bleed background image should be present
  const bgImg = page.locator("img[alt='Kerala']").first();
  await expect(bgImg).toBeVisible({ timeout: 5000 });

  // Bottom sheet with stages list
  await expect(page.locator(".progress-sheet")).toBeVisible({ timeout: 5000 });

  // Headline visible inside the sheet
  await expect(page.locator("text=sketching your")).toBeVisible({ timeout: 5000 });

  // Brand text visible on the image (topbar) — first match is the progress screen one
  await expect(page.locator("text=tripsathi").first()).toBeVisible();
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
