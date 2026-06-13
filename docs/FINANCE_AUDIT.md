# CE-OS Finance — Forensic Logic Audit (real system)

Date: 2026-06-12 · Branch `claude/fervent-swanson-d67c42` · Project ref `jagcnaxdxiummknyrxhj`
Org `68750d73-aec9-48b0-87b8-207d4fd299e9` · 212 orders, 1,281 expense rows, 1 owner.

Method: every `finance_*` server function independently re-derived with fresh raw SQL by
separate verification agents and confirmed to the cent; all 9 finance pages swept for
float / timezone / NaN / mock / reconciliation / drill-down gaps. Production data treated
as untrusted until proven from source.

## Verdict

The finance layer is **architecturally sound**. All aggregation is server-side and funnels
through one helper (`_finance_kpi_window`), so Overview, P&L, Cash Flow, Revenue-by-channel,
and Revenue-trend **reconcile to the cent by construction** (verified: YTD net revenue =
$8,749.11 across all four surfaces; Σ monthly net profit = YTD net profit = $4,411.43, diff
$0.00). Timezone bucketing is correct America/Phoenix everywhere (71/212 orders have a
UTC≠Phoenix date; the 3 boundary orders bucket correctly). RLS is enabled with a policy on
all 11 finance tables; functions are SECURITY INVOKER (no cross-org leak). Refunds are not
double-removed; net profit is correctly cash-basis (no COGS term in the deployed function).

It is **not** error-free. One CRITICAL revenue-recognition bug overstates profit ~12.6%, plus
two HIGH issues and several cleanups.

## Reconciled ground truth (YTD 2026, to the cent)

| Field | Server value | Note |
|---|---:|---|
| gross_sales | $8,750.35 | = Σ orders.total — **includes $556.81 sales tax** (the bug) |
| refunds | $0.00 | no refunded/cancelled orders exist |
| channel_fees (modeled) | $1.24 | Shopify only; Etsy gated out (`import_actuals=true`) |
| net_revenue | $8,749.11 | gross − refunds − modeled fees |
| expenses | $4,337.68 | incl. imported Etsy fees $991.98, postage $2,230.43, ads $1,115.27 |
| net_profit (cash basis) | **$4,411.43** | net_revenue − expenses − mileage |
| **corrected net_profit** | **≈ $3,857** | after netting out Etsy-remitted sales tax (−$554.47) |

Independent cross-check (product subtotal $6,435.67 + shipping $1,753.95 − fees $909 − postage
$2,230 − ads $1,115 − subs $83 = **$3,851.94**) lands within ~$5 of the corrected server figure.

---

## Findings

### C1 — Marketplace-facilitator sales tax is counted as revenue · CRITICAL
`_finance_kpi_window` · `gross_sales = sum(orders.total)`, and `orders.total` includes
`orders.tax`. For Etsy (a marketplace facilitator) the sales tax is collected **and remitted
by Etsy** — K never receives or remits it — yet nothing on the cost side removes it, so the
full **$556.81 YTD** ($554.47 Etsy + $2.34 Shopify) flows untouched into `gross_sales →
net_revenue → gross_profit → net_profit`. **Net profit is overstated ~12.6%** ($4,411 vs
≈$3,857). Month: +$56.92.
**Fix:** net out facilitator tax from revenue — `o.total − coalesce(o.tax,0)` (or
`o.subtotal + o.shipping`) in the gross/refunds CTEs, ideally gated by a per-channel
`tax_remitted_by_marketplace` flag (Etsy = true). Apply symmetrically to the refunds term.

### H1 — 14 imported Etsy orders inflate gross by a flat $0.28 each · HIGH
`orders` · 14 etsy/delivered orders have `total = subtotal+shipping+tax + $0.28` (a constant,
not a rate). Σ = **$3.92**, all in YTD. Because every view derives gross from `orders.total`,
this $3.92 silently inflates revenue/profit. Likely an Etsy regulatory/operating fee merged
into total at import. Example: `etsy:3993433511` (70.47+0+6.25 = 76.72, total 77.00).
**Fix:** in the Etsy importer, store the adjustment in its own column (so
`total = subtotal+shipping+tax+adjustment` holds) or recompute total on import. Add a CHECK /
nightly assertion `abs(total-(subtotal+shipping+tax)) < 0.005`.

### H2 — Cross-surface revenue definitions diverge once a refund exists · HIGH (latent)
`finance_revenue_by_channel` / `finance_revenue_trend` compute `net = gross − fees` and **omit
refunds**, and define per-channel `gross` as `sum(total) FILTER (status NOT IN cancelled,
refunded)` — whereas `_finance_kpi_window` includes refunded in `gross_incl` then subtracts
`refunds`. Today (0 refunds) all surfaces agree to the cent; the **first refund** makes the
per-channel `gross` stop tying to `finance_kpis.gross_sales`.
**Fix:** unify on one convention (gross includes refunded; `net = (gross − refunds) − fees`)
across all surfaces; add a regression test that inserts one refunded order and asserts
per-channel gross/net tie to `finance_kpis` to the cent.

### M1 — "Net Revenue" label implies fees are netted when (for Etsy) they aren't · MEDIUM
Etsy fees live in `expenses` (hit `net_profit`), not in `channel_fees` (which is gated to
`import_actuals=false`). So `net_revenue`/`gross_profit` for Etsy are **before** selling fees,
but the UI presents "Net Revenue" as if after fees. **Fix:** label the tile "Net Revenue
(after modeled channel fees)" and surface imported fee actuals in the breakdown, or fold
imported-actual fees into the channel figure for facilitator channels.

### M2 — Tax tab + Expenses tiles + CultivarProfit recompute client-side, bypassing the views · MEDIUM
- `TaxReportContent.tsx`: sums gross sales, COGS, Schedule-C deductions, and mileage **in the
  browser** from full table fetches — parallel math that won't reconcile with the P&L tab and
  is the file handed to a tax preparer. Marketplace set hardcoded `['etsy','ebay']`.
- `Expenses.tsx` stat tiles (This month / YTD / Top category) are client float reductions over
  the raw `expenses` table — can diverge from the server `expenses` figure.
- `CultivarProfit.tsx`: **FAIL** — `Est. COGS` assigns *lifetime* production-run cost to
  *sold*-revenue rows (mismatched bases), so Margin $/% are economically wrong (large false
  negatives when production outpaces sales). Revenue uses gross line price (un-netted), inline
  `toFixed(2)` instead of `formatMoney`, and the cultivar key fragments on `name_snapshot`.
**Fix:** source every figure from the server windows (`finance_pnl`, `finance_kpis`); back
per-cultivar profit with a server view that matches sold units to per-unit cost.

### Part 2 — "Show your work" is essentially unmet · HIGH (product)
No headline KPI is expandable. Net Revenue / Expenses / COGS / Net Profit tiles are bare
figures; the P&L breakdown exists but is buried in `/finances/reports?tab=pnl` and isn't
reachable from the Net Profit tile. Only chart hovers and alert deep-links "show work."

### Low / cleanup
- **L1** KPI money returned unrounded (`net_profit 453.52243`); round at the boundary.
- **L2** `finance_cashflow` / `finance_revenue_trend` have no upper date bound — a future-dated
  order would fold into the latest month. Add `< end`.
- **L3** `finance_alerts` "uncategorized" floods 90+ rows from imported Etsy fees lacking a
  `vendor_id`; auto-assign a system vendor or exclude imported fees.
- **L4** `org_id` is nullable on all finance tables; a NULL-org insert is invisible under RLS.
  Add NOT NULL / default-to-caller-org.
- **L5** Possible drift between a committed migration file (which appears to subtract COGS from
  net_profit) and the deployed function (which does not). Reconcile the migration to match prod.
- **L6** P&L table rows don't foot to the bottom line when COGS>0 (COGS shown only as a
  footnote); make the cash-basis treatment explicit in the row structure.
- **Schema redundancies** (memory's open item): `expenses.category` + `category_legacy`
  (legacy 100% NULL), `vendors.url` + `website`. Safe to drop after confirmation.

### Data-quality (informational, not app bugs)
- `order_items` line value ($7,324.98) exceeds `subtotal` ($6,435.67) by **$889.31** across 98
  orders = Etsy order-level coupons; revenue correctly uses `subtotal`/`total`, not line sums.
- Shipping **loses money**: collected $1,753.95 vs postage paid $2,230.43 = **−$476.48** — not
  surfaced anywhere; a strong candidate KPI for the redesign.

---

## Severity roll-up

| # | Severity | Issue | Touches |
|---|---|---|---|
| C1 | CRITICAL | Facilitator sales tax counted as revenue (+$556.81) | prod fn `_finance_kpi_window` |
| H1 | HIGH | $0.28 × 14 import anomaly (+$3.92) | Etsy importer + orders data |
| H2 | HIGH | Cross-surface refund/gross divergence (latent) | prod fns revenue_by_channel/trend |
| Part 2 | HIGH | No expandable "show your work" KPIs | UI |
| M1 | MEDIUM | "Net Revenue" labeling | UI/fn |
| M2 | MEDIUM | Client-side recompute bypasses views (Tax/Expenses/CultivarProfit) | UI |
| L1–L6 | LOW | Rounding, bounds, alert noise, NULL org_id, migration drift, P&L footing | mixed |

## Fixes applied (2026-06-12, migration `20260612030000`)

C1 + H1 + H2 + L2 + L3 are **live in prod and reconciled to the cent**:
- Revenue base switched to `subtotal + shipping` across `_finance_kpi_window`,
  `finance_revenue_by_channel`, `finance_revenue_trend`, `finance_cashflow`
  (`finance_pnl` inherits via the window). Tax pass-through and the +$0.28 anomaly
  are out of revenue.
- **YTD gross sales $8,750.35 → $8,189.62; YTD net profit $4,411.43 → $3,850.70**
  (matches the independent $3,851.94 estimate within the $1.24 Shopify fee).
- All surfaces tie: channel/trend/cashflow net = **$8,188.38** to the cent.
- Refund handling unified (gross includes refunded, net subtracts it) — surfaces no
  longer diverge on the first refund.
- `finance_alerts` uncategorized noise: **90+ → 0**.

**M2 (client-side recompute) — fixed:**
- **Tax tab** (`TaxReportContent`) now sources gross receipts, COGS, Schedule-C deductions,
  and mileage from `finance_pnl(year)` — reconciles with the P&L tab to the cent. Gross
  receipts corrected **$8,750.35 → $8,189.62** (it previously summed `orders.total` incl.
  tax + the $0.28). Sales-tax liability split stays client-side (no server equivalent).
- **CultivarProfit** now reports **realized** revenue (each order's discount allocated
  pro-rata across its lines, so the total reconciles to product revenue) and **sold-basis**
  COGS (units sold × per-unit production cost), via `formatMoney`. Previously it summed
  list-price GMV and assigned lifetime production cost to sold rows (economically wrong margin).

**Revenue = plant sales (migration `20260612060000`):** after review, "Net Revenue" was
redefined from product+shipping to **product (plant sales) only** — Etsy $6,405.68 + Shopify
$29.99 = **$6,435.67** YTD. Shipping is now its own net line (collected $1,753.95 − postage
$2,230.43 = **−$476.48**) across the Overview waterfall, the P&L (a "Shipping collected" row
keeps it footing), and the channel views. A new `gross_receipts` field ($8,189.62, incl.
shipping) is retained for the tax report's IRS gross-receipts line. Net profit is unchanged by
the redefinition (it now reads **$3,845.72** only because a real $4.98 expense dated 2026-06-12
landed in prod). `finance_cashflow` is intentionally left on actual-cash basis (money_in incl.
shipping). All surfaces reconcile to the cent; P&L foots; 38 tests pass.

Still open (tracked): H1 importer hygiene (the $0.28 is neutralized in all reporting but the
14 historical `orders.total` rows still don't foot to components — importer fix + optional
backfill), Expenses page stat tiles (client float sum of the same rows — negligible drift,
left as-is), M1 labeling refinements, L4 nullable `org_id`, L5 migration-vs-deployed drift,
schema redundancies.

## Test coverage
The branch already has `src/lib/finance.test.ts` + `dates.test.ts` (server-formula mirror,
Phoenix tz). Gaps to add once fixes land: facilitator-tax netting, order self-reconciliation
guard, refund cross-surface tie-out, per-cultivar sold-basis COGS.
