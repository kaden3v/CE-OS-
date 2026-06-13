import { test, expect } from "@playwright/test";

/**
 * Smoke coverage for the consolidated Finance dashboard. Runs on both the
 * desktop and mobile projects, so it doubles as the responsive check the audit
 * brief asked for. Screenshots land in e2e/screens/<project>-*.png.
 */
test.describe("Finance dashboard", () => {
  test("Overview shows KPIs, the net-profit waterfall, and the tab bar", async ({ page }, testInfo) => {
    await page.goto("/finances");

    await expect(page.getByRole("heading", { name: "Finances" })).toBeVisible();

    // Headline KPI tiles.
    for (const label of ["Net Revenue", "Net Profit", "Total Expenses", "Avg Order Value"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // Unit economics + tax accrual.
    await expect(page.getByText("Shipping margin", { exact: true })).toBeVisible();
    await expect(page.getByText("Sales tax to remit", { exact: true })).toBeVisible();
    await expect(page.getByText(/Set aside .* for income tax/)).toBeVisible();

    // "Show your work" net-profit waterfall, with the expandable expense line.
    await expect(page.getByText("Net Profit — how it's built")).toBeVisible();
    await expect(page.getByText("Gross sales").first()).toBeVisible();
    await page.getByText("Operating expenses").first().click();
    await expect(page.getByText(/Shipping|Marketing|Marketplace fees/).first()).toBeVisible();

    // One sidebar entry → in-page tabs.
    for (const tab of ["Overview", "Revenue", "Expenses", "Production", "Reports", "Manage"]) {
      await expect(page.getByRole("link", { name: tab }).first()).toBeVisible();
    }

    await page.screenshot({ path: `e2e/screens/${testInfo.project.name}-overview.png`, fullPage: true });
  });

  test("tabs keep navigation inside one section", async ({ page }, testInfo) => {
    await page.goto("/finances");

    await page.getByRole("link", { name: "Reports" }).first().click();
    await expect(page).toHaveURL(/\/finances\/reports/);

    await page.getByRole("link", { name: "Manage" }).first().click();
    await expect(page).toHaveURL(/\/finances\/manage/);
    await expect(page.getByRole("link", { name: "Vendors" }).first()).toBeVisible();

    await page.screenshot({ path: `e2e/screens/${testInfo.project.name}-manage.png`, fullPage: true });
  });
});
