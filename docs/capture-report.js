// Captures the extra screenshots used in the test document:
//  - REPORT-02: Playwright HTML report detail page (served locally from playwright-report/)
//  - CI-01:     GitHub Actions run of the CI/CD pipeline (public repo)
//  - CI-02:     the live Vercel app on an emulated Android phone
// Run: node docs/capture-report.js [github-actions-run-url]
const { chromium, devices } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'playwright-report');
const out = path.join(__dirname, '..', 'screenshots');
const LIVE_URL = 'https://pawfeed-smart-pet-feeder.vercel.app';
const RUN_URL = process.argv[2];

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(root, p === '/' ? 'index.html' : p), (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200);
    res.end(data);
  });
});

(async () => {
  await new Promise(r => server.listen(9400, r));
  const browser = await chromium.launch();

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:9400/');
  await page.getByText('ATC-09').first().click();
  await page.getByText('sync-time').first().waitFor();
  await page.screenshot({ path: path.join(out, 'REPORT-02_test_detail.png') });
  server.close();

  if (RUN_URL) {
    await page.setViewportSize({ width: 1280, height: 760 });
    await page.goto(RUN_URL);
    await page.getByText('Deploy to Vercel').first().waitFor();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, 'CI-01_github_actions_run.png') });
  }

  const phone = await browser.newContext({ ...devices['Pixel 7'] });
  const live = await phone.newPage();
  await live.goto(LIVE_URL);
  await live.getByText('On-device demo').waitFor();
  await live.screenshot({ path: path.join(out, 'CI-02_live_app_on_phone.png') });

  await browser.close();
})();
