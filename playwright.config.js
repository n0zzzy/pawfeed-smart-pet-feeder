// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // All tests share one simulated device, so run them one at a time.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  globalTeardown: './tests/global-teardown.js',
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'docs/results.json' }]],
  use: {
    baseURL: 'http://localhost:3000',
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
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
