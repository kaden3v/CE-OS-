/**
 * Per-org expense categories.
 *
 * Categories used to be a hardcoded list in scheduleC.ts. They're now editable
 * per org (stored as JSON on finance_settings), and each one carries BOTH tax
 * lines it can roll into: Schedule F (the nursery's default) and Schedule C
 * (swappable via finance_settings.tax_schedule). This module centralizes the
 * "vocabulary" logic — picker grouping, canonicalization, and tax-line
 * resolution — behind a pure CategoryBook so the rest of the app can stay
 * agnostic about where the list comes from. The default book (built from the
 * static defaults) reproduces the previous behavior exactly.
 */
import {
  SCHEDULE_C_CATEGORIES,
  SCHEDULE_C_FALLBACK,
  EXPENSE_CATEGORIES,
  mapToScheduleC,
  type ScheduleCCategory,
} from "./scheduleC";
import {
  SCHEDULE_F_CATEGORIES,
  mapToScheduleF,
  type ScheduleFCategory,
  type TaxSchedule,
} from "./scheduleF";

export interface ExpenseCategory {
  name: string;
  scheduleC: ScheduleCCategory;
  scheduleF: ScheduleFCategory;
}

/** The built-in defaults, derived from the static vocabulary + its mappings. */
export const DEFAULT_CATEGORIES: ExpenseCategory[] = EXPENSE_CATEGORIES.map((name) => ({
  name,
  scheduleC: mapToScheduleC(name).scheduleC,
  scheduleF: mapToScheduleF(name).scheduleF,
}));

export interface CategoryBook {
  list: ExpenseCategory[];
  names: string[];
  /** Categories grouped under their tax line for the given schedule, in form order. */
  groupsFor(schedule: TaxSchedule): { line: string; categories: string[] }[];
  /** Canonical-cased name if this book knows it, else null. */
  canonical(raw: string | null | undefined): string | null;
  /** Schedule C line for a name (book → static fallback for legacy/synced rows). */
  scheduleCFor(raw: string | null | undefined): ScheduleCCategory;
  /** Schedule F line for a name (book → static fallback for legacy/synced rows). */
  scheduleFFor(raw: string | null | undefined): ScheduleFCategory;
  /** {category, legacy}: known → canonical name; unknown → preserved as legacy. */
  normalize(raw: string | null | undefined): { category: string | null; legacy: string | null };
  has(raw: string | null | undefined): boolean;
}

const norm = (s: string | null | undefined): string => (s ?? "").toLowerCase().trim();

/** Build a CategoryBook from a category list. Pure; safe to call per render. */
export function makeCategoryBook(list: ExpenseCategory[]): CategoryBook {
  const byLower = new Map<string, ExpenseCategory>();
  for (const c of list) {
    const key = norm(c.name);
    if (key) byLower.set(key, c);
  }

  const groupsFor = (schedule: TaxSchedule): { line: string; categories: string[] }[] => {
    const lines: readonly string[] = schedule === "F" ? SCHEDULE_F_CATEGORIES : SCHEDULE_C_CATEGORIES;
    const lineOf = (c: ExpenseCategory) => (schedule === "F" ? c.scheduleF : c.scheduleC);
    return lines
      .map((line) => ({ line, categories: list.filter((c) => lineOf(c) === line).map((c) => c.name) }))
      .filter((g) => g.categories.length > 0);
  };

  return {
    list,
    names: list.map((c) => c.name),
    groupsFor,
    has: (raw) => byLower.has(norm(raw)),
    canonical: (raw) => byLower.get(norm(raw))?.name ?? null,
    // Fall back to the static maps so legacy strings and server-classified
    // (Etsy) categories that aren't in the org's list still resolve sensibly.
    scheduleCFor: (raw) => byLower.get(norm(raw))?.scheduleC ?? mapToScheduleC(raw).scheduleC,
    scheduleFFor: (raw) => byLower.get(norm(raw))?.scheduleF ?? mapToScheduleF(raw).scheduleF,
    normalize: (raw) => {
      const trimmed = (raw ?? "").trim();
      if (!trimmed) return { category: null, legacy: null };
      const hit = byLower.get(norm(trimmed));
      return hit ? { category: hit.name, legacy: null } : { category: null, legacy: trimmed };
    },
  };
}

/** The static default book — identical behavior to the old hardcoded helpers. */
export const DEFAULT_CATEGORY_BOOK: CategoryBook = makeCategoryBook(DEFAULT_CATEGORIES);

/**
 * Validate untrusted stored JSON into a clean category list. Drops malformed or
 * duplicate entries and coerces an unknown tax line to the fallback. Entries
 * saved before the Schedule F rollout have no scheduleF — derive it from the
 * name so existing orgs pick up sensible F lines without re-saving.
 * Returns [] when there's nothing usable, so callers fall back to defaults.
 */
export function parseStoredCategories(value: unknown): ExpenseCategory[] {
  if (!Array.isArray(value)) return [];
  const out: ExpenseCategory[] = [];
  const seen = new Set<string>();
  const validC = new Set<string>(SCHEDULE_C_CATEGORIES);
  const validF = new Set<string>(SCHEDULE_F_CATEGORIES);
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rawName = (item as { name?: unknown }).name;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name || seen.has(name.toLowerCase())) continue;
    const rawC = (item as { scheduleC?: unknown }).scheduleC;
    const scheduleC = (typeof rawC === "string" && validC.has(rawC) ? rawC : SCHEDULE_C_FALLBACK) as ScheduleCCategory;
    const rawF = (item as { scheduleF?: unknown }).scheduleF;
    const scheduleF = (typeof rawF === "string" && validF.has(rawF)
      ? rawF
      : mapToScheduleF(name).scheduleF) as ScheduleFCategory;
    out.push({ name, scheduleC, scheduleF });
    seen.add(name.toLowerCase());
  }
  return out;
}
