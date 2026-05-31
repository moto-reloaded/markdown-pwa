import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./tmp/playwright-results",
  webServer: {
    command: "node scripts/server.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 10000,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
