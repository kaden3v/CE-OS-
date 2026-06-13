import { test, expect } from "@playwright/test";

/**
 * No-auth boot check: proves the app compiles AND runs in a real browser with no
 * runtime errors, exercising the shared shell my changes touched (App routing,
 * the collapsed sidebar Layout, providers). Authed finance flows are covered in
 * finances.spec.ts once E2E credentials are supplied.
 */
test("app boots and the sign-in form renders without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");
  // Unauthenticated users are redirected to the sign-in screen.
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();

  await page.screenshot({ path: "e2e/screens/smoke-signin.png", fullPage: true });
  expect(errors, `unexpected page errors:\n${errors.join("\n")}`).toHaveLength(0);
});
