import type { Tables } from "@/lib/database.types";

export type Expense = Tables<"expenses">;
export type Vendor = Tables<"vendors">;

export const PAYMENT_METHODS = ["Card", "Bank", "Cash", "PayPal", "Other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** The editable shape of an expense, shared by the modal and inline editor. */
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
export function needsReview(e: Expense): boolean {
  return !e.category || !e.category.trim();
}
