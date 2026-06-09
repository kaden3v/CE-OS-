import { useEffect, useState, useCallback, Dispatch, SetStateAction } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useAuth } from "@/contexts/AuthContext";
import { logDbError } from "@/lib/dbErrors";
import { demoList, demoInsert, demoInsertMany, demoUpdate, demoDelete } from "@/lib/demo/store";

/** Drop keys whose value is `undefined` so a partial patch never nulls columns. */
function omitUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

type WithId = { id: string | number };
type TableName = keyof Database["public"]["Tables"];

/**
 * Backend-aware list state.
 *
 * Reads + writes the given table scoped to the current authed user. RLS
 * enforces ownership server-side; we additionally `.eq('user_id', user.id)`
 * on writes for defense-in-depth.
 *
 * `T` is the in-memory shape your component wants. `Row` is the actual DB row.
 * Provide `toRow`/`fromRow` mappers when they differ.
 *
 * Note: Supabase's typed client requires literal table-name strings on `.from()`.
 * Inside this generic hook the table name is dynamic, so we cast the client to
 * a non-typed view — page-level call sites still get full T/Row safety.
 */
export function useEntity<T extends WithId, Row = T>(
  table: TableName,
  initial: T[],
  options?: {
    toRow?: (item: T, userId: string) => Record<string, unknown>;
    fromRow?: (row: Row) => T;
    orderBy?: string;
    ascending?: boolean;
  },
): {
  data: T[];
  setData: Dispatch<SetStateAction<T[]>>;
  add: (item: T) => Promise<{ ok: true; row: T } | { ok: false; code?: string }>;
  update: (id: T["id"], patch: Partial<T>) => Promise<{ ok: boolean; code?: string }>;
  remove: (id: T["id"]) => Promise<{ ok: boolean; code?: string }>;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const { user, isDemo } = useAuth();
  const ready = isDemo || (!!user && !!supabase);

  // The hook intentionally bypasses the typed table-name constraint internally.
  // Type safety is preserved at the call site via T and Row.
  const db = supabase as any;

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(ready);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setIsLoading(true);
    if (isDemo) {
      const rows = demoList(table, { orderBy: options?.orderBy, ascending: options?.ascending }) as unknown as Row[];
      const mapped = options?.fromRow ? rows.map(options.fromRow) : (rows as unknown as T[]);
      if (mapped.length === 0 && initial.length > 0) {
        await seedInitial(initial);
      } else {
        setData(mapped);
      }
      setIsLoading(false);
      return;
    }
    const { data: rows, error } = await db
      .from(table)
      .select("*")
      .eq("user_id", user!.id)
      .order(options?.orderBy ?? "updated_at", { ascending: options?.ascending ?? false });
    if (error) {
      logDbError(`fetch ${table}`, error);
      setIsLoading(false);
      return;
    }
    const list = (rows ?? []) as Row[];
    const mapped = options?.fromRow ? list.map(options.fromRow) : (list as unknown as T[]);
    if (mapped.length === 0 && initial.length > 0) {
      await seedInitial(initial);
    } else {
      setData(mapped);
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.id, table]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const seedInitial = useCallback(
    async (items: T[]) => {
      if (!ready) return;
      if (isDemo) {
        const rows = items.map((it) => {
          const base =
            options?.fromRow && options?.toRow
              ? options.toRow(it, user!.id)
              : ({ ...(it as any) } as Record<string, unknown>);
          return { ...base, user_id: user!.id, id: (it as any).id ?? crypto.randomUUID() };
        });
        demoInsertMany(table, rows as any);
        const final = options?.fromRow ? rows.map((r) => options.fromRow!(r as Row)) : (rows as unknown as T[]);
        setData(final);
        return;
      }
      const rows = items.map((it) => {
        const mapped = options?.toRow
          ? options.toRow(it, user!.id)
          : ({ ...(it as any) } as Record<string, unknown>);
        return { ...mapped, user_id: user!.id };
      });
      const { data: inserted, error } = await db.from(table).insert(rows).select();
      if (error) {
        logDbError(`seed ${table}`, error);
        return;
      }
      const list = (inserted ?? []) as Row[];
      const final = options?.fromRow ? list.map(options.fromRow) : (list as unknown as T[]);
      setData(final);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, user?.id, table],
  );

  const add = async (item: T): Promise<{ ok: true; row: T } | { ok: false; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    if (isDemo) {
      // Pages with a fromRow mapper pass in-memory shapes (e.g. Inventory) that
      // need the toRow→store→fromRow round-trip. Pages without one pass full
      // DB-shaped rows that we store verbatim (preserving created_at etc.).
      let stored: Record<string, unknown>;
      let final: T;
      if (options?.fromRow && options?.toRow) {
        stored = { ...options.toRow(item, user!.id), user_id: user!.id, id: (item as any).id ?? crypto.randomUUID() };
        final = options.fromRow(stored as Row);
      } else {
        stored = { ...(item as any), user_id: user!.id };
        final = stored as unknown as T;
      }
      demoInsert(table, stored as any);
      setData((prev) => [final, ...prev]);
      return { ok: true, row: final };
    }
    const mapped = options?.toRow
      ? options.toRow(item, user!.id)
      : ({ ...(item as any) } as Record<string, unknown>);
    const row = { ...mapped, user_id: user!.id };
    const { data: inserted, error } = await db.from(table).insert(row).select().single();
    if (error) {
      logDbError(`insert ${table}`, error);
      return { ok: false, code: error.code };
    }
    const final = options?.fromRow ? options.fromRow(inserted as Row) : (inserted as unknown as T);
    setData((prev) => [final, ...prev]);
    return { ok: true, row: final };
  };

  const update = async (id: T["id"], patch: Partial<T>): Promise<{ ok: boolean; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    const mapped = options?.toRow
      ? options.toRow({ ...({} as any), ...patch } as T, user!.id)
      : (patch as Record<string, unknown>);
    const { user_id: _u, id: _i, ...safe } = mapped;
    if (isDemo) {
      demoUpdate(table, id, omitUndefined(safe));
      setData((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      return { ok: true };
    }
    const { error } = await db.from(table).update(safe).eq("id", id).eq("user_id", user!.id);
    if (error) {
      logDbError(`update ${table}`, error);
      return { ok: false, code: error.code };
    }
    setData((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    return { ok: true };
  };

  const remove = async (id: T["id"]): Promise<{ ok: boolean; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    if (isDemo) {
      demoDelete(table, id);
      setData((prev) => prev.filter((r) => r.id !== id));
      return { ok: true };
    }
    const { error } = await db.from(table).delete().eq("id", id).eq("user_id", user!.id);
    if (error) {
      logDbError(`delete ${table}`, error);
      return { ok: false, code: error.code };
    }
    setData((prev) => prev.filter((r) => r.id !== id));
    return { ok: true };
  };

  return { data, setData, add, update, remove, isLoading, refresh: fetchAll };
}
