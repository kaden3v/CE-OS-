import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";

/**
 * Authenticated, READ-ONLY UI audit. Visits every in-app route on the running
 * project's viewport, captures console/runtime errors, responsive overflow, and
 * lightweight a11y findings, and screenshots each page. It NEVER submits forms,
 * saves, deletes, or clicks destructive actions — pure navigation — so it is
 * safe to run against a real organization's data.
 *
 * Requires a signed-in storage state (see auth.setup.ts) produced from
 * E2E_EMAIL / E2E_PASSWORD. Routes that need manager/admin roles are tagged and
 * are simply skipped (recorded) if the account lacks the role — they redirect
 * home, which the audit detects rather than failing on.
 */

interface RouteDef {
  path: string;
  name: string;
  needs?: "manager" | "admin";
}

const ROUTES: RouteDef[] = [
  { path: "/", name: "dashboard" },
  { path: "/orders", name: "orders" },
  { path: "/inventory", name: "inventory" },
  { path: "/inventory/qr-codes", name: "inventory-qr" },
  { path: "/propagation", name: "propagation" },
  { path: "/propagation/capacity", name: "propagation-capacity" },
  { path: "/cultivars", name: "cultivars" },
  { path: "/cultivars/profit", name: "cultivars-profit", needs: "manager" },
  { path: "/customers", name: "customers" },
  { path: "/shipping", name: "shipping" },
  { path: "/shipping/print-queue", name: "shipping-print-queue" },
  { path: "/listings", name: "listings" },
  { path: "/finances", name: "finances-overview", needs: "manager" },
  { path: "/finances/revenue", name: "finances-revenue", needs: "manager" },
  { path: "/finances/goals", name: "finances-goals", needs: "manager" },
  { path: "/finances/expenses", name: "finances-expenses", needs: "manager" },
  { path: "/finances/production", name: "finances-production", needs: "manager" },
  { path: "/finances/reports", name: "finances-reports", needs: "manager" },
  { path: "/finances/manage", name: "finances-manage", needs: "manager" },
  { path: "/finances/subscriptions", name: "finances-subscriptions", needs: "manager" },
  { path: "/finances/supplies", name: "finances-supplies", needs: "manager" },
  { path: "/finances/vendors", name: "finances-vendors", needs: "manager" },
  { path: "/finances/mileage", name: "finances-mileage", needs: "manager" },
  { path: "/licenses", name: "licenses", needs: "manager" },
  { path: "/team", name: "team" },
  { path: "/activity", name: "activity" },
  { path: "/import", name: "import", needs: "manager" },
  { path: "/settings", name: "settings" },
  { path: "/admin/access-requests", name: "admin-access-requests", needs: "admin" },
];

interface Finding { route: string; kind: string; detail: string }
const findings: Finding[] = [];
const consoleErrors: { route: string; text: string }[] = [];
const pageErrors: { route: string; text: string }[] = [];
let projectName = "unknown";

async function probe(page: Page, route: string, vw: number) {
  const issues = await page.evaluate((viewport) => {
    const out: { kind: string; detail: string }[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > viewport + 1) out.push({ kind: "overflow-x", detail: `scrollWidth ${doc.scrollWidth} > ${viewport}` });
    const wide = Array.from(document.querySelectorAll<HTMLElement>("main *, [role=main] *"))
      .filter((el) => el.getBoundingClientRect().width > viewport + 2)
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className || "").split(" ").slice(0, 2).join(".")}`);
    if (wide.length) out.push({ kind: "wide-element", detail: wide.join(", ") });

    const fields = Array.from(document.querySelectorAll<HTMLInputElement>("input, textarea, select"));
    for (const f of fields) {
      if (f.type === "hidden") continue;
      const id = f.getAttribute("id");
      const hasLabelFor = id ? !!document.querySelector(`label[for="${CSS.escape(id)}"]`) : false;
      const hasAria = !!f.getAttribute("aria-label") || !!f.getAttribute("aria-labelledby");
      if (!hasLabelFor && !hasAria && !f.closest("label")) {
        out.push({ kind: "field-no-accessible-name", detail: `${f.tagName.toLowerCase()}#${id ?? "(none)"} ph=${f.getAttribute("placeholder") ?? ""}` });
      }
    }
    const iconButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .filter((b) => !(b.textContent || "").trim() && !b.getAttribute("aria-label") && !b.getAttribute("title"));
    if (iconButtons.length) out.push({ kind: "icon-button-no-name", detail: `${iconButtons.length} button(s) with no accessible name` });

    const imgsNoAlt = Array.from(document.querySelectorAll<HTMLImageElement>("img")).filter((i) => i.getAttribute("alt") === null);
    if (imgsNoAlt.length) out.push({ kind: "img-no-alt", detail: `${imgsNoAlt.length} <img> without alt` });

    const ids = Array.from(document.querySelectorAll<HTMLElement>("[id]")).map((e) => e.id);
    const seen = new Set<string>(); const dups = new Set<string>();
    for (const i of ids) { if (seen.has(i)) dups.add(i); seen.add(i); }
    if (dups.size) out.push({ kind: "duplicate-id", detail: Array.from(dups).slice(0, 10).join(", ") });

    // Visible raw error text or obvious template leaks.
    const bodyText = document.body.innerText || "";
    if (/\bNaN\b/.test(bodyText)) out.push({ kind: "nan-rendered", detail: "literal 'NaN' visible in page text" });
    if (/undefined|\[object Object\]/.test(bodyText)) out.push({ kind: "bad-value-rendered", detail: "'undefined' or '[object Object]' visible" });
    return out;
  }, vw);
  for (const i of issues) findings.push({ route, kind: i.kind, detail: i.detail });
}

test.describe("authenticated UI audit (read-only)", () => {
  for (const r of ROUTES) {
    test(`${r.name} (${r.path})`, async ({ page }, testInfo) => {
      const project = testInfo.project.name;
      projectName = project;
      const vw = page.viewportSize()?.width ?? 1280;
      const tag = `${r.name}-${project}`;
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push({ route: tag, text: m.text() }); });
      page.on("pageerror", (e) => pageErrors.push({ route: tag, text: String(e) }));

      await page.goto(r.path, { waitUntil: "domcontentloaded" }).catch(() => {});
      // Let the SPA route render + data settle (RPCs/REST). No interaction — read-only.
      await page.waitForTimeout(1800);

      const url = new URL(page.url());
      const redirectedHome = url.pathname === "/" && r.path !== "/";
      const redirectedSignin = url.pathname.startsWith("/sign-in");
      if (redirectedSignin) {
        findings.push({ route: tag, kind: "auth-lost", detail: `redirected to sign-in from ${r.path}` });
      } else if (redirectedHome && r.needs) {
        findings.push({ route: tag, kind: "role-gated-skip", detail: `${r.path} redirected home (account lacks ${r.needs})` });
      } else {
        // Stuck-on-loading detector.
        const loading = await page.getByText(/^Loading…?$/).count().catch(() => 0);
        if (loading > 0) findings.push({ route: tag, kind: "stuck-loading", detail: `'Loading…' still visible after 1.2s on ${r.path}` });
        await probe(page, tag, vw);
      }
      await page.screenshot({ path: `e2e/screens/authed-${project}-${r.name}.png`, fullPage: true });
    });
  }

  test.afterAll(async () => {
    fs.mkdirSync("e2e/reports", { recursive: true });
    fs.writeFileSync(
      `e2e/reports/authed-${projectName}.json`,
      JSON.stringify({ project: projectName, findings, consoleErrors, pageErrors }, null, 2),
    );
  });
});
