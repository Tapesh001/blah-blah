import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'keyboard.e2e.js',
  outputDir: '../../test-results/aviraj',
  use: { baseURL: 'http://127.0.0.1:4178', headless: true },
  webServer: {
    command: 'npm run preview -- --port 4178',
    url: 'http://127.0.0.1:4178',
    reuseExistingServer: !process.env.CI,
  },
});
