# Finance panel — review + rebuild plan

This doc captures the state of the Finances panel after Pass 1 of the Option-B rebuild ("Real bookkeeping"), and what's coming in Passes 2–4.

---

## What was wrong (pre-rebuild)

Reviewed [Expenses.tsx](../src/pages/Expenses.tsx), [Supplies.tsx](../src/pages/Supplies.tsx), [Vendors.tsx](../src/pages/Vendors.tsx), [TaxReport.tsx](../src/pages/TaxReport.tsx), [YearEndSnapshot.tsx](../src/pages/YearEndSnapshot.tsx). Findings:

1. **No source of truth.** Every page seeded from a hardcoded array. Adding an expense pushed to React state — refresh and the entry disappeared.
2. **No drill-down.** Every number on TaxReport was dead text. `$4,120 Shipping & Postage` had no relationship to the rows that composed it.
3. **No reconciliation.** No notion of matched / unmatched. Numbers could drift silently against bank reality.
4. **No period model.** TaxReport hardcoded 2026. YearEndSnapshot hardcoded 2023. Stat tiles like "Spend (This Month) $716.10" were string literals.
5. **Exports were toasts.** `handleExport → addToast({ title: "Export Started" })`. No file generated.
6. **No audit trail.** Edits would overwrite. Closed periods didn't exist.
7. **No chart of accounts.** Categories were free-form strings; no GL codes; no Schedule C mapping.
8. **No tax-prep specifics.** No mileage, depreciation, home office, quarterly estimated tax, sales tax.
9. **None of the pages used the new shell** — they were stuck on the old DataTable / modals / topbar.
10. **Smaller things:** click-row dead-ends; no add-supply affordance; vendor-memory didn't auto-categorize; `text-ok` (non-existent class) at [YearEndSnapshot.tsx:60](../src/pages/YearEndSnapshot.tsx:60).

Verdict: closer to a Notion template than to QuickBooks.

---

## Pass 1 (this turn) — what landed

### Domain model — `src/lib/finance/`

| File | Purpose |
| ---- | ------- |
| [types.ts](../src/lib/finance/types.ts) | `Account`, `JournalEntry`, `JournalLine`, `FiscalPeriod`, `ReconciliationStatus`, `TransactionView`, `AccountingMethod`. |
| [accounts.ts](../src/lib/finance/accounts.ts) | Full chart of accounts. 30+ GL codes mapped to IRS Schedule C line numbers. `suggestAccountForVendor()` for auto-categorization. |
| [period.ts](../src/lib/finance/period.ts) | Period math. MTD/QTD/YTD/Month/Quarter/Year/Custom presets. Returns `{ current, previous }` so every page can render prev-period deltas. |
| [store.ts](../src/lib/finance/store.ts) | In-memory ledger with the immutable-journal pattern. `postExpense`, `correctExpense` (supersedes never mutates), `updateReconciliation`, `listTransactions`, `totalsByAccount`. |
| [csv.ts](../src/lib/finance/csv.ts) | RFC 4180 CSV serializer + browser-download trigger. Real files, not toasts. |

### Components — `src/components/finance/`

- [PeriodPicker.tsx](../src/components/finance/PeriodPicker.tsx) — single picker that drives every finance page. Shows accounting method as a chip in the trigger.

### Drawer config

- [expense.tsx](../src/components/record/configs/expense.tsx) — `RecordDrawer` configuration for transactions. Inline editing posts correcting entries via `correctExpense` (with required reason). Reconciliation actions (Mark reviewed / Flag disputed / Reset) live in the action menu. Schedule C line shown as a read-only property.

### Page migration

- [src/pages/Expenses.tsx](../src/pages/Expenses.tsx) — full rewrite:
  - Uses new shell (Topbar with PeriodPicker + Export CSV + New expense)
  - Stat tiles **computed** from `transactions` data, with delta-vs-previous-period
  - DataTable with sort, filter pills, group-by (GL account or status), bulk actions (Mark reviewed / Flag disputed)
  - Reconciliation status column (dot + label)
  - GL account column with 4-digit code
  - Schedule C column shows mapping line
  - URL params drive drill-down: `?account=6170` filters to Shipping & Postage, `?recon=disputed` filters to disputed only
  - Row click opens RecordDrawer (`?id=…`), `j`/`k` walks next/prev
  - CSV export downloads a real file with current filter/sort state, named like `expenses-2025-ytd-2025-05-10.csv`

### Settings UI

- Added a **Finance** section in [Settings.tsx](../src/pages/Settings.tsx) with:
  - **Accounting method** toggle (cash | accrual). Wired into `AppContext.settings.accountingMethod`; the store's projections respect it.
  - **Fiscal year start** selector. Stored in settings; not yet consumed by period math (calendar year only for now). Pass 2 wires this through.

---

## The key design decisions

### Immutable journals (no editing-in-place)

Every "edit" of a transaction posts a new `JournalEntry` whose `supersedes` field points at the original. The original is marked `supersededBy` but its `lines` are never touched. List views filter out superseded entries by default; the audit log can replay history exactly.

Why: without this you can't pass an audit, can't close periods cleanly, and "who changed what when" lives in a flaky separate log.

### Cash vs accrual as a runtime toggle

Every `JournalEntry` stores both `serviceDate` (when work happened) and `cashDate` (when money moved). The period filter picks one based on `settings.accountingMethod`. Vendor invoice on terms? `serviceDate` is today, `cashDate` is null until paid — accrual sees it now, cash sees it on settlement.

Why: choosing one and hardcoding it would force a migration the moment your accountant disagrees with your default.

### GL codes everywhere

Expenses don't have "category" strings anymore — they reference a 4-digit GL code that has a Schedule C line attached. The tax report stops being a hand-typed summary and becomes `SELECT account, SUM(amount) FROM transactions GROUP BY account` projected by Schedule C line.

Why: this is what separates "I keep a spreadsheet" from "I have books."

### Drill-down via URL params

Click "$4,120 Shipping & Postage" on the Tax Report → navigate to `/finances/expenses?account=6170&period=…` and see the rows that compose it, with a clear "Drill-down active" chip and a way to clear back to the unfiltered view. Copyable, bookmarkable, back-button-safe.

---

## Pass 2 (landed) — rest of the panel + reason capture + fiscal year wiring

| Page / File | What changed |
| ----------- | ------------ |
| [Vendors.tsx](../src/pages/Vendors.tsx) | New shell + DataTable. YTD totals projected from the ledger via `listVendors()`. RecordDrawer drills into the vendor's transaction history (click any entry → opens that expense). New [`configs/vendor.tsx`](../src/components/record/configs/vendor.tsx) drawer config. |
| [Supplies.tsx](../src/pages/Supplies.tsx) | New shell. Card grid preserved (right visual for low-count inventory). Low-stock chip in the topbar. "Reorder" action navigates to Expenses with vendor pre-filled. "Add supply" dialog with GL category mapping. |
| [TaxReport.tsx](../src/pages/TaxReport.tsx) | Every number computed from the ledger; every line a drill-down to filtered Expenses. Deductions grouped by Schedule C line. Stat tiles with YoY delta (positive direction is contextual — revenue up is good, expenses up is bad). Caveat banner makes "draft only" status unmistakable. Real CSV export. |
| [YearEndSnapshot.tsx](../src/pages/YearEndSnapshot.tsx) | Now lives at `/finances/tax-report/year-end/:year` (also reachable from a "Year-end snapshot" button on TaxReport when a full year is selected). Year selector in-page. Top-six expense categories with proportional bars. Notes & adjustments cards staged for Pass 3 (editable + audit-logged). Lock chip indicates read-only intent (real locking lands in Pass 3). |
| [PeriodPicker.tsx](../src/components/finance/PeriodPicker.tsx) | Now consumes `fiscalYearStartMonth`. The "Year to date" preset becomes "Fiscal YTD" when the setting is non-January, and the underlying date math anchors to the fiscal start month. |
| [period.ts](../src/lib/finance/period.ts) | `defaultPeriod(fiscalYearStartMonth)`. The `ytd` resolver now picks the correct fiscal year based on today vs. fiscal start, and labels accordingly (`FY2025 YTD` vs. `2025 YTD`). |
| [ReasonModal.tsx](../src/components/record/ReasonModal.tsx) | Replaces `window.prompt` for correction reasons. Required min-length, before/after diff shown, ⌘↵ submits. Used by Expenses.tsx for every inline edit on a transaction. |
| [store.ts](../src/lib/finance/store.ts) | Added `revenueEntry()` helper + 10 seed revenue entries so TaxReport has data to project. Added `listRevenue`, `revenueTotalCents`, `monthlyCashFlow` projections. |
| [registry.ts](../src/lib/nav/registry.ts) | Palette keywords for tax/expenses/vendors. New action: "Drill into expenses by GL account" (palette → enter 4-digit code → navigates to filtered view). |
| [App.tsx](../src/App.tsx) | Added `/finances/tax-report/year-end/:year` route. |

## Pass 3 (landed) — enforcement + polish

| Area | What changed |
| ---- | ------------ |
| **Reactive store** | [store.ts](../src/lib/finance/store.ts) now exposes `useFinanceStore(selector)` backed by `useSyncExternalStore`. Every mutator (`postExpense`, `correctExpense`, `updateReconciliation`, `closePeriod`, `reopenPeriod`) bumps a version and notifies subscribers. The `tick`/`refresh` hack in pages is gone — they re-render automatically. |
| **Period close + lock** | `closePeriod({ kind, start, end, id })` writes a `FiscalPeriod` to the store. `postExpense` and `correctExpense` now call `assertPeriodOpen()` and refuse with an explicit error when the target date falls in a closed period. `reopenPeriod(id, reason)` allows controlled reopening; the reason is audit-logged. New [`<ClosePeriodButton>`](../src/components/finance/ClosePeriodButton.tsx) in the TaxReport topbar shows a type-to-confirm close dialog when the period is open, and a "Reopen …" button with a reason prompt when it's closed. Expenses surfaces a banner when the active period is closed. |
| **Audit log integration** | New `logAudit()` inside the store; every mutation appends. [`AuditLog.tsx`](../src/pages/AuditLog.tsx) reads via `useFinanceStore(() => listAuditEntries(...))` and merges into the synthetic seed, so finance changes appear there immediately and reactively. |
| **Journal-entry chain in activity feed** | The expense drawer's Activity tab now renders the full supersedes chain plus reconciliation history (sourced from `getEntryChain()` and `listAuditEntries({ entryId })`). Correction reasons show up inline. |
| **Editable amount + cashDate** | The expense drawer can now correct amount and cash date in addition to the previously-supported fields. Both flow through the immutable-journal `correctExpense` path with required reason. |
| **Sticky totals row** | A summary row sits beneath the Expenses table showing transaction count, deductible count, deductible total, and grand total — all computed from the visible (filtered) data. |
| **Receipt panel** | The drawer's overview body now has a dedicated Receipt section: a clickable file chip when present, an "Attach receipt" upload affordance when not. The native file picker opens; upload pipeline lands in Pass 4. |
| **Schedule C draft export** | New [scheduleC.ts](../src/lib/finance/scheduleC.ts) builds a draft mapping every contributing GL account to its Schedule C line. TaxReport has a "Schedule C draft" button that downloads the CSV. The CSV includes line number, label, amount, and a detail column listing GL contributors per line. |
| **1099-K reconciliation worksheet** | New page at `/finances/tax-report/1099k` ([Form1099K.tsx](../src/pages/Form1099K.tsx)). Operator enters reported gross from each payment processor; ledger revenue is computed; the delta is flagged with confidence-style badges. Includes common-explanations footer for CPA handoff. Linked from the TaxReport topbar. |
| **Bulk reconcile modal** | New [ReconcileModal.tsx](../src/components/finance/ReconcileModal.tsx). Select rows in Expenses → "Reconcile against bank…" → modal proposes a mocked bank-line match per transaction with a confidence score (amount + date proximity + vendor-token overlap). User accepts/skips individually or accepts all. Confirmed matches post via `updateReconciliation` and flow through to the audit log. |

## Pass 4 (landed) — integrations, tax artifacts, and the bookkeeping ceiling

The bookkeeping panel is now genuinely usable end-to-end. The integration surfaces are in place; turning each from sandbox/mock to live is a credential-paste-and-restart, not a code change.

### Integrations (server-side, in [`server/`](../server/))

| File | What |
| ---- | ---- |
| [`server/plaid/client.ts`](../server/plaid/client.ts) | Plaid REST client (no SDK). `createLinkToken`, `exchangePublicToken`, `fetchTransactions`. Reads `PLAID_CLIENT_ID` / `PLAID_SECRET` / `PLAID_ENV` / `PLAID_ACCESS_TOKEN`. |
| [`server/stripe/client.ts`](../server/stripe/client.ts) | Stripe REST client (no SDK). `listPayouts`, `listBalanceTransactions`, `grossChargesInRange`. Reads `STRIPE_SECRET_KEY`. |
| [`server/shopify/sales.ts`](../server/shopify/sales.ts) | `grossSales({ startDate, endDate })` — sums Shopify order totals over a range (drives the 1099-K Shopify Sync). |
| [`server/finance/bankFeed.ts`](../server/finance/bankFeed.ts) | `listBankLines()` — Plaid when configured, deterministic mock fixture otherwise. |
| [`server/finance/receipts.ts`](../server/finance/receipts.ts) | Local-FS receipt store under `uploads/receipts/`. Production drop-in for S3 / Vercel Blob is one function. |

### Routes (in [`server/index.ts`](../server/index.ts))

- `GET  /api/finance/bank-feed?start=&end=` — Plaid / mock bank lines
- `POST /api/finance/plaid/link-token` — start the Plaid Link flow
- `POST /api/finance/plaid/exchange` — swap a public_token for the long-lived access token
- `GET  /api/finance/processor-gross?channel=Shopify|Stripe|Etsy&start=&end=` — gross volume for 1099-K Sync
- `POST /api/finance/receipts?journalId=…` (raw body, mime-aware) — receipt upload
- `GET  /api/finance/receipts/<journalId>/<filename>` — receipt download

### Client wiring

- [`ReconcileModal`](../src/components/finance/ReconcileModal.tsx) now fetches `/api/finance/bank-feed` on open, sized to the date span of the selected transactions. Header chip shows `Plaid · live` or `Mock feed · Plaid not configured` so you can see at a glance whether the match is against real data.
- [`Form1099K`](../src/pages/Form1099K.tsx) has a Sync button per channel that calls `/api/finance/processor-gross`. Shopify and Stripe wire to real APIs; Etsy is marked unavailable until OAuth lands.
- [`ReceiptPanel`](../src/components/record/configs/expense.tsx) opens the native file picker, uploads via `uploadReceipt()` in [`src/lib/api.ts`](../src/lib/api.ts), and replaces itself with a clickable chip on success.

### Tax artifacts

- [`scheduleC.ts`](../src/lib/finance/scheduleC.ts) — already shipped in Pass 3. Now consumed by:
  - The **Schedule C CSV** export on TaxReport (data only).
  - The new **Schedule C PDF** flow: [`/finances/tax-report/schedule-c-print/:year`](../src/pages/ScheduleCPrint.tsx) renders a clean printable view; "Schedule C PDF" on TaxReport opens it in a new tab with `?print=1` and auto-launches the browser's print dialog. Save-as-PDF is built into every major browser; no PDF library is added.
- [`quickbooks.ts`](../src/lib/finance/exports/quickbooks.ts) — IIF builder for QuickBooks Desktop. `!ACCNT` header + `TRNS`/`SPL`/`ENDTRNS` rows per journal entry. Skips superseded entries.
- [`xero.ts`](../src/lib/finance/exports/xero.ts) — Manual Journals CSV builder for Xero. One row per journal line; debits positive, credits negative.
- All exports live in a single **Export** dropdown on TaxReport: Schedule C PDF, Schedule C CSV, full tax-report CSV, QuickBooks IIF, Xero CSV.

### Asset register + depreciation

- New [`/finances/assets`](../src/pages/Assets.tsx) page (also in the registry under Reports).
- [`assets.ts`](../src/lib/finance/assets.ts) — capitalize an asset (>$2,500, life >1 year), and project a straight-line schedule per row through useful life. Reactive store mirroring the journal pattern.
- Per-asset cards show opening book → depreciation → accumulated → closing book per year. Current year highlighted. Seed includes LED grow rig, climate controller, and potting bench so the page demonstrates real numbers.
- `totalDepreciationForYear()` is the hook into the tax report — a follow-up pass auto-posts depreciation entries to the ledger at year-end close.

### Safe-harbor quarterly tax

- [`tax.ts`](../src/lib/finance/tax.ts) — `safeHarbor()` returns the IRS lesser-of: (a) 100% (or 110% if prior AGI > $150k) of prior-year tax, vs (b) 90% of projected current-year tax. `annualizeYtd()` extrapolates the YTD net profit linearly through year-end.
- Settings: new inputs for **Prior-year tax liability** (1040 line 24) and **Prior-year AGI** (1040 line 11) under the Finance section. Both default to $0; the TaxReport tile then prompts the user to set them.
- TaxReport tile reads "Quarterly est. tax" with the correct safe-harbor basis instead of a flat 30% — and the draft banner now explains exactly which basis is binding.

### env additions

```env
PLAID_CLIENT_ID=""
PLAID_SECRET=""
PLAID_ENV="sandbox"
PLAID_ACCESS_TOKEN=""
STRIPE_SECRET_KEY=""
```

Without these, the relevant endpoints fall back to sensible mocks or report `source: 'unavailable'`. Setting them lights up live data.

### Setup walkthrough (Pass 4 additions)

1. **Plaid** — Dashboard → Apps → new app → grab Sandbox `client_id` + `secret`. Paste into `.env`. Restart `npm run dev:server`. The bank-feed chip should flip to "Plaid · live" once you do a Link flow and paste `PLAID_ACCESS_TOKEN`.
2. **Stripe** — Dashboard → API keys → Restricted key with read access to balance/balance-transactions/payouts/charges. Paste into `.env`. Form1099K Sync (Stripe) works immediately.
3. **Shopify gross totals** — already wired via the existing Shopify GraphQL client from the earlier Shopify slice. Make sure the admin app has `read_orders` scope.
4. **Receipts** — no extra setup. Dev writes to `uploads/receipts/` (gitignored). Production: replace the body of `storeReceipt()` with an S3/Vercel Blob writer.

## What's NOT done yet — pass 5

### Pass 5: production hardening

These are the gaps you'll feel only once Plaid + Stripe + receipts are live and the data volume grows past a few hundred transactions:

- **Persistent storage** — the in-memory `JOURNAL`, `AUDIT`, `PERIODS`, and `ASSETS` need to live somewhere durable. The shape is right for a 1:1 mapping to Postgres or SQLite tables. Replace the module-scoped arrays with a DB client.
- **Receipt OCR** — pipe uploads through a vision model to auto-extract vendor + amount + date, pre-filling the expense form. (Anthropic, Mindee, AWS Textract are all reasonable.)
- **Plaid webhook** — `POST /api/finance/plaid/webhook` for `TRANSACTIONS_UPDATE` events. Pushes candidate matches into a queue so the operator sees new bank lines without manual refresh.
- **Stripe payout three-way match** — Shopify order → Stripe charge → Stripe payout → bank deposit. The hardest part of e-commerce books and the most common source of "where did this $X come from" pain.
- **Etsy 1099-K auto-pull** — needs Etsy OAuth approval per shop. Etsy doesn't have a sandbox; setup is heavier than Plaid/Stripe.
- **Depreciation auto-posting** — extend the period-close routine to journal each asset's annual depreciation to 6050 Depreciation / 1600 Accumulated Depreciation. Today the schedule is informational only.
- **Multi-currency** — every cents value would gain a `currency` field; FX-rate snapshot table for period-end translation.
- **Wave / FreshBooks / Cash App / Quicken adapters** — additional export targets on top of the same data, following the QuickBooks/Xero pattern.
- **Per-state sales-tax remittance log** — if you sell into nexus states, the sales-tax payable account (2010) needs a sub-ledger by jurisdiction.
- **Section 179 / bonus depreciation** — for the year the asset is placed in service. A tax-prep choice rather than a bookkeeping one, but the Schedule C export should be able to model it.

---

## Things to know before pushing this to production

1. **The store is in-memory.** All mutations through Pass 2 live in process memory — refresh the tab and they're gone. Seed data resets on page load. Real backend lands when we wire `/api/finance/journal` (mirroring the existing `/api/orders` shape).

2. **Hardcoded user "Kaden"** in `createdBy` / `closedBy` / reviewer fields. Wire to a real auth user once auth exists.

3. **No multi-currency.** Every amount is USD cents. International shipping → add a `currency` field on `JournalEntry` + an FX-rate snapshot table.

4. **No depreciation schedule.** Equipment > $2,500 should depreciate over years 5–7. Pass 4 territory.

5. **Etsy/Shopify revenue is seeded, not synced.** Pass 4's Plaid + Shopify-payout integration replaces the seed entries with real ones.

6. **Bank feed used by the reconcile modal is mocked.** [`MOCK_BANK_FEED`](../src/components/finance/ReconcileModal.tsx) in `ReconcileModal.tsx` is the placeholder; Pass 4 swaps it for Plaid output.

---

## Quick test plan (Pass 1)

1. `npm run dev` → navigate to `/finances/expenses`.
2. Period picker: change between Month / Quarter / YTD; tiles + table update; delta-vs-previous renders correctly on year-over-year.
3. Toggle accounting method in Settings → return to Expenses → entries without a `cashDate` (the Carnivero wholesale row) appear under accrual, disappear under cash.
4. Click any row → drawer opens with `?id=…` URL.
5. Click a value in the drawer → reason prompt → correcting entry posts; original is marked superseded (not visible in the list).
6. Bulk-select a few rows → action bar slides up → "Mark reviewed" → rows update.
7. Click "Export CSV" → file downloads, opens cleanly in Excel/Numbers with all visible columns.
8. URL-drill-down: visit `/finances/expenses?account=6170` → only Shipping & Postage rows show; "Drill-down active" chip lets you clear.
