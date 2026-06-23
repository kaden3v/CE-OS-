import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";

/**
 * Unauthenticated UI audit of every surface reachable WITHOUT a Supabase
 * session: the sign-in / request-access / forgot-password views and the
 * reset-password screen, on whatever viewport the running project defines.
 *
 * It does not hard-fail on the first problem — it collects console errors,
 * runtime errors, responsive overflow, and lightweight a11y findings across
 * all views and writes them to e2e/reports/public-<project>.json, plus
 * screenshots to e2e/screens/. Hard expects are reserved for "the app must
 * boot and redirect" invariants.
 */

interface Finding {
  view: string;
  kind: string;
  detail: string;
}

const findings: Finding[] = [];
const consoleErrors: { view: string; text: string }[] = [];
const pageErrors: { view: string; text: string }[] = [];

function record(view: string, kind: string, detail: string) {
  findings.push({ view, kind, detail });
}

/** Lightweight in-page a11y + layout probes. Returns structured issues. */
async function probe(page: Page, view: string, viewportWidth: number) {
  const issues = await page.evaluate((vw) => {
    const out: { kind: string; detail: string }[] = [];

    // Horizontal overflow (a classic responsive bug).
    const doc = document.documentElement;
    if (doc.scrollWidth > vw + 1) {
      out.push({
        kind: "overflow-x",
        detail: `document scrollWidth ${doc.scrollWidth}px > viewport ${vw}px`,
      });
    }
    // Any element wider than the viewport (find the worst offenders).
    const wide = Array.from(document.querySelectorAll<HTMLElement>("*"))
      .filter((el) => el.getBoundingClientRect().width > vw + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").slice(0, 2).join(".")}`);
    if (wide.length) out.push({ kind: "wide-element", detail: wide.join(", ") });

    // Inputs/textareas without an accessible name (label[for], aria-label, or wrapping label).
    const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea, select"));
    for (const f of fields) {
      if (f.type === "hidden") continue;
      const id = f.getAttribute("id");
      const hasLabelFor = id ? !!document.querySelector(`label[for="${CSS.escape(id)}"]`) : false;
      const hasAria = !!f.getAttribute("aria-label") || !!f.getAttribute("aria-labelledby");
      const wrapped = !!f.closest("label");
      const placeholder = f.getAttribute("placeholder");
      if (!hasLabelFor && !hasAria && !wrapped) {
        out.push({
          kind: "field-no-accessible-name",
          detail: `${f.tagName.toLowerCase()}[type=${(f as HTMLInputElement).type || "?"}] id=${id ?? "(none)"} placeholder=${placeholder ?? "(none)"}`,
        });
      }
    }

    // Buttons with no discernible text / aria-label (icon-only buttons).
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    for (const b of buttons) {
      const text = (b.textContent || "").trim();
      const aria = b.getAttribute("aria-label");
      const title = b.getAttribute("title");
      if (!text && !aria && !title) {
        out.push({ kind: "button-no-name", detail: `<button> at ${b.outerHTML.slice(0, 80)}…` });
      }
    }

    // Images without alt.
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("img"));
    for (const im of imgs) {
      if (im.getAttribute("alt") === null) out.push({ kind: "img-no-alt", detail: im.src });
    }

    // Duplicate ids (breaks label association + a11y).
    const ids = Array.from(document.querySelectorAll<HTMLElement>("[id]")).map((e) => e.id);
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const i of ids) {
      if (seen.has(i)) dups.add(i);
      seen.add(i);
    }
    if (dups.size) out.push({ kind: "duplicate-id", detail: Array.from(dups).join(", ") });

    // Exactly one h1 is good practice.
    const h1s = document.querySelectorAll("h1").length;
    if (h1s !== 1) out.push({ kind: "h1-count", detail: `found ${h1s} <h1> elements` });

    return out;
  }, viewportWidth);

  for (const i of issues) record(view, i.kind, i.detail);
}

function attach(page: Page, getView: () => string) {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push({ view: getView(), text: msg.text() });
  });
  page.on("pageerror", (e) => pageErrors.push({ view: getView(), text: String(e) }));
}

test.describe("public UI audit", () => {
  test("sign-in, request-access, forgot-password, reset-password", async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    const vw = page.viewportSize()?.width ?? 1280;
    let currentView = "signin";
    attach(page, () => currentView);

    // --- Protected route should redirect to sign-in ---
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    // A random deep protected route should also bounce to sign-in.
    await page.goto("/finances/reports");
    await expect(page).toHaveURL(/\/sign-in/);

    // --- Sign-in view ---
    currentView = "signin";
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await probe(page, "signin-" + project, vw);
    await page.screenshot({ path: `e2e/screens/public-${project}-signin.png`, fullPage: true });

    // Wrong-credentials error path (real backend; expect a friendly error, not a crash).
    await page.getByPlaceholder("you@example.com").fill("nobody-" + Date.now() + "@example.com");
    await page.getByPlaceholder("••••••••").fill("definitely-wrong-pw");
    await page.getByRole("button", { name: "Sign in" }).click();
    const errLoc = page.locator(".text-status-alert");
    try {
      await errLoc.waitFor({ state: "visible", timeout: 12_000 });
      record("signin-" + project, "info-wrong-creds-msg", (await errLoc.first().textContent())?.trim() || "(empty)");
    } catch {
      record("signin-" + project, "wrong-creds-no-feedback", "no .text-status-alert appeared within 12s after bad login");
    }

    // --- Request access view ---
    currentView = "request";
    await page.getByRole("button", { name: "Request access" }).click();
    await expect(page.getByRole("heading", { name: "Request access" })).toBeVisible();
    await probe(page, "request-" + project, vw);
    await page.screenshot({ path: `e2e/screens/public-${project}-request.png`, fullPage: true });

    // Inline validation: short password + mismatch should surface hints and keep submit disabled.
    await page.getByPlaceholder("you@example.com").fill("tester@example.com");
    await page.getByPlaceholder("At least 8 characters").fill("short");
    const submitReq = page.getByRole("button", { name: /Submit request/ });
    if (await submitReq.isEnabled()) record("request-" + project, "submit-enabled-while-invalid", "Submit enabled with <8 char password");
    await page.getByPlaceholder("At least 8 characters").fill("longenough1");
    // confirm field is the second password input
    const confirmInput = page.locator("#req-confirm");
    await confirmInput.fill("doesnotmatch");
    if (await submitReq.isEnabled()) record("request-" + project, "submit-enabled-on-mismatch", "Submit enabled when passwords mismatch");

    // Back to sign-in via the X (aria-label="Back to sign in")
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    // --- Forgot password view ---
    currentView = "forgot";
    await page.getByRole("button", { name: "Forgot?" }).click();
    await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
    await probe(page, "forgot-" + project, vw);
    await page.screenshot({ path: `e2e/screens/public-${project}-forgot.png`, fullPage: true });

    // --- Reset-password screen (no recovery session → should redirect to sign-in after ~2s) ---
    currentView = "reset-password";
    await page.goto("/reset-password");
    await probe(page, "reset-password-" + project, vw);
    await page.screenshot({ path: `e2e/screens/public-${project}-reset.png`, fullPage: true });
    await page.waitForURL(/\/sign-in/, { timeout: 6_000 }).catch(() => {
      record("reset-password-" + project, "no-redirect", "reset-password did not redirect to sign-in without a session");
    });

    // --- Write the report (last test wins per project; we tag by project in the data) ---
    fs.mkdirSync("e2e/reports", { recursive: true });
    fs.writeFileSync(
      `e2e/reports/public-${project}.json`,
      JSON.stringify(
        {
          project,
          viewportWidth: vw,
          findings: findings.filter((f) => f.view.endsWith(project)),
          consoleErrors,
          pageErrors,
        },
        null,
        2,
      ),
    );

    // Hard invariant: zero uncaught runtime errors across the public surface.
    expect(pageErrors, `runtime errors:\n${pageErrors.map((e) => e.text).join("\n")}`).toHaveLength(0);
  });
});
