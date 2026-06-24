import type { Tables } from "@/lib/database.types";

export type Expense = Tables<"expenses">;
export type Vendor = Tables<"vendors">;

export const PAYMENT_METHODS = ["Card", "Bank", "Cash", "PayPal", "Other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** The editable shape of an expense, used by the expense modal. */
export interface ExpenseFormData {
  amount: number;
  occurred_on: string;
  category: string | null;
  schedule_c_category: string | null;
  payment_method: string | null;
  vendor_id: string | null;
  deductible: boolean;
  description: string | null;
}

/** An expense still needs review until it has a category (and thus a Schedule C line). */
export function needsReview(e: Pick<Expense, "category">): boolean {
  return !e.category || !e.category.trim();
}

/**
 * True when a row is created and maintained by an automated source (Etsy sync,
 * recurring subscriptions, supply purchases, mileage) rather than entered by
 * hand. Managed rows are read-only in the ledger — edit them at their source —
 * so deleting one here can't orphan a linked record (e.g. supply_purchases ->
 * expense_id) or get silently re-created by the next sync. CSV imports are
 * `source = 'manual'` and so remain fully editable.
 */
export function isManaged(e: Pick<Expense, "source">): boolean {
  return (e.source ?? "manual") !== "manual";
}
