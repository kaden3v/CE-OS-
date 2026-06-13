import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the Finance dashboard smoke tests.
 *
 * Auth: the `setup` project signs in once (via E2E_EMAIL / E2E_PASSWORD) and
 * saves the Supabase session to e2e/.auth/state.json; the desktop and mobile
 * projects reuse it. Provide a Canyon Exotics login with owner/manager role:
 *
 *   E2E_EMAIL=you@example.com E2E_PASSWORD=... npm run e2e
 */
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // No-auth boot check — runnable without credentials.
    { name: "smoke", testMatch: /smoke\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    // Authenticated finance flows (desktop + mobile).
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      testMatch: /finances\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/state.json" },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      testMatch: /finances\.spec\.ts/,
      use: { ...devices["Pixel 5"], storageState: "e2e/.auth/state.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
