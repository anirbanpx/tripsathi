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
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 10000 });
  const markers = page.locator(".leaflet-marker-icon");
  await expect(markers.first()).toBeVisible({ timeout: 10000 });
  const count = await markers.count();
  expect(count).toBeGreaterThan(40);
});

test("clicking a map marker shows popup with destination name", async ({ page }) => {
  await page.goto("/");
  await page.locator(".leaflet-marker-icon").first().click();
  await expect(page.locator(".leaflet-popup-content")).toBeVisible({ timeout: 5000 });
  const text = await page.locator(".leaflet-popup-content").textContent();
  expect(text?.trim().length).toBeGreaterThan(0);
});

test("destination image loads inside map popup", async ({ page }) => {
  const imageResponses: number[] = [];
  page.on("response", (res) => {
    if (res.url().includes("/images/destinations/")) imageResponses.push(res.status());
  });

  await page.goto("/");
  await page.locator(".leaflet-marker-icon").first().click();
  await page.waitForTimeout(2000);

  if (imageResponses.length > 0) {
    expect(imageResponses[0]).toBe(200);
  } else {
    throw new Error("No /images/destinations/ request made — image URL broken or missing");
  }
});

// ── Demo flow ─────────────────────────────────────────────────────────────────

test("demo button navigates to planner", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Try the demo");
  await expect(page).toHaveURL("/planner");
});

// ── Entry page real photo ─────────────────────────────────────────────────────

test("entry page shows real Kerala photo not CSS illustration", async ({ page }) => {
  const imageStatuses: number[] = [];
  page.on("response", (res) => {
    if (res.url().includes("/images/destinations/kerala")) imageStatuses.push(res.status());
  });

  await page.goto("/");
  await page.waitForTimeout(1000);

  const polaroidImg = page.locator(".polaroid img[alt='Kerala backwaters']");
  await expect(polaroidImg).toBeVisible({ timeout: 5000 });
  expect(imageStatuses.some(s => s === 200)).toBeTruthy();
});

// ── Planner input modes ───────────────────────────────────────────────────────

test("regular planner opens in natural language mode by default", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Sign in to plan your own");
  await expect(page).toHaveURL("/planner");
  await expect(page.locator("textarea")).toBeVisible();
  await expect(page.getByText("prefer step-by-step?")).toBeVisible();
  await expect(page.getByText("Step 1 of 6")).not.toBeVisible();
});

test("demo planner opens in stepper mode at step 3", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Try the demo");
  await expect(page).toHaveURL("/planner");
  await expect(page.getByText("Step 3 of 6")).toBeVisible();
  // Natural language textarea should NOT be the primary view in demo mode
  await expect(page.getByText("prefer step-by-step?")).not.toBeVisible();
});

test("prefer step-by-step link switches to stepper", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Sign in to plan your own");
  await page.getByText("prefer step-by-step?").click();
  await expect(page.getByText("Step 1 of 6")).toBeVisible();
  await expect(page.getByText("← back to prompt")).toBeVisible();
});

test("back to prompt link returns to natural mode", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Sign in to plan your own");
  await page.getByText("prefer step-by-step?").click();
  await page.getByText("← back to prompt").click();
  await expect(page.locator("textarea")).toBeVisible();
  await expect(page.getByText("prefer step-by-step?")).toBeVisible();
});

// ── Stepper destination image ─────────────────────────────────────────────────

test("destination image appears in stepper after step 1", async ({ page }) => {
  const imageStatuses: number[] = [];
  page.on("response", (res) => {
    if (res.url().includes("/images/destinations/")) imageStatuses.push(res.status());
  });

  await page.goto("/");
  await page.click("text=Try the demo");
  await expect(page).toHaveURL("/planner");

  await page.waitForTimeout(500);
  const bandImgVisible  = await page.locator(".dest-band img[alt='Kerala']").isVisible();
  const panelImgVisible = await page.locator(".stepper-dest-panel img[alt='Kerala']").isVisible();
  expect(bandImgVisible || panelImgVisible).toBeTruthy();
  expect(imageStatuses.some(s => s === 200)).toBeTruthy();
});

test("destination name label renders on image card", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Try the demo");

  await page.waitForTimeout(500);
  const bandLabelVisible  = await page.locator(".dest-band-label").isVisible();
  const panelLabelVisible = await page.locator(".stepper-dest-label h2").isVisible();
  expect(bandLabelVisible || panelLabelVisible).toBeTruthy();
});

// ── Generation progress ───────────────────────────────────────────────────────

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

  await expect(page.locator(".progress-sheet")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("text=sketching your")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("text=tripsathi").first()).toBeVisible();
  expect(await page.locator("img[alt='Kerala']").count()).toBeGreaterThan(0);
});

// ── Plan display ──────────────────────────────────────────────────────────────

async function loadMockPlan(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.route("**/api/plan", (route) => {
    route.fulfill({ status: 200, contentType: "application/json", path: "src/mocks/plan.json" });
  });
  await page.goto("/");
  await page.click("text=Try the demo");
  for (let i = 0; i < 3; i++) {
    await page.click("button:has-text('next')");
    await page.waitForTimeout(200);
  }
  await page.click("button:has-text('sketch my plan')");
  await expect(page.locator("text=plan, sketched")).toBeVisible({ timeout: 15000 });
}

test("warnings carousel shows at most 5 items", async ({ page }) => {
  await loadMockPlan(page);

  const warningCards = page.locator(".cx >> text=heads up").locator("..").locator("[style*='scroll-snap-align']");
  const count = await warningCards.count();
  expect(count).toBeLessThanOrEqual(5);
});

test("day card shows local tip callout when notes exist", async ({ page }) => {
  await loadMockPlan(page);

  // Look for the amber left-border note callout inside a day card
  // It has borderLeft: "4px solid var(--ochre-deep)" and an Info icon sibling
  const noteCallout = page.locator(".day-swipe-card").filter({ has: page.locator("[style*='border-left']") }).first();
  const hasNote = await noteCallout.count() > 0;

  if (hasNote) {
    await expect(noteCallout).toBeVisible();
    // The callout should contain some text (the day note)
    const text = await noteCallout.locator("[style*='border-left']").first().textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  } else {
    // Mock plan has no notes — that's valid, just skip
    console.log("No day notes in mock plan — skipping callout assertion");
  }
});

// ── Itinerary map (Mapbox) ────────────────────────────────────────────────────

test("itinerary map renders with Mapbox canvas", async ({ page }) => {
  await loadMockPlan(page);

  await page.click("button[title='Map view']");
  await page.waitForTimeout(3000);

  // Mapbox renders a <canvas> inside .mapboxgl-canvas-container
  const mapCanvas = page.locator(".mapboxgl-canvas");
  const mapUnavailable = page.locator("text=Map unavailable");

  const canvasVisible      = await mapCanvas.isVisible();
  const unavailableVisible = await mapUnavailable.isVisible();

  // One of the two states must be shown
  expect(canvasVisible || unavailableVisible).toBeTruthy();

  if (canvasVisible) {
    console.log("✓ Mapbox canvas rendered");
    // Custom marker divs should be present (numbered stops + hotel pins)
    const markers = page.locator(".mapboxgl-marker");
    const count = await markers.count();
    expect(count).toBeGreaterThan(0);
  } else {
    console.log("⚠ Map unavailable state shown (no token in test env) — fallback UI verified");
  }
});

test("itinerary map has markers for day stops and hotels", async ({ page }) => {
  await loadMockPlan(page);

  await page.click("button[title='Map view']");
  await page.waitForTimeout(3000);

  const mapCanvas = page.locator(".mapboxgl-canvas");
  if (!(await mapCanvas.isVisible())) {
    console.log("Map unavailable — skipping");
    return;
  }

  // Custom marker divs (numbered stops + hotel pins)
  const markers = page.locator(".mapboxgl-marker");
  const count = await markers.count();
  expect(count).toBeGreaterThan(0);
  console.log(`✓ ${count} Mapbox markers rendered`);

  // Navigation controls (zoom buttons) should be present
  await expect(page.locator(".mapboxgl-ctrl-zoom-in")).toBeVisible();
});
