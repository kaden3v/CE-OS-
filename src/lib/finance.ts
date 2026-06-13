/**
 * Pure money math — the canonical client-side mirror of the Postgres finance
 * functions. The DB uses exact `numeric` for authoritative math; this module is
 * for previews, the quarterly estimate, and as the tested specification of the
 * formulas. Round at the boundary (cents for money, 4dp for unit costs) to keep
 * floating-point drift out of displayed totals.
 */

export const roundMoney = (n: number): number => Math.round(n * 100) / 100;
export const roundCost = (n: number): number => Math.round(n * 10000) / 10000;

// --- Supplies: weighted-average (moving) unit cost ---------------------------

/** New unit cost after buying `qty` for `totalCost`, mirroring log_supply_purchase. */
export function weightedAvgUnitCost(oldOnHand: number, oldUnitCost: number, qty: number, totalCost: number): number {
  const newOnHand = oldOnHand + qty;
  if (newOnHand <= 0) return 0;
  return roundCost((oldOnHand * oldUnitCost + totalCost) / newOnHand);
}

/** Reverse a purchase (algebraic inverse of the moving average), mirroring delete_supply_purchase. */
export function reverseSupplyPurchase(
  curOnHand: number, curUnitCost: number, qty: number, totalCost: number,
): { onHand: number; unitCost: number } {
  const onHand = curOnHand - qty;
  if (onHand <= 0) return { onHand: Math.max(onHand, 0), unitCost: 0 };
  return { onHand, unitCost: roundCost(Math.max((curOnHand * curUnitCost - totalCost) / onHand, 0)) };
}

// --- Production: run cost ----------------------------------------------------

export interface ConsumedSupply { qty: number; unitCost: number }

/** Materials/labor/total/per-unit for a run, mirroring log_production_run. */
export function productionRunCost(
  consumed: ConsumedSupply[], laborHours: number, laborRate: number, quantity: number,
): { materials: number; labor: number; total: number; unitCost: number } {
  const materials = roundMoney(consumed.reduce((s, c) => s + c.qty * c.unitCost, 0));
  const labor = roundMoney(laborHours * laborRate);
  const total = roundMoney(materials + labor);
  const unitCost = quantity > 0 ? roundCost(total / quantity) : 0;
  return { materials, labor, total, unitCost };
}

// --- Revenue: recognition ----------------------------------------------------

/**
 * Recognized revenue for one order, mirroring `_finance_kpi_window`'s gross base
 * (= subtotal + shipping). Sales tax is NEVER revenue: on a marketplace
 * facilitator (Etsy) the tax is collected and remitted by the marketplace and
 * the seller never receives it; on a direct sale it is a liability the seller
 * owes. Basing revenue on subtotal+shipping (instead of `orders.total`) also
 * sidesteps the imported +$0.28 anomaly that lives only in `total`. See
 * docs/FINANCE_AUDIT.md (finding C1/H1).
 */
export function recognizedOrderRevenue(o: { subtotal: number; shipping: number }): number {
  return roundMoney(o.subtotal + o.shipping);
}

// --- Revenue: channel fee estimate ------------------------------------------

export interface ChannelFeeRule {
  percent_fee: number;
  payment_percent: number;
  fixed_fee: number;
  payment_fixed: number;
  listing_fee: number;
}

/** Estimated fee for one order, mirroring _finance_kpi_window / finance_revenue_by_channel. */
export function estimateChannelFee(orderTotal: number, itemCount: number, rule: ChannelFeeRule): number {
  const pct = (rule.percent_fee + rule.payment_percent) / 100;
  return roundMoney(orderTotal * pct + rule.fixed_fee + rule.payment_fixed + rule.listing_fee * itemCount);
}

// --- Subscriptions: renewal advancement + due check -------------------------

export type BillingCycle = "monthly" | "quarterly" | "yearly";

/** Add calendar months with end-of-month clamping (matches Postgres interval math). */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = m - 1 + months;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12; // 0-11
  const lastDay = new Date(ny, nm + 1, 0).getDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** Advance a renewal date by one billing cycle, mirroring log_subscription_charge. */
export function advanceRenewal(dateISO: string, cycle: BillingCycle): string {
  const step = cycle === "yearly" ? 12 : cycle === "quarterly" ? 3 : 1;
  return addMonths(dateISO, step);
}

/** True if a renewal has arrived. After logging+advancing, this returns false → cron idempotency. */
export function isSubscriptionDue(nextRenewalISO: string | null, todayISO: string): boolean {
  return !!nextRenewalISO && nextRenewalISO <= todayISO;
}

// --- Reports: quarterly estimated tax ---------------------------------------

const SE_TAX_RATE = 0.153;
const SE_BASE = 0.9235;

/** SE + income tax estimate and even quarterly payment, mirroring QuarterlyReport. */
export function quarterlyEstimate(
  annualNetProfit: number, incomeRatePct: number,
): { seTax: number; incomeTax: number; total: number; perQuarter: number } {
  const np = Math.max(0, annualNetProfit);
  const seTax = roundMoney(np * SE_BASE * SE_TAX_RATE);
  const incomeTax = roundMoney(np * (Math.max(0, incomeRatePct) / 100));
  const total = roundMoney(seTax + incomeTax);
  return { seTax, incomeTax, total, perQuarter: roundMoney(total / 4) };
}
