// Screenshots the Playwright HTML report for the test document.
// Run: npx playwright show-report must NOT be running; this serves the report itself.
const { chromium } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'playwright-report');
const out = path.join(__dirname, '..', 'screenshots');

const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, data) => {
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
  await page.screenshot({ path: path.join(out, 'REPORT-02_test_detail.png'), fullPage: false });

  await browser.close();
  server.close();
})();
