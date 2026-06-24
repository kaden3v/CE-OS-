/**
 * Pure helpers for the CSV expense importer's polarity filter — extracted so the
 * "don't import deposits/refunds as expenses" logic is unit-testable.
 */

/** Which sign of amount counts as an expense to import. */
export type Polarity = "all" | "out" | "in";

/** A positive parsed amount is money in (deposit/refund), not an expense. */
export function isInflow(rawAmount: number | null): boolean {
  return rawAmount != null && rawAmount > 0;
}

/** Whether a row of the given inflow direction is kept under the chosen polarity. */
export function passesPolarity(polarity: Polarity, inflow: boolean): boolean {
  return polarity === "all" || (polarity === "out" ? !inflow : inflow);
}
