import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Json, TablesUpdate } from "@/lib/database.types";
import { useAuth } from "@/contexts/AuthContext";
import type { ScheduleCCategory } from "@/lib/scheduleC";
import type { ScheduleFCategory, TaxSchedule } from "@/lib/scheduleF";
import {
  makeCategoryBook,
  parseStoredCategories,
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY_BOOK,
  type CategoryBook,
  type ExpenseCategory,
} from "@/lib/categories";

export interface CategoryResult {
  ok: boolean;
  error?: string;
}

/** Both tax lines a category rolls into; the active schedule picks which one reports use. */
export interface CategoryLines {
  name: string;
  scheduleC: ScheduleCCategory;
  scheduleF: ScheduleFCategory;
}

interface ExpenseCategoriesValue {
  book: CategoryBook;
  list: ExpenseCategory[];
  isLoading: boolean;
  /** True once the org has saved its own list (vs. running on built-in defaults). */
  isCustom: boolean;
  /** False when the storage column isn't there yet (migration not applied). */
  available: boolean;
  /** The org's active tax schedule — F (farm, the default) or C. */
  taxSchedule: TaxSchedule;
  /** Persist a schedule swap (finance_settings.tax_schedule). */
  setTaxSchedule: (next: TaxSchedule) => Promise<CategoryResult>;
  refresh: () => Promise<void>;
  countUsage: (name: string) => Promise<number>;
  addCategory: (input: CategoryLines) => Promise<CategoryResult>;
  updateCategory: (original: string, next: CategoryLines) => Promise<CategoryResult>;
  removeCategory: (name: string, reassignTo: string | null) => Promise<CategoryResult>;
}

const noop = async (): Promise<CategoryResult> => ({ ok: false, error: "Categories are not editable here." });

const DEFAULT_VALUE: ExpenseCategoriesValue = {
  book: DEFAULT_CATEGORY_BOOK,
  list: DEFAULT_CATEGORIES,
  isLoading: false,
  isCustom: false,
  available: false,
  taxSchedule: "F",
  setTaxSchedule: noop,
  refresh: async () => {},
  countUsage: async () => 0,
  addCategory: noop,
  updateCategory: noop,
  removeCategory: noop,
};

const Ctx = createContext<ExpenseCategoriesValue>(DEFAULT_VALUE);

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const isTaxSchedule = (v: unknown): v is TaxSchedule => v === "F" || v === "C";

export function ExpenseCategoriesProvider({ children }: { children: ReactNode }) {
  const { user, activeOrgId } = useAuth();
  const [list, setList] = useState<ExpenseCategory[]>(DEFAULT_CATEGORIES);
  const [isCustom, setIsCustom] = useState(false);
  const [available, setAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [taxSchedule, setTaxScheduleState] = useState<TaxSchedule>("F");

  const refresh = useCallback(async () => {
    if (!supabase || !activeOrgId) return;
    setIsLoading(true);
    // select("*") on purpose: naming columns would 42703 on a DB that hasn't
    // received a newer migration yet (e.g. tax_schedule), knocking out the
    // whole category book instead of degrading gracefully.
    const { data, error } = await supabase
      .from("finance_settings")
      .select("*")
      .eq("org_id", activeOrgId)
      .maybeSingle();
    if (error) {
      // Undefined table => migration not applied yet: defaults, read-only.
      setAvailable(false);
      setIsCustom(false);
      setList(DEFAULT_CATEGORIES);
      setIsLoading(false);
      return;
    }
    setAvailable(true);
    const row = (data ?? null) as (Record<string, unknown> & { expense_categories?: unknown }) | null;
    const parsed = parseStoredCategories(row?.expense_categories ?? null);
    setIsCustom(parsed.length > 0);
    setList(parsed.length > 0 ? parsed : DEFAULT_CATEGORIES);
    setTaxScheduleState(isTaxSchedule(row?.tax_schedule) ? row.tax_schedule : "F");
    setIsLoading(false);
  }, [activeOrgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Persist a partial finance_settings payload (update existing row, else insert one).
  const persistSettings = useCallback(
    async (payload: TablesUpdate<"finance_settings">): Promise<CategoryResult> => {
      if (!supabase || !activeOrgId || !user) return { ok: false, error: "Not signed in." };
      const { data: existing } = await supabase.from("finance_settings").select("id").eq("org_id", activeOrgId).maybeSingle();
      const { error } = existing
        ? await supabase.from("finance_settings").update(payload).eq("org_id", activeOrgId)
        : await supabase.from("finance_settings").insert({ org_id: activeOrgId, user_id: user.id, ...payload });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [activeOrgId, user],
  );

  const save = useCallback(
    async (next: ExpenseCategory[]): Promise<CategoryResult> => {
      const r = await persistSettings({ expense_categories: next as unknown as Json });
      if (!r.ok) return r;
      setList(next);
      setIsCustom(true);
      setAvailable(true);
      return { ok: true };
    },
    [persistSettings],
  );

  const setTaxSchedule = useCallback(
    async (next: TaxSchedule): Promise<CategoryResult> => {
      const r = await persistSettings({ tax_schedule: next });
      if (!r.ok) return r;
      setTaxScheduleState(next);
      return { ok: true };
    },
    [persistSettings],
  );

  // Re-tag every expense that uses `oldName`. Null target => uncategorized.
  const reassign = useCallback(
    async (oldName: string, to: string | null, sc: string | null, sf: string | null): Promise<CategoryResult> => {
      if (!supabase || !activeOrgId) return { ok: false, error: "Not signed in." };
      const { error } = await supabase
        .from("expenses")
        .update({ category: to, schedule_c_category: sc, schedule_f_category: sf })
        .eq("org_id", activeOrgId)
        .eq("category", oldName);
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    [activeOrgId],
  );

  const countUsage = useCallback(
    async (name: string): Promise<number> => {
      if (!supabase || !activeOrgId) return 0;
      const { count } = await supabase
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("org_id", activeOrgId)
        .eq("category", name);
      return count ?? 0;
    },
    [activeOrgId],
  );

  const addCategory = useCallback(
    async (input: CategoryLines): Promise<CategoryResult> => {
      const clean = input.name.trim();
      if (!clean) return { ok: false, error: "Name is required." };
      if (list.some((c) => sameName(c.name, clean))) return { ok: false, error: `"${clean}" already exists.` };
      return save([...list, { name: clean, scheduleC: input.scheduleC, scheduleF: input.scheduleF }]);
    },
    [list, save],
  );

  const updateCategory = useCallback(
    async (original: string, next: CategoryLines): Promise<CategoryResult> => {
      const clean = next.name.trim();
      if (!clean) return { ok: false, error: "Name is required." };
      const current = list.find((c) => sameName(c.name, original));
      if (!current) return { ok: false, error: "Category not found." };
      if (!sameName(clean, original) && list.some((c) => sameName(c.name, clean))) {
        return { ok: false, error: `"${clean}" already exists.` };
      }
      const nextList = list.map((c) =>
        sameName(c.name, original) ? { name: clean, scheduleC: next.scheduleC, scheduleF: next.scheduleF } : c,
      );
      const saved = await save(nextList);
      if (!saved.ok) return saved;
      // Re-tag existing rows if the label or either tax line changed.
      if (!sameName(clean, original) || current.scheduleC !== next.scheduleC || current.scheduleF !== next.scheduleF) {
        await reassign(original, clean, next.scheduleC, next.scheduleF);
      }
      return { ok: true };
    },
    [list, save, reassign],
  );

  const removeCategory = useCallback(
    async (name: string, reassignTo: string | null): Promise<CategoryResult> => {
      const current = list.find((c) => sameName(c.name, name));
      if (!current) return { ok: false, error: "Category not found." };
      const target = reassignTo ? list.find((c) => sameName(c.name, reassignTo)) : null;
      // Move affected rows first so none are orphaned, then drop the category.
      const moved = await reassign(
        name,
        target ? target.name : null,
        target ? target.scheduleC : null,
        target ? target.scheduleF : null,
      );
      if (!moved.ok) return moved;
      return save(list.filter((c) => !sameName(c.name, name)));
    },
    [list, save, reassign],
  );

  // Stable identity so downstream useMemo deps don't thrash each render.
  const book = useMemo(() => makeCategoryBook(list), [list]);
  const value: ExpenseCategoriesValue = {
    book,
    list,
    isLoading,
    isCustom,
    available,
    taxSchedule,
    setTaxSchedule,
    refresh,
    countUsage,
    addCategory,
    updateCategory,
    removeCategory,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Full categories API — for the management screen. */
export function useExpenseCategories(): ExpenseCategoriesValue {
  return useContext(Ctx);
}

/** Just the resolved book — for pickers and tax-line resolution. */
export function useCategoryBook(): CategoryBook {
  return useContext(Ctx).book;
}

/** The active tax schedule + swap — for reports and pickers. */
export function useTaxSchedule(): { taxSchedule: TaxSchedule; setTaxSchedule: (next: TaxSchedule) => Promise<CategoryResult> } {
  const { taxSchedule, setTaxSchedule } = useContext(Ctx);
  return { taxSchedule, setTaxSchedule };
}
