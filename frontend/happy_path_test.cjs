const { chromium } = require('playwright');
const os = require('os');
const tmp = os.tmpdir();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });

  const errors = [];
  const alerts = [];
  const logs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
    logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('dialog', async d => {
    alerts.push(d.message());
    await d.dismiss();
  });

  // Step 1: Entry page
  console.log('STEP 1: Entry page');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${tmp}/hp_1_entry.png` });

  // Step 2: Click Try the demo (takes us to planner in demo/stepper mode)
  console.log('STEP 2: Clicking Try the demo');
  await page.click('.entry-cta-primary');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${tmp}/hp_2_planner.png` });

  // Step 3: Switch to NL mode and type a trip
  console.log('STEP 3: Switching to NL mode and typing trip description');
  const backBtn = await page.$('button:has-text("back to prompt")');
  if (backBtn) {
    await backBtn.click();
    await page.waitForTimeout(500);
  }

  const textarea = await page.$('.journal-textarea');
  if (textarea) {
    await textarea.fill('5 nights in Goa, couple trip, mid-range budget, beaches and food');
    await page.screenshot({ path: `${tmp}/hp_3_typed.png` });
    console.log('STEP 4: Clicking sketch my plan');
    await page.click('.cta-primary');
  } else {
    console.log('WARNING: No journal-textarea found');
    await page.screenshot({ path: `${tmp}/hp_3_debug.png` });
    const html = await page.evaluate(() => document.body.innerHTML.slice(0, 500));
    console.log('Body snippet:', html);
    await browser.close();
    return;
  }

  // Step 4: Check for clarify screen and skip through it if present
  await page.waitForTimeout(3000);
  const clarifyHeading = await page.$('h1:has-text("quick questions")');
  if (clarifyHeading) {
    console.log('STEP 4a: Clarify screen detected — skipping questions');
    await page.screenshot({ path: `${tmp}/hp_4a_clarify.png` });
    await page.click('.cta-primary'); // "sketch my plan" button on clarify screen
    await page.waitForTimeout(2000);
  }

  // Step 4b: Generation screen
  await page.screenshot({ path: `${tmp}/hp_4_generating.png` });
  console.log('STEP 5: Waiting for plan (up to 150s)...');

  // Step 5: Wait for plan to render. 150s headroom: the critic reliably
  // loops once (extra synthesis+critic cycle ≈ 7-8 sequential LLM calls),
  // and Groq adds backoff on the occasional 429.
  try {
    await page.waitForSelector('.plan-bottom', { timeout: 150000 });
    console.log('SUCCESS: Plan loaded!');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${tmp}/hp_5_plan.png`, fullPage: false });

    // Verify key elements. Plan opens in "map" view by default, where
    // .day-swipe-card isn't mounted — switch to swipe view first so the
    // count reflects the actual itinerary.
    const swipeBtn = await page.$('button[title="Swipe view"]');
    if (swipeBtn) {
      await swipeBtn.click();
      await page.waitForTimeout(500);
    }
    const days = await page.$$('.day-swipe-card');
    const budget = await page.$('.budget');
    console.log(`  Days rendered: ${days.length}`);
    console.log(`  Budget section: ${budget ? 'yes' : 'no'}`);
  } catch (e) {
    console.log('FAIL: Plan did not load —', e.message);
    await page.screenshot({ path: `${tmp}/hp_5_timeout.png` });
  }

  console.log('JS errors:', errors.length ? errors : 'none');
  console.log('Alerts caught:', alerts.length ? alerts : 'none');
  console.log('Console logs:', logs.slice(-10));
  await browser.close();
})();
