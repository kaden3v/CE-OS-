/**
 * Etsy Payment Account Ledger → expense classification (pure, no Deno-only APIs
 * so Vitest can import it directly — mirrors the src/lib/finance.ts pattern).
 *
 * The ledger entry `description` is a stable Etsy machine code (snake_case /
 * SCREAMING_CASE), NOT human text — verified against a real 120-day sample:
 *   shipping_labels, shipping_label_usps_adjustment, transaction,
 *   shipping_transaction, transaction_quantity, renew_sold[_auto], listing,
 *   PAYMENT_PROCESSING_FEE, buyer_fee, tier_2_subscription[_tax], prolist,
 *   offsite_ads_fee  → seller charges (negative amounts)
 *   PAYMENT_GROSS, etsy_plus_credit, *_credit, DISBURSE2, sales_tax → NOT seller
 *   expenses (credits, bank payouts, or pass-through facilitator tax)
 *
 * Direction is taken from the SIGN, which is authoritative: charges are negative,
 * credits non-negative. The description picks the category bucket for a charge.
 */

/**
 * App expense category + the tax lines it rolls up to. scheduleF mirrors
 * src/lib/scheduleF.ts EXPENSE_CATEGORY_TO_SCHEDULE_F and scheduleC mirrors
 * src/lib/scheduleC.ts — keep the three in sync (Schedule F has no
 * advertising/commissions line, so fees and ads land on "Other expenses";
 * postage belongs on "Freight and trucking").
 */
export interface LedgerClassification {
  category: string;
  scheduleC: string;
  scheduleF: string;
}

const SHIPPING: LedgerClassification = { category: "Shipping", scheduleC: "Other expenses", scheduleF: "Freight and trucking" };
const FEES: LedgerClassification = { category: "Marketplace fees", scheduleC: "Commissions and fees", scheduleF: "Other expenses" };
const ADS: LedgerClassification = { category: "Marketing", scheduleC: "Advertising", scheduleF: "Other expenses" };
/** Unrecognized seller charge — surfaced for review, never dropped. */
const UNCATEGORIZED: LedgerClassification = { category: "Etsy fees (uncategorized)", scheduleC: "Commissions and fees", scheduleF: "Other expenses" };

/**
 * Etsy ledger amounts are integers in the currency's minor unit (cents) —
 * confirmed against the sample (PAYMENT_PROCESSING_FEE math reconciles at ÷100).
 */
export const LEDGER_AMOUNT_DIVISOR = 100;

// Shipping LABELS only — `shipping_transaction` is a transaction fee, not postage.
const SHIPPING_PATTERN = /shipping_label|shipping label|postage/i;
const ADS_PATTERN = /prolist|offsite_ad|offsite ad|etsy ads|promoted|advertis/i;
const FEES_PATTERN = /transaction|listing|renew_sold|processing|payment|operating|regulatory|subscription|buyer_fee/i;

/**
 * Negative codes that are NOT seller expenses:
 *   disburse* — payouts of the seller's own balance to their bank (a transfer)
 *   sales_tax — marketplace-facilitator tax Etsy collects from buyers and remits
 */
function isSkippableCharge(d: string): boolean {
  return d.startsWith("disburse") || d === "sales_tax";
}

/**
 * Classify a single ledger entry. Returns the expense bucket, or `null` when the
 * entry is not a seller expense and must be skipped (credit, payout, or
 * pass-through tax) — keeping the import from double-counting revenue/transfers.
 */
export function classifyLedgerEntry(description: string, amount: number): LedgerClassification | null {
  if (amount >= 0) return null; // credits / sales / deposits / refunds

  const d = (description ?? "").trim().toLowerCase();
  if (isSkippableCharge(d)) return null;

  if (SHIPPING_PATTERN.test(d)) return SHIPPING; // shipping_label* (NOT shipping_transaction)
  if (ADS_PATTERN.test(d)) return ADS;
  if (FEES_PATTERN.test(d)) return FEES;

  return UNCATEGORIZED; // an unknown charge → loud review bucket
}

/** Convert Etsy's raw signed integer amount to positive dollars, rounded to cents. */
export function normalizeLedgerAmount(amount: number): number {
  return Math.round((Math.abs(amount) / LEDGER_AMOUNT_DIVISOR) * 100) / 100;
}
