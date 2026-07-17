/**
 * User-authored auto-categorization rules (Monarch-style "always file X as Y").
 *
 * Rules complement the history-derived model in expenseCategorization.ts: the
 * model learns from what you've already categorized, while a rule captures
 * intent up front ("anything with AMZN in the memo is Supplies") — including for
 * vendors the ledger has never seen. Matching is pure and runs client-side at
 * the write paths that need it (CSV import, receipt-scan drafts, and on-save
 * sweeps of rows needing review), so there is no server-side engine to keep in
 * sync. Synced Etsy rows arrive already classified and are not run through
 * rules; manual entry picks a category directly in the form.
 *
 * Matching semantics: case-insensitive substring on memo and/or vendor, plus an
 * optional inclusive amount range. Rules are tried in priority order (lower
 * number first, id as tiebreak) and the first hit wins.
 */

/** The fields matching needs — structurally satisfied by Tables<"expense_rules">. */
export interface ExpenseRuleFields {
  id: string;
  active: boolean;
  priority: number;
  /** Where match_value must appear: the memo, the vendor label, or either. */
  match_field: string;
  match_value: string;
  amount_min: number | string | null;
  amount_max: number | string | null;
  set_category: string;
  set_vendor_id: string | null;
  /** When true, a matched row skips the review queue (the rule encodes intent). */
  mark_reviewed: boolean;
}

/** What a rule is matched against. */
export interface RuleTarget {
  description: string | null | undefined;
  vendor_name: string | null | undefined;
  amount: number;
}

const norm = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** True when `rule` matches `target`. Inactive rules never match. */
export function matchesRule(rule: ExpenseRuleFields, target: RuleTarget): boolean {
  if (!rule.active) return false;
  const needle = norm(rule.match_value);
  if (!needle) return false;

  const min = rule.amount_min == null ? null : Number(rule.amount_min);
  const max = rule.amount_max == null ? null : Number(rule.amount_max);
  if (min != null && Number.isFinite(min) && target.amount < min) return false;
  if (max != null && Number.isFinite(max) && target.amount > max) return false;

  const memo = norm(target.description);
  const vendor = norm(target.vendor_name);
  const inMemo = memo.includes(needle);
  const inVendor = vendor.includes(needle);
  switch (rule.match_field) {
    case "memo":
      return inMemo;
    case "vendor":
      return inVendor;
    default:
      return inMemo || inVendor;
  }
}

/** Stable evaluation order: priority ascending, then id for determinism. */
export function sortRules<T extends ExpenseRuleFields>(rules: readonly T[]): T[] {
  return [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

/** First active rule that matches, in priority order — or null. */
export function applyRules<T extends ExpenseRuleFields>(
  rules: readonly T[],
  target: RuleTarget,
): T | null {
  for (const rule of sortRules(rules)) {
    if (matchesRule(rule, target)) return rule;
  }
  return null;
}

/** Human-readable one-liner for a rule ("memo contains “amzn” → Supplies"). */
export function describeRule(rule: Pick<ExpenseRuleFields, "match_field" | "match_value" | "set_category">): string {
  const where = rule.match_field === "any" ? "memo or vendor" : rule.match_field;
  return `${where} contains “${rule.match_value}” → ${rule.set_category}`;
}
