/**
 * Playwright config for running e2e tests against already-running servers.
 * Use this when the API and Web servers are already running externally.
 *
 * Usage: TEST_API_URL=http://localhost:3051 npx playwright test --config=playwright.e2e.config.ts
 */
import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = Number(process.env.WEB_PORT || 3052);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 60_000,

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // No webServer — assumes servers are already running
});
