/**
 * Schedule F (IRS Form 1040, Profit or Loss From Farming) expense lines and the
 * mapping from the app's expense categories onto them.
 *
 * A plant nursery files Schedule F, so this is the org's default tax schedule;
 * Schedule C (scheduleC.ts) remains available as a swap (finance_settings.
 * tax_schedule). The SQL backfill in
 * supabase/migrations/20260701110000_schedule_f_tax_mapping.sql mirrors
 * EXPENSE_CATEGORY_TO_SCHEDULE_F — keep the two in sync (same contract as the
 * Schedule C pair).
 */

/** Which IRS schedule the org's tax report runs on. */
export type TaxSchedule = "F" | "C";

/** Schedule F Part II expense lines (labels match the form, numbers omitted). */
export const SCHEDULE_F_CATEGORIES = [
  "Car and truck expenses",
  "Chemicals",
  "Conservation expenses",
  "Custom hire (machine work)",
  "Depreciation",
  "Employee benefit programs",
  "Feed",
  "Fertilizers and lime",
  "Freight and trucking",
  "Gasoline, fuel, and oil",
  "Insurance (other than health)",
  "Interest (mortgage)",
  "Interest (other)",
  "Labor hired",
  "Pension and profit-sharing plans",
  "Rent or lease (vehicles, machinery, equipment)",
  "Rent or lease (other)",
  "Repairs and maintenance",
  "Seeds and plants",
  "Storage and warehousing",
  "Supplies",
  "Taxes",
  "Utilities",
  "Veterinary, breeding, and medicine",
  "Other expenses",
] as const;

export type ScheduleFCategory = (typeof SCHEDULE_F_CATEGORIES)[number];

/** Safe fallback for anything that doesn't map cleanly (Schedule F line 32). */
export const SCHEDULE_F_FALLBACK: ScheduleFCategory = "Other expenses";

/**
 * App expense category (lowercased) → Schedule F line. Notable differences from
 * Schedule C: there is no advertising or commissions line on F, so marketing
 * and marketplace fees roll into "Other expenses"; shipping/postage belongs on
 * "Freight and trucking"; permits/licenses land on "Taxes". Keys are
 * lowercased; lookups normalize with `toLowerCase().trim()`.
 */
export const EXPENSE_CATEGORY_TO_SCHEDULE_F: Readonly<Record<string, ScheduleFCategory>> = {
  "soil and media": "Supplies",
  packaging: "Supplies",
  tools: "Supplies",
  utilities: "Utilities",
  marketing: "Other expenses",
  "marketplace fees": "Other expenses",
  "etsy fees (uncategorized)": "Other expenses",
  "permits and licenses": "Taxes",
  shipping: "Freight and trucking",
  software: "Other expenses",
  subscription: "Other expenses",
  other: "Other expenses",
  // Nursery-specific vocabulary the owner is likely to add — mapped up front so
  // a new category with one of these names lands on the right line by default.
  fertilizer: "Fertilizers and lime",
  chemicals: "Chemicals",
  plants: "Seeds and plants",
  "seeds and plants": "Seeds and plants",
};

/**
 * Classify a free-form category. `mappedCleanly` is false when the category is
 * unknown (the caller should fall back rather than trust the line).
 */
export function mapToScheduleF(
  category: string | null | undefined,
): { scheduleF: ScheduleFCategory; mappedCleanly: boolean } {
  const key = (category ?? "").toLowerCase().trim();
  const hit = EXPENSE_CATEGORY_TO_SCHEDULE_F[key];
  return hit
    ? { scheduleF: hit, mappedCleanly: true }
    : { scheduleF: SCHEDULE_F_FALLBACK, mappedCleanly: false };
}
