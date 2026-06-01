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
