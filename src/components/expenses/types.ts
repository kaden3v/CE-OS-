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
  schedule_f_category: string | null;
  payment_method: string | null;
  vendor_id: string | null;
  deductible: boolean;
  description: string | null;
}

/** True when the row has no (usable) category. */
export function isUncategorized(e: Pick<Expense, "category">): boolean {
  return !e.category || !e.category.trim();
}

/**
 * An expense needs review while it's uncategorized OR while an import left it
 * awaiting a human glance (needs_review flag). Categorizing or editing a row
 * clears the flag; a rule with mark_reviewed never sets it.
 */
export function needsReview(e: Pick<Expense, "category" | "needs_review">): boolean {
  return isUncategorized(e) || !!e.needs_review;
}

/**
 * True when a row is created and maintained by an automated source (Etsy sync,
 * recurring subscriptions, supply purchases, mileage) rather than entered by
 * hand. Managed rows are read-only in the ledger — edit them at their source —
 * so deleting one here can't orphan a linked record (e.g. supply_purchases ->
 * expense_id) or get silently re-created by the next sync. CSV imports
 * (`source = 'csv'`) are the user's own data and stay fully editable, like
 * manual rows.
 */
export function isManaged(e: Pick<Expense, "source">): boolean {
  const source = e.source ?? "manual";
  return source !== "manual" && source !== "csv";
}
