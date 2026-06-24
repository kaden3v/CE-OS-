/**
 * History-derived expense auto-categorization.
 *
 * Instead of a hand-maintained rules table, we learn from the ledger itself: how
 * a vendor (or an exact memo) has been categorized in the past predicts how the
 * next matching row should be categorized. This needs no schema — the model is
 * rebuilt from the loaded expenses — and it self-corrects: re-categorize enough
 * rows and the majority flips. Etsy's repetitive memos ("shipping_labels",
 * "PAYMENT_PROCESSING_FEE") make exact-memo matching especially strong.
 *
 * Setting a category is sync-safe even on managed rows (the channel importer
 * never stomps a categorized row), so suggestions apply to any source.
 */
import type { Expense } from "@/components/expenses/types";
import { normalizeExpenseCategory } from "@/lib/scheduleC";

/** A suggestion is only surfaced when this share of matching history agrees. */
export const MIN_SUGGESTION_CONFIDENCE = 0.6;

export interface CategorySuggestion {
  /** A known app category (always passes the controlled vocabulary). */
  category: string;
  /** Share (0..1) of matching history that used this category. */
  confidence: number;
  /** How many past rows back the suggestion. */
  support: number;
  /** What matched — vendor identity, or an exact memo. */
  basis: "vendor" | "memo";
}

type Counts = Map<string, number>;
export interface CategoryModel {
  byVendor: Map<string, Counts>;
  byMemo: Map<string, Counts>;
}

const norm = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Stable key for a vendor signal: id when linked, else the normalized name. */
const vendorKey = (e: Pick<Expense, "vendor_id" | "vendor_name">): string | null => {
  if (e.vendor_id) return `id:${e.vendor_id}`;
  const n = norm(e.vendor_name);
  return n ? `name:${n}` : null;
};

const memoKey = (e: Pick<Expense, "description">): string | null => norm(e.description) || null;

const bump = (map: Map<string, Counts>, key: string, category: string): void => {
  const counts = map.get(key) ?? new Map<string, number>();
  counts.set(category, (counts.get(category) ?? 0) + 1);
  map.set(key, counts);
};

/** Build a frequency model from already-categorized expenses. */
export function buildCategoryModel(history: Expense[]): CategoryModel {
  const byVendor = new Map<string, Counts>();
  const byMemo = new Map<string, Counts>();
  for (const e of history) {
    // Only learn from rows that resolve to a known app category.
    const known = normalizeExpenseCategory(e.category).category;
    if (!known) continue;
    const vk = vendorKey(e);
    if (vk) bump(byVendor, vk, known);
    const mk = memoKey(e);
    if (mk) bump(byMemo, mk, known);
  }
  return { byVendor, byMemo };
}

const topOf = (counts: Counts | undefined): { category: string; confidence: number; support: number } | null => {
  if (!counts || counts.size === 0) return null;
  let total = 0;
  let best = "";
  let bestN = 0;
  for (const [cat, n] of counts) {
    total += n;
    if (n > bestN) {
      best = cat;
      bestN = n;
    }
  }
  return best ? { category: best, confidence: bestN / total, support: bestN } : null;
}

/**
 * Suggest a category for one expense. Vendor evidence is preferred over memo
 * when both clear the confidence bar; ties break on confidence then support.
 */
export function suggestCategory(
  target: Pick<Expense, "vendor_id" | "vendor_name" | "description">,
  model: CategoryModel,
  minConfidence = MIN_SUGGESTION_CONFIDENCE,
): CategorySuggestion | null {
  const vk = vendorKey(target);
  const mk = memoKey(target);
  const vendor = vk ? topOf(model.byVendor.get(vk)) : null;
  const memo = mk ? topOf(model.byMemo.get(mk)) : null;

  const candidates: CategorySuggestion[] = [];
  if (vendor && vendor.confidence >= minConfidence) candidates.push({ ...vendor, basis: "vendor" });
  if (memo && memo.confidence >= minConfidence) candidates.push({ ...memo, basis: "memo" });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.basis !== b.basis) return a.basis === "vendor" ? -1 : 1; // vendor wins
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.support - a.support;
  });
  return candidates[0];
}

/**
 * Suggestions for the uncategorized rows in `rows`, learning from the
 * categorized ones in the same list. Returns a map keyed by expense id; rows
 * with no confident suggestion are omitted.
 */
export function suggestForRows(rows: Expense[], minConfidence = MIN_SUGGESTION_CONFIDENCE): Map<string, CategorySuggestion> {
  // buildCategoryModel already skips uncategorized rows, so pass the whole list
  // (one normalize pass per row instead of two).
  const model = buildCategoryModel(rows);
  const out = new Map<string, CategorySuggestion>();
  for (const e of rows) {
    if (normalizeExpenseCategory(e.category).category) continue; // already categorized
    const s = suggestCategory(e, model, minConfidence);
    if (s) out.set(e.id, s);
  }
  return out;
}
