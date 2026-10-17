// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Tests use their own SQLite file so they never touch the app's normal data.
const TEST_DB = 'data/pawfeed-test.db';

module.exports = defineConfig({
  testDir: './tests',
  // All tests share one simulated device, so run them one at a time.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'docs/results.json' }],
    ['allure-playwright', { resultsDir: 'allure-results' }],
  ],
  use: {
    // Set BASE_URL to test a deployed site (e.g. the Vercel URL) instead of the local server.
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    screenshot: 'on',
    video: 'on',
    // Full traces locally; in CI keep them only for failures so the published report stays small.
    trace: process.env.CI ? 'retain-on-failure' : 'on',
    viewport: { width: 1280, height: 900 },
  },
  // Same suite on desktop and on the installable mobile app (PWA) for Android and iPhone.
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'android-pixel7', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-14', use: { ...devices['iPhone 14'] } },
  ],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'node --disable-warning=ExperimentalWarning server.js',
    url: 'http://localhost:3000',
    // Always start our own server so the tests run against the test database.
    reuseExistingServer: false,
    env: { PAWFEED_DB: TEST_DB },
  },
});

module.exports.TEST_DB = TEST_DB;
