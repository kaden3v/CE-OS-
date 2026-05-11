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

## What's NOT done yet — pass 4

### Pass 4: real backend + remaining tax artifacts

- **Plaid connector** — `/api/finance/bank-feed` endpoint, OAuth flow stored in a separate `plaidAccessToken` env var. Replaces the `MOCK_BANK_FEED` in `ReconcileModal.tsx` with live data and pushes new transactions through webhook → candidate-match queue.
- **Stripe payout reconciliation** — match Shopify orders → Stripe payouts → bank deposits. The three-way match is the hardest part of e-commerce bookkeeping.
- **1099-K reported totals auto-sync** — pull the gross from Shopify Payments and Etsy APIs (or CSV upload) so users don't have to type the reported numbers.
- **Schedule C as PDF** — the data is already structured (see `buildScheduleC()`); a PDF renderer (jsPDF or similar) generates a filing-ready document. CSV already ships.
- **QuickBooks IIF / Xero CSV / Wave CSV exports** — vendor-specific format adapters on top of the same data.
- **Receipt upload pipeline** — wire the existing UI affordance to a real attachment store (S3 / Vercel Blob). OCR pass to auto-populate vendor/amount.
- **Depreciation schedule** — equipment > $2,500 capitalized to 1500 Equipment & Fixtures, depreciated over 5–7 years via journal entries to 6050 Depreciation.
- **Quarterly estimated tax with safe-harbor** — replace the flat 30% placeholder with the proper "lesser of 100% of last year's tax or 90% of this year's projected tax" calc.

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
