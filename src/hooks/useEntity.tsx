import { useEffect, useState, useCallback, Dispatch, SetStateAction } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useAuth } from "@/contexts/AuthContext";
import { logDbError } from "@/lib/dbErrors";
import { logActivity, rowSummary } from "@/lib/activity";
import { pageRanges } from "@/hooks/pageRanges";

type WithId = { id: string | number };
type TableName = keyof Database["public"]["Tables"];

// Supabase's PostgREST enforces a server-side `max-rows` ceiling (~1000) that a
// client `.limit()` CANNOT exceed — it gets clamped silently. Ordered by date
// DESC, that hides the oldest rows once a table passes ~1k (e.g. expenses no
// longer reaching back past ~3 months). The only way past it is to page through
// with `.range()`. We fetch in PAGE_SIZE chunks and loop until a short page
// signals the end, with a hard safety ceiling so a runaway can't loop forever.
const PAGE_SIZE = 1000;
const DEFAULT_FETCH_LIMIT = 50000;

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
    limit?: number;
  },
): {
  data: T[];
  setData: Dispatch<SetStateAction<T[]>>;
  add: (item: T) => Promise<{ ok: true; row: T } | { ok: false; code?: string }>;
  update: (id: T["id"], patch: Partial<T>) => Promise<{ ok: boolean; code?: string }>;
  updateMany: (ids: T["id"][], patch: Partial<T>) => Promise<{ ok: boolean; code?: string }>;
  remove: (id: T["id"]) => Promise<{ ok: boolean; code?: string }>;
  removeMany: (ids: T["id"][]) => Promise<{ ok: boolean; code?: string }>;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const { user, activeOrgId } = useAuth();
  const ready = !!user && !!supabase && !!activeOrgId;

  // The hook intentionally bypasses the typed table-name constraint internally.
  // Type safety is preserved at the call site via T and Row.
  const db = supabase as any;

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(ready);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setIsLoading(true);
    const ceiling = options?.limit ?? DEFAULT_FETCH_LIMIT;
    const list: Row[] = [];
    // Page past PostgREST's max-rows cap until a short page ends the run.
    for (const [from, to] of pageRanges(ceiling, PAGE_SIZE)) {
      const { data: rows, error } = await db
        .from(table)
        .select("*")
        .eq("org_id", activeOrgId!)
        .order(options?.orderBy ?? "updated_at", { ascending: options?.ascending ?? false })
        .range(from, to);
      if (error) {
        logDbError(`fetch ${table}`, error);
        setIsLoading(false);
        return;
      }
      const batch = (rows ?? []) as Row[];
      list.push(...batch);
      if (batch.length < to - from + 1) break;
    }
    const mapped = options?.fromRow ? list.map(options.fromRow) : (list as unknown as T[]);
    if (mapped.length === 0 && initial.length > 0) {
      await seedInitial(initial);
    } else {
      setData(mapped);
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeOrgId, table]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Live refresh: when a teammate changes this table, refetch. Events are only
  // a "something changed" signal (refetch is org-scoped + RLS-filtered), and a
  // short debounce coalesces bursts (e.g. an order + its items). No org filter
  // on the subscription: DELETE payloads only carry the primary key, so an
  // org_id filter would silently drop them.
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase!
      .channel(`rt-${table}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => void fetchAll(), 250);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [ready, table, fetchAll]);

  const seedInitial = useCallback(
    async (items: T[]) => {
      if (!ready) return;
      const rows = items.map((it) => {
        const mapped = options?.toRow
          ? options.toRow(it, user!.id)
          : ({ ...(it as any) } as Record<string, unknown>);
        return { ...mapped, user_id: user!.id, org_id: activeOrgId! };
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
    [ready, user?.id, activeOrgId, table],
  );

  const add = async (item: T): Promise<{ ok: true; row: T } | { ok: false; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    const mapped = options?.toRow
      ? options.toRow(item, user!.id)
      : ({ ...(item as any) } as Record<string, unknown>);
    const row = { ...mapped, user_id: user!.id, org_id: activeOrgId! };
    const { data: inserted, error } = await db.from(table).insert(row).select().single();
    if (error) {
      logDbError(`insert ${table}`, error);
      return { ok: false, code: error.code };
    }
    const final = options?.fromRow ? options.fromRow(inserted as Row) : (inserted as unknown as T);
    setData((prev) => [final, ...prev]);
    if (table !== "activity_log") {
      logActivity({
        orgId: activeOrgId!,
        actorId: user!.id,
        action: "created",
        entity: table,
        entityId: String(final.id),
        summary: rowSummary(inserted as Record<string, unknown>),
      });
    }
    return { ok: true, row: final };
  };

  const update = async (id: T["id"], patch: Partial<T>): Promise<{ ok: boolean; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    const mapped = options?.toRow
      ? options.toRow({ ...({} as any), ...patch } as T, user!.id)
      : (patch as Record<string, unknown>);
    const { user_id: _u, id: _i, org_id: _o, ...safe } = mapped;
    const { error } = await db.from(table).update(safe).eq("id", id).eq("org_id", activeOrgId!);
    if (error) {
      logDbError(`update ${table}`, error);
      return { ok: false, code: error.code };
    }
    setData((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (table !== "activity_log") {
      const current = data.find((r) => r.id === id);
      logActivity({
        orgId: activeOrgId!,
        actorId: user!.id,
        action: "updated",
        entity: table,
        entityId: String(id),
        summary: current ? rowSummary(current as Record<string, unknown>) : null,
      });
    }
    return { ok: true };
  };

  // Batched update: one query for the whole id set + a single setData, so the
  // caller's expenses-keyed memos and the table recompute once instead of N times.
  const updateMany = async (ids: T["id"][], patch: Partial<T>): Promise<{ ok: boolean; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    if (ids.length === 0) return { ok: true };
    const mapped = options?.toRow
      ? options.toRow({ ...({} as any), ...patch } as T, user!.id)
      : (patch as Record<string, unknown>);
    const { user_id: _u, id: _i, org_id: _o, ...safe } = mapped;
    const { error } = await db.from(table).update(safe).in("id", ids).eq("org_id", activeOrgId!);
    if (error) {
      logDbError(`updateMany ${table}`, error);
      return { ok: false, code: error.code };
    }
    const idSet = new Set(ids);
    setData((prev) => prev.map((r) => (idSet.has(r.id) ? { ...r, ...patch } : r)));
    if (table !== "activity_log") {
      logActivity({ orgId: activeOrgId!, actorId: user!.id, action: "updated", entity: table, entityId: null, summary: `${ids.length} rows` });
    }
    return { ok: true };
  };

  const remove = async (id: T["id"]): Promise<{ ok: boolean; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    const { error } = await db.from(table).delete().eq("id", id).eq("org_id", activeOrgId!);
    if (error) {
      logDbError(`delete ${table}`, error);
      return { ok: false, code: error.code };
    }
    const removed = data.find((r) => r.id === id);
    setData((prev) => prev.filter((r) => r.id !== id));
    if (table !== "activity_log") {
      logActivity({
        orgId: activeOrgId!,
        actorId: user!.id,
        action: "deleted",
        entity: table,
        entityId: String(id),
        summary: removed ? rowSummary(removed as Record<string, unknown>) : null,
      });
    }
    return { ok: true };
  };

  // Batched delete: one query + a single setData (see updateMany rationale).
  const removeMany = async (ids: T["id"][]): Promise<{ ok: boolean; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    if (ids.length === 0) return { ok: true };
    const { error } = await db.from(table).delete().in("id", ids).eq("org_id", activeOrgId!);
    if (error) {
      logDbError(`removeMany ${table}`, error);
      return { ok: false, code: error.code };
    }
    const idSet = new Set(ids);
    setData((prev) => prev.filter((r) => !idSet.has(r.id)));
    if (table !== "activity_log") {
      logActivity({ orgId: activeOrgId!, actorId: user!.id, action: "deleted", entity: table, entityId: null, summary: `${ids.length} rows` });
    }
    return { ok: true };
  };

  return { data, setData, add, update, updateMany, remove, removeMany, isLoading, refresh: fetchAll };
}
