/**
 * Pure helpers for the CSV expense importer — the polarity filter ("don't
 * import deposits/refunds as expenses"), the deterministic per-row idempotency
 * key, and the categorization waterfall. All extracted so the import pipeline
 * is unit-testable without a DOM or a database.
 */
import type { CategoryBook } from "@/lib/categories";
import { suggestCategory, type CategoryModel } from "@/lib/expenseCategorization";
import { applyRules, type ExpenseRuleFields } from "@/lib/expenseRules";

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

// ---------------------------------------------------------------------------
// Idempotency keys
// ---------------------------------------------------------------------------

const slugify = (s: string | null | undefined, max = 40): string => {
  const slug = (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return slug || "x";
};

export interface CsvIdentity {
  occurred_on: string;
  amount: number;
  description: string | null;
}

/**
 * Deterministic `external_id` for a CSV row: `csv:{org8}:{date}:{cents}:{memo-slug}`
 * (+ `:{seq}` for repeats within one file). Re-importing an overlapping
 * statement produces the same keys, so the ledger's unique external_id index
 * makes imports idempotent at the database level — the pre-insert existence
 * check filters them out, and the index backstops any race. Human-readable on
 * purpose: a support look at the row says exactly where it came from.
 */
export function csvExternalId(orgId: string, row: CsvIdentity, seq = 0): string {
  const cents = Math.round(Math.abs(row.amount) * 100);
  const base = `csv:${orgId.slice(0, 8)}:${row.occurred_on}:${cents}:${slugify(row.description)}`;
  return seq > 0 ? `${base}:${seq}` : base;
}

/**
 * Keys for a whole batch, suffixing repeats (two identical $4.50 rows on the
 * same day are both real — they must not collapse into one key).
 */
export function assignCsvExternalIds(orgId: string, rows: readonly CsvIdentity[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = csvExternalId(orgId, row);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : csvExternalId(orgId, row, n);
  });
}

// ---------------------------------------------------------------------------
// Categorization waterfall
// ---------------------------------------------------------------------------

export type ImportCategorySource = "rule" | "file" | "history";

export interface ImportCategorization {
  category: string | null;
  category_legacy: string | null;
  /** Which stage decided the category (null = uncategorized). */
  categorySource: ImportCategorySource | null;
  /** Vendor link applied by a rule, if any. */
  vendor_id: string | null;
  /** Imported rows land in the review queue unless a rule vouches for them. */
  needs_review: boolean;
}

export interface CategorizeDeps {
  book: CategoryBook;
  rules: readonly ExpenseRuleFields[];
  model: CategoryModel;
  minConfidence?: number;
}

/**
 * Decide a category for one import row. Precedence:
 *  1. the user's rules (authored intent — beats a bank's junk category column),
 *  2. the file's own category column, normalized through the org vocabulary,
 *  3. the history model (how identical memos/vendors were categorized before).
 * Only a rule with mark_reviewed clears the review flag — everything else an
 * import creates still gets a human glance.
 */
export function categorizeImportRow(
  row: { amount: number; description: string | null; vendor_name: string | null; fileCategoryRaw: string | null },
  deps: CategorizeDeps,
): ImportCategorization {
  const { book, rules, model } = deps;

  const matched = applyRules(rules, {
    description: row.description,
    vendor_name: row.vendor_name,
    amount: row.amount,
  });
  if (matched) {
    return {
      category: book.canonical(matched.set_category) ?? matched.set_category,
      category_legacy: null,
      categorySource: "rule",
      vendor_id: matched.set_vendor_id,
      needs_review: !matched.mark_reviewed,
    };
  }

  const fromFile = book.normalize(row.fileCategoryRaw);
  if (fromFile.category) {
    return { category: fromFile.category, category_legacy: null, categorySource: "file", vendor_id: null, needs_review: true };
  }

  const suggestion = suggestCategory(
    { vendor_id: null, vendor_name: row.vendor_name, description: row.description },
    model,
    deps.minConfidence,
  );
  if (suggestion) {
    return { category: suggestion.category, category_legacy: fromFile.legacy, categorySource: "history", vendor_id: null, needs_review: true };
  }

  return { category: null, category_legacy: fromFile.legacy, categorySource: null, vendor_id: null, needs_review: true };
}
