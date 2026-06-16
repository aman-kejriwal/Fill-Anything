// playwright.config.js - Extension-aware Playwright config
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    headless: false,  // Extensions require headed mode
    viewport: { width: 1280, height: 720 },
  },
});
