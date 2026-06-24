import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import { useAuth } from "@/contexts/AuthContext";
import type { ScheduleCCategory } from "@/lib/scheduleC";
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

interface ExpenseCategoriesValue {
  book: CategoryBook;
  list: ExpenseCategory[];
  isLoading: boolean;
  /** True once the org has saved its own list (vs. running on built-in defaults). */
  isCustom: boolean;
  /** False when the storage column isn't there yet (migration not applied). */
  available: boolean;
  refresh: () => Promise<void>;
  countUsage: (name: string) => Promise<number>;
  addCategory: (name: string, scheduleC: ScheduleCCategory) => Promise<CategoryResult>;
  updateCategory: (original: string, next: { name: string; scheduleC: ScheduleCCategory }) => Promise<CategoryResult>;
  removeCategory: (name: string, reassignTo: string | null) => Promise<CategoryResult>;
}

const noop = async (): Promise<CategoryResult> => ({ ok: false, error: "Categories are not editable here." });

const DEFAULT_VALUE: ExpenseCategoriesValue = {
  book: DEFAULT_CATEGORY_BOOK,
  list: DEFAULT_CATEGORIES,
  isLoading: false,
  isCustom: false,
  available: false,
  refresh: async () => {},
  countUsage: async () => 0,
  addCategory: noop,
  updateCategory: noop,
  removeCategory: noop,
};

const Ctx = createContext<ExpenseCategoriesValue>(DEFAULT_VALUE);

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function ExpenseCategoriesProvider({ children }: { children: ReactNode }) {
  const { user, activeOrgId } = useAuth();
  const [list, setList] = useState<ExpenseCategory[]>(DEFAULT_CATEGORIES);
  const [isCustom, setIsCustom] = useState(false);
  const [available, setAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase || !activeOrgId) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("finance_settings")
      .select("expense_categories")
      .eq("org_id", activeOrgId)
      .maybeSingle();
    if (error) {
      // Undefined column / table => migration not applied yet: defaults, read-only.
      setAvailable(false);
      setIsCustom(false);
      setList(DEFAULT_CATEGORIES);
      setIsLoading(false);
      return;
    }
    setAvailable(true);
    const parsed = parseStoredCategories(data?.expense_categories ?? null);
    setIsCustom(parsed.length > 0);
    setList(parsed.length > 0 ? parsed : DEFAULT_CATEGORIES);
    setIsLoading(false);
  }, [activeOrgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Persist a full list (update existing settings row, else insert one).
  const save = useCallback(
    async (next: ExpenseCategory[]): Promise<CategoryResult> => {
      if (!supabase || !activeOrgId || !user) return { ok: false, error: "Not signed in." };
      const { data: existing } = await supabase.from("finance_settings").select("id").eq("org_id", activeOrgId).maybeSingle();
      const payload = { expense_categories: next as unknown as Json };
      const { error } = existing
        ? await supabase.from("finance_settings").update(payload).eq("org_id", activeOrgId)
        : await supabase.from("finance_settings").insert({ org_id: activeOrgId, user_id: user.id, ...payload });
      if (error) return { ok: false, error: error.message };
      setList(next);
      setIsCustom(true);
      setAvailable(true);
      return { ok: true };
    },
    [activeOrgId, user],
  );

  // Re-tag every expense that uses `oldName`. `to`/`sc` null => uncategorized.
  const reassign = useCallback(
    async (oldName: string, to: string | null, sc: string | null): Promise<CategoryResult> => {
      if (!supabase || !activeOrgId) return { ok: false, error: "Not signed in." };
      const { error } = await supabase
        .from("expenses")
        .update({ category: to, schedule_c_category: sc })
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
    async (name: string, scheduleC: ScheduleCCategory): Promise<CategoryResult> => {
      const clean = name.trim();
      if (!clean) return { ok: false, error: "Name is required." };
      if (list.some((c) => sameName(c.name, clean))) return { ok: false, error: `"${clean}" already exists.` };
      return save([...list, { name: clean, scheduleC }]);
    },
    [list, save],
  );

  const updateCategory = useCallback(
    async (original: string, next: { name: string; scheduleC: ScheduleCCategory }): Promise<CategoryResult> => {
      const clean = next.name.trim();
      if (!clean) return { ok: false, error: "Name is required." };
      const current = list.find((c) => sameName(c.name, original));
      if (!current) return { ok: false, error: "Category not found." };
      if (!sameName(clean, original) && list.some((c) => sameName(c.name, clean))) {
        return { ok: false, error: `"${clean}" already exists.` };
      }
      const nextList = list.map((c) => (sameName(c.name, original) ? { name: clean, scheduleC: next.scheduleC } : c));
      const saved = await save(nextList);
      if (!saved.ok) return saved;
      // Re-tag existing rows if the label or its Schedule C line changed.
      if (!sameName(clean, original) || current.scheduleC !== next.scheduleC) {
        await reassign(original, clean, next.scheduleC);
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
      const moved = await reassign(name, target ? target.name : null, target ? target.scheduleC : null);
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

/** Just the resolved book — for pickers and Schedule C resolution. */
export function useCategoryBook(): CategoryBook {
  return useContext(Ctx).book;
}
