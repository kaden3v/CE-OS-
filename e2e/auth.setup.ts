import { test as setup } from "@playwright/test";
import fs from "node:fs";

const AUTH_FILE = "e2e/.auth/state.json";

/**
 * Signs in through the real Supabase auth form and persists the session so the
 * test projects start already authenticated. Requires a manager/owner login.
 */
setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set E2E_EMAIL and E2E_PASSWORD to a Canyon Exotics login with owner/manager role, e.g.\n" +
        "  E2E_EMAIL=you@example.com E2E_PASSWORD=... npm run e2e",
    );
  }

  await page.goto("/sign-in");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // The app redirects away from /sign-in once the session is established.
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 30_000 });

  fs.mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
