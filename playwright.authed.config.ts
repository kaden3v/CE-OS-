import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

/**
 * Authenticated UI-audit config. Reads E2E_EMAIL / E2E_PASSWORD from the
 * environment OR the gitignored .env file (loaded above via dotenv), signs in
 * once through auth.setup.ts, then runs the read-only route audit on desktop +
 * mobile reusing the saved session.
 *
 *   # put E2E_EMAIL / E2E_PASSWORD in .env, then:
 *   npx playwright test --config=playwright.authed.config.ts
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
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      testMatch: /ui-audit-authed\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/state.json" },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      testMatch: /ui-audit-authed\.spec\.ts/,
      use: { ...devices["Pixel 5"], storageState: "e2e/.auth/state.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
