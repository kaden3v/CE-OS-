import { useEffect, useState, useCallback, Dispatch, SetStateAction } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useAuth } from "@/contexts/AuthContext";
import { logDbError } from "@/lib/dbErrors";

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
  const { user } = useAuth();
  const ready = !!user && !!supabase;

  // The hook intentionally bypasses the typed table-name constraint internally.
  // Type safety is preserved at the call site via T and Row.
  const db = supabase as any;

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(ready);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setIsLoading(true);
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
