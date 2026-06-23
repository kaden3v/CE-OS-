import { defineConfig, devices } from "@playwright/test";

/**
 * Standalone config for the UNAUTHENTICATED UI audit (no Supabase login needed).
 * Runs the public-surface audit on desktop + mobile viewports against the dev
 * server. Kept separate from playwright.config.ts so the authed finance specs
 * are untouched.
 */
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", testMatch: /ui-audit-public\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: /ui-audit-public\.spec\.ts/, use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
