# Finance E2E (Playwright)

Smoke tests for the consolidated Finance dashboard, run on desktop (Chrome) and
mobile (Pixel 5) viewports — also the responsive check the audit brief asked for.

## Run

The app uses real Supabase auth, so the tests sign in through the form. Provide a
Canyon Exotics login with **owner or manager** role:

```bash
E2E_EMAIL=you@example.com E2E_PASSWORD=yourpassword npm run e2e
```

- `playwright.config.ts` boots `npm run dev` (port 3000) automatically.
- First run only: `npx playwright install chromium` to fetch the browser.
- Requires a local `.env` with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

The `setup` project authenticates once and saves the session to
`e2e/.auth/state.json`; the `desktop` and `mobile` projects reuse it.
Screenshots are written to `e2e/screens/<project>-*.png`.

## What it covers

- Overview: KPI tiles (Net Revenue / Net Profit / Total Expenses / AOV), the
  unit-economics strip (Shipping margin, Sales tax to remit), the income set-aside
  nudge, and the expandable net-profit waterfall ("show your work").
- IA: the nine former finance pages collapsed to one entry with in-page tabs;
  tab navigation stays within the section.
