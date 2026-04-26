import { defineConfig, devices } from "@playwright/test";

function readPort(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : fallback;
}

const API_PORT = readPort("E2E_API_PORT", 3051);
const WEB_PORT = readPort("E2E_WEB_PORT", 3052);
const DEFAULT_E2E_DATABASE_URL = "postgres://helscoop:helscoop_dev@localhost:5433/helscoop";

process.env.TEST_API_URL ??= `http://localhost:${API_PORT}`;
process.env.TEST_WEB_URL ??= `http://localhost:${WEB_PORT}`;
process.env.E2E_DATABASE_URL ??= DEFAULT_E2E_DATABASE_URL;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 60_000,

  use: {
    baseURL: process.env.TEST_WEB_URL,
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

  webServer: [
    {
      command: `npx tsx src/index.ts`,
      cwd: "../api",
      url: `${process.env.TEST_API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        ...process.env,
        PORT: String(API_PORT),
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
        DATABASE_URL: process.env.E2E_DATABASE_URL,
        JWT_SECRET: "helscoop-e2e-test-secret",
        NODE_ENV: "test",
        E2E: "1",
      },
    },
    {
      command: `npx next dev -p ${WEB_PORT}`,
      cwd: "../web",
      url: process.env.TEST_WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: process.env.TEST_API_URL,
      },
    },
  ],
});
