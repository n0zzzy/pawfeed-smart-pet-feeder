// Automation tests for the Automatic Smart Pet Feeder
// Mapped to the "Define Automation Testing" scenarios AS-01 .. AS-06
const { test, expect } = require('@playwright/test');
const path = require('path');

const id = name => `[data-testid="${name}"]`;

// Saves a full-page screenshot to /screenshots (mobile runs go in a sub-folder) and attaches it to the HTML report.
async function snap(page, testInfo, name) {
  const project = testInfo.project.name;
  const dir = project === 'desktop-chrome' ? 'screenshots' : path.join('screenshots', project);
  const file = path.join(__dirname, '..', dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

// Records the measured value in the report so the test document can quote actual results.
function record(testInfo, description) {
  testInfo.annotations.push({ type: 'actual', description });
}

async function lastWeight(page) {
  return parseFloat(await page.locator(id('last-weight')).textContent());
}

async function setPortion(page, slots) {
  await page.locator(id('portion-input')).fill(String(slots));
  await page.locator(id('portion-save')).click();
}

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/sim/reset');
  await page.goto('/');
  await expect(page.locator(id('connection-status'))).toHaveText('CONNECTED');
});

test.describe('AS-01 Manual Feed Trigger (TC-02)', () => {
  test('ATC-01: Manual feed dispenses exactly one portion (~10 g)', async ({ page }, testInfo) => {
    await expect(page.locator(id('dispense-count'))).toHaveText('0');
    await expect(page.locator(id('portion-current'))).toHaveText('1');

    await page.locator(id('manual-feed-btn')).click();

    await expect(page.locator(id('feed-result'))).toContainText('Dispensed');
    await expect(page.locator(id('dispense-count'))).toHaveText('1');
    await expect(page.locator(id('feed-log-row'))).toHaveCount(1);
    const weight = await lastWeight(page);
    expect(weight, 'Portion weight within ±5% of 10 g').toBeGreaterThanOrEqual(9.5);
    expect(weight, 'Portion weight within ±5% of 10 g').toBeLessThanOrEqual(10.5);
    record(testInfo, `Dispense count went 0 → 1; dispensed ${weight} g (within 9.5–10.5 g).`);

    await snap(page, testInfo, 'ATC-01_manual_feed_success');
  });

  test('ATC-02: Manual feed is blocked when the chute is jammed', async ({ page }, testInfo) => {
    await page.locator(id('sim-jam')).click();
    await expect(page.locator(id('sim-jam-state'))).toHaveText('ON');

    await page.locator(id('manual-feed-btn')).click();

    await expect(page.locator(id('feed-result'))).toContainText('JAM_DETECTED');
    await expect(page.locator(id('last-weight'))).toHaveText('0');
    await expect(page.locator(id('dispense-count'))).toHaveText('0');
    await expect(page.locator(`${id('notification-item')}[data-type="JAM"]`)).toBeVisible();
    record(testInfo, 'Status JAM_DETECTED, 0 g dispensed, dispense count stayed 0, JAM notification shown.');

    await snap(page, testInfo, 'ATC-02_manual_feed_jam_detected');
  });
});

test.describe('AS-02 Portion Size Configuration (TC-03)', () => {
  test('ATC-03: 5-slot portion dispenses ~50 g and the setting persists', async ({ page }, testInfo) => {
    await setPortion(page, 5);
    await expect(page.locator(id('portion-msg'))).toContainText('Portion saved: 5');

    // Setting must survive a page reload (saved on the device, not only in the UI)
    await page.reload();
    await expect(page.locator(id('portion-current'))).toHaveText('5');

    await page.locator(id('manual-feed-btn')).click();
    await expect(page.locator(id('dispense-count'))).toHaveText('1');
    const weight = await lastWeight(page);
    expect(weight).toBeGreaterThanOrEqual(47.5);
    expect(weight).toBeLessThanOrEqual(52.5);
    record(testInfo, `Portion saved and still 5 slots after page reload; dispensed ${weight} g (within 47.5–52.5 g).`);

    await snap(page, testInfo, 'ATC-03_portion_5_slots_50g');
  });

  test('ATC-04: Invalid portion (99 slots) is rejected, not saved', async ({ page }, testInfo) => {
    await setPortion(page, 99);

    await expect(page.locator(id('portion-msg'))).toContainText('INVALID_PORTION');
    await expect(page.locator(id('portion-current'))).toHaveText('1');
    await expect(page.locator(id('dispense-count'))).toHaveText('0');
    record(testInfo, `App showed "${(await page.locator(id('portion-msg')).textContent()).replace('✘ ', '')}"; portion stayed at 1 slot.`);

    await snap(page, testInfo, 'ATC-04_invalid_portion_rejected');
  });
});

test.describe('AS-03 Scheduled Dispensing (TC-04)', () => {
  test('ATC-05: Scheduled meal at 08:00 triggers a feed within ±1 minute', async ({ page }, testInfo) => {
    await page.locator(id('schedule-time')).fill('08:00:00');
    await page.locator(id('schedule-slots')).fill('3');
    await page.locator(id('schedule-add')).click();
    await expect(page.locator(id('schedule-sync-status'))).toContainText('Synced to device');

    // Mock the device clock to the scheduled time and tick
    await page.locator(id('sim-clock-input')).fill('08:00:00');
    await page.locator(id('sim-clock-set')).click();

    const row = page.locator(id('feed-log-row')).first();
    await expect(row).toContainText('SCHEDULED');
    await expect(row).toContainText('DISPENSED');

    const loggedTime = await row.locator('td').first().textContent();
    const toSec = t => t.split(':').reduce((a, v) => a * 60 + Number(v), 0);
    expect(Math.abs(toSec(loggedTime) - toSec('08:00:00'))).toBeLessThanOrEqual(60);

    const weight = await lastWeight(page);
    expect(weight).toBeGreaterThanOrEqual(28.5);
    expect(weight).toBeLessThanOrEqual(31.5);
    const offset = Math.abs(toSec(loggedTime) - toSec('08:00:00'));
    record(testInfo, `SCHEDULED feed logged at ${loggedTime} (${offset} s from target, within ±60 s); dispensed ${weight} g for 3 slots.`);

    await snap(page, testInfo, 'ATC-05_scheduled_feed_triggered');
  });
});

test.describe('AS-04 Low Food Alert (TC-06)', () => {
  test('ATC-06: Low Food alert appears when hopper drops to 10%', async ({ page }, testInfo) => {
    await page.locator(id('sim-food-input')).fill('10');
    await page.locator(id('sim-food-set')).click();

    await expect(page.locator(id('food-level'))).toHaveText('10');
    await expect(page.locator(`${id('notification-item')}[data-type="LOW_FOOD"]`))
      .toBeVisible({ timeout: 3000 });
    record(testInfo, 'Food level showed 10% (red bar) and a LOW FOOD notification appeared.');

    await snap(page, testInfo, 'ATC-06_low_food_alert_10_percent');
  });

  test('ATC-07: No Low Food alert when hopper is at 40%', async ({ page }, testInfo) => {
    await page.locator(id('sim-food-input')).fill('40');
    await page.locator(id('sim-food-set')).click();

    await expect(page.locator(id('food-level'))).toHaveText('40');
    await page.waitForTimeout(1500); // give the alert time to (wrongly) appear
    await expect(page.locator(`${id('notification-item')}[data-type="LOW_FOOD"]`)).toHaveCount(0);
    record(testInfo, 'Food level showed 40%; no LOW FOOD notification after waiting 1.5 s.');

    await snap(page, testInfo, 'ATC-07_no_alert_40_percent');
  });
});

test.describe('AS-05 Wi-Fi Reconnection (TC-08)', () => {
  test('ATC-08: Device auto-reconnects within 60 s with no manual pairing', async ({ page }, testInfo) => {
    const status = page.locator(id('connection-status'));

    await page.locator(id('sim-network-off')).click();
    await expect(status).toHaveText('DISCONNECTED');
    await snap(page, testInfo, 'ATC-08a_wifi_dropped');

    await page.waitForTimeout(5000);
    const restoredAt = Date.now();
    await page.locator(id('sim-network-on')).click();

    await expect(status).toHaveText('CONNECTED', { timeout: 60_000 });
    const reconnectSec = ((Date.now() - restoredAt) / 1000).toFixed(1);
    await expect(page.locator(id('pairing-calls'))).toHaveText('0');
    record(testInfo, `Status went DISCONNECTED → RECONNECTING → CONNECTED in ${reconnectSec} s after Wi-Fi was restored; manual pairing calls = 0.`);

    await snap(page, testInfo, 'ATC-08b_wifi_reconnected');
  });
});

test.describe('AS-06 Mobile App Schedule Sync (TC-14)', () => {
  test('ATC-09: Schedule change syncs to the device in under 2 seconds', async ({ page }, testInfo) => {
    await page.locator(id('schedule-time')).fill('08:00:00');
    await page.locator(id('schedule-slots')).fill('2');
    await page.locator(id('schedule-add')).click();
    await expect(page.locator(id('schedule-sync-status'))).toContainText('Synced to device');

    await page.locator(id('schedule-edit')).click();
    await page.locator(id('schedule-edit-time')).fill('18:30:00');

    const start = Date.now();
    await page.locator(id('schedule-edit-save')).click();
    await expect(page.locator(id('schedule-row-time'))).toHaveText('18:30:00');
    await expect(page.locator(id('schedule-sync-status'))).toContainText('Synced to device', { timeout: 2000 });
    const elapsed = (Date.now() - start) / 1000;

    console.log(`Schedule sync took ${elapsed.toFixed(2)} s`);
    testInfo.annotations.push({ type: 'sync-time', description: `${elapsed.toFixed(2)} s` });
    expect(elapsed, `Sync time ${elapsed.toFixed(2)} s must be under 2 s`).toBeLessThan(2.0);
    record(testInfo, `Schedule changed 08:00:00 → 18:30:00 and showed "Synced to device" after ${elapsed.toFixed(2)} s (limit < 2 s).`);

    await snap(page, testInfo, 'ATC-09_schedule_sync_under_2s');
  });
});

test.describe('Mobile App (PWA)', () => {
  test('ATC-10: App is installable — valid manifest, icons and active service worker', async ({ page, request }, testInfo) => {
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');

    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.short_name).toBe('PawFeed');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    const sizes = manifest.icons.map(i => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).ok(), `icon ${icon.src} loads`).toBeTruthy();
    }

    await expect.poll(() => page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration())?.active?.state), { timeout: 10_000 }).toBe('activated');

    record(testInfo, `Manifest "${manifest.name}" (display: ${manifest.display}) with ${manifest.icons.length} icons loaded; service worker is activated.`);
    await snap(page, testInfo, 'ATC-10_pwa_installable');
  });

  test('ATC-11: App still opens and feeds while the phone is offline', async ({ page, context }, testInfo) => {
    await expect.poll(() => page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration())?.active?.state), { timeout: 10_000 }).toBe('activated');

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByRole('heading', { name: /PawFeed/ })).toBeVisible();
    await expect(page.locator(id('data-mode'))).toHaveText('On-device demo');
    await page.locator(id('manual-feed-btn')).click();
    await expect(page.locator(id('feed-result'))).toContainText('Dispensed');

    record(testInfo, 'With the network turned off, the app loaded from the service-worker cache, switched to on-device mode and dispensed a portion.');
    await snap(page, testInfo, 'ATC-11_offline_mode');
    await context.setOffline(false);
  });
});

test.describe('Hosted on Vercel (no device API)', () => {
  // Fresh browser context with no service worker so the /api route mock is always hit.
  test.use({ serviceWorkers: 'block' });

  test('ATC-12: Hosted app runs the feeder on the device and keeps data after reload', async ({ page }, testInfo) => {
    await page.route('**/api/**', route => route.fulfill({ status: 404, contentType: 'text/html', body: 'Not Found' }));
    await page.goto('/');

    await expect(page.locator(id('data-mode'))).toHaveText('On-device demo');
    await expect(page.locator(id('connection-status'))).toHaveText('CONNECTED');
    await page.locator(id('manual-feed-btn')).click();
    await expect(page.locator(id('dispense-count'))).toHaveText('1');
    const weight = await lastWeight(page);
    expect(weight).toBeGreaterThanOrEqual(9.5);
    expect(weight).toBeLessThanOrEqual(10.5);

    await page.reload();
    await expect(page.locator(id('dispense-count'))).toHaveText('1');

    record(testInfo, `With /api unavailable (like on Vercel) the app ran in on-device mode, dispensed ${weight} g and still showed 1 feed after reload.`);
    await snap(page, testInfo, 'ATC-12_hosted_on_device_mode');
  });
});

test.describe('Responsive layout', () => {
  test('ATC-13: Layout fits the screen with no sideways scrolling and a tappable Feed button', async ({ page }, testInfo) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, 'no horizontal page scroll').toBeLessThanOrEqual(clientWidth);

    const feed = page.locator(id('manual-feed-btn'));
    await expect(feed).toBeInViewport();
    const box = await feed.boundingBox();
    expect(box.height, 'tap target at least 44 px tall').toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);

    const vp = page.viewportSize();
    record(testInfo, `Viewport ${vp.width}×${vp.height}: page width ${scrollWidth} px fits ${clientWidth} px; Feed Now button ${Math.round(box.width)}×${Math.round(box.height)} px and visible.`);
    await snap(page, testInfo, 'ATC-13_responsive_layout');
  });
});
