/**
 * Schedule C (IRS Form 1040, Profit or Loss From Business) expense lines and the
 * mapping from the app's free-form expense categories onto them.
 *
 * Shared so the Tax Report, the expense importer, and any future bookkeeping
 * export all classify expenses the same way. The SQL backfill in
 * supabase/migrations/20260611220000_finance_expenses_vendors.sql mirrors
 * EXPENSE_CATEGORY_TO_SCHEDULE_C — keep the two in sync.
 */

export const SCHEDULE_C_CATEGORIES = [
  "Advertising",
  "Car and truck expenses",
  "Commissions and fees",
  "Contract labor",
  "Insurance",
  "Legal and professional services",
  "Office expense",
  "Rent or lease",
  "Repairs and maintenance",
  "Supplies",
  "Taxes and licenses",
  "Travel",
  "Meals",
  "Utilities",
  "Wages",
  "Other expenses",
] as const;

export type ScheduleCCategory = (typeof SCHEDULE_C_CATEGORIES)[number];

/** Safe fallback for anything that doesn't map cleanly (Schedule C line 27a). */
export const SCHEDULE_C_FALLBACK: ScheduleCCategory = "Other expenses";

/**
 * App expense category (lowercased) → Schedule C line. Per the finance spec,
 * shipping/postage and software both roll up into "Other expenses". Keys are
 * lowercased; lookups normalize with `toLowerCase().trim()`.
 */
export const EXPENSE_CATEGORY_TO_SCHEDULE_C: Readonly<Record<string, ScheduleCCategory>> = {
  "soil and media": "Supplies",
  packaging: "Supplies",
  tools: "Supplies",
  utilities: "Utilities",
  marketing: "Advertising",
  "marketplace fees": "Commissions and fees",
  "permits and licenses": "Taxes and licenses",
  shipping: "Other expenses",
  software: "Other expenses",
  subscription: "Other expenses",
  other: "Other expenses",
};

/**
 * Classify a free-form category. `mappedCleanly` is false when the category is
 * unknown (the caller should preserve the original in a legacy field).
 */
export function mapToScheduleC(
  category: string | null | undefined,
): { scheduleC: ScheduleCCategory; mappedCleanly: boolean } {
  const key = (category ?? "").toLowerCase().trim();
  const hit = EXPENSE_CATEGORY_TO_SCHEDULE_C[key];
  return hit
    ? { scheduleC: hit, mappedCleanly: true }
    : { scheduleC: SCHEDULE_C_FALLBACK, mappedCleanly: false };
}

/** The app's selectable expense categories (display-cased), all mapped above. */
export const EXPENSE_CATEGORIES: readonly string[] = [
  "Soil and media",
  "Packaging",
  "Tools",
  "Shipping",
  "Software",
  "Subscription",
  "Marketing",
  "Marketplace fees",
  "Utilities",
  "Permits and licenses",
  "Other",
];

/**
 * Expense categories grouped under their Schedule C line, in Schedule C order —
 * for an <optgroup>-style picker that shows the tax bucket each category rolls
 * into. Selecting a category also determines its schedule_c_category.
 */
export function groupedExpenseCategories(): { scheduleC: ScheduleCCategory; categories: string[] }[] {
  const groups = new Map<ScheduleCCategory, string[]>();
  for (const cat of EXPENSE_CATEGORIES) {
    const { scheduleC } = mapToScheduleC(cat);
    const list = groups.get(scheduleC) ?? [];
    list.push(cat);
    groups.set(scheduleC, list);
  }
  return SCHEDULE_C_CATEGORIES.filter((s) => groups.has(s)).map((s) => ({
    scheduleC: s,
    categories: groups.get(s)!,
  }));
}
