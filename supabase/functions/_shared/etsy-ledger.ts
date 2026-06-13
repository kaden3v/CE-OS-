/**
 * Etsy Payment Account Ledger → expense classification (pure, no Deno-only APIs
 * so Vitest can import it directly — mirrors the src/lib/finance.ts pattern).
 *
 * Etsy's ledger has NO clean type enum: every money movement is a signed `amount`
 * plus a free-text `description`. Seller costs (shipping labels, listing/
 * transaction/processing fees, Etsy Ads) are debits; sales/deposits/payouts/
 * refunds/tax remittance are credits or transfers that are NOT seller expenses
 * (order revenue already covers sales; refunds already reduce gross). So we
 * classify by description, guarded by sign, and route anything unrecognized into
 * a loud "uncategorized" review bucket rather than dropping it silently.
 *
 * The description→bucket map MUST be verified against a real ledger sample (the
 * etsy-sync `?inspect=ledger` mode) before the import is trusted.
 */

/** App expense category + the Schedule C line it rolls up to. */
export interface LedgerClassification {
  category: string;
  scheduleC: string;
}

const SHIPPING: LedgerClassification = { category: "Shipping", scheduleC: "Other expenses" };
const FEES: LedgerClassification = { category: "Marketplace fees", scheduleC: "Commissions and fees" };
const ADS: LedgerClassification = { category: "Marketing", scheduleC: "Advertising" };
/** Unrecognized seller debit — surfaced for review, never dropped. */
const UNCATEGORIZED: LedgerClassification = { category: "Etsy fees (uncategorized)", scheduleC: "Commissions and fees" };

/**
 * Etsy ledger amounts are integers in the currency's minor unit (e.g. cents).
 * Kept as a single named constant so the inspect step can confirm it against
 * real data and it can be corrected in one place if Etsy differs by currency.
 */
export const LEDGER_AMOUNT_DIVISOR = 100;

const SHIPPING_PATTERN = /shipping label|postage|\bshipping\b|\blabel\b/i;
const ADS_PATTERN = /offsite ad|etsy ads|\bads\b|advertis|promoted|marketing/i;
const FEES_PATTERN = /listing|transaction fee|processing|payment|operating fee|regulatory|subscription fee|pattern/i;

/**
 * Classify a single ledger entry. Returns the expense bucket, or `null` when the
 * entry is not a seller expense and must be skipped.
 *
 * Direction is taken from the SIGN, which is authoritative: Etsy debits (charges
 * — fees, labels, ads) are negative; credits (sales, deposits, payouts, refunds,
 * tax remittance) are non-negative. Revenue is already captured by orders, so
 * every credit is skipped. The description only picks the category bucket for a
 * charge. (The ?inspect=ledger dry-run confirms this sign convention against
 * real data before the import is enabled.)
 */
export function classifyLedgerEntry(description: string, amount: number): LedgerClassification | null {
  // Credits / transfers / sales / refunds — not a seller cost.
  if (amount >= 0) return null;

  const d = (description ?? "").trim();
  // Ads first: "Offsite Ads fee" contains "fee"/"payment"-ish words but is advertising.
  if (ADS_PATTERN.test(d)) return ADS;
  if (SHIPPING_PATTERN.test(d)) return SHIPPING;
  if (FEES_PATTERN.test(d)) return FEES;

  // A charge we don't have a label for → loud review bucket, never dropped.
  return UNCATEGORIZED;
}

/** Convert Etsy's raw signed integer amount to positive dollars, rounded to cents. */
export function normalizeLedgerAmount(amount: number): number {
  return Math.round((Math.abs(amount) / LEDGER_AMOUNT_DIVISOR) * 100) / 100;
}
