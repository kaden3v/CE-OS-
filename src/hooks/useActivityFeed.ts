import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { logDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

export type ActivityRow = Tables<"activity_log">;

export interface ActivityFilters {
  action: string; // "" = all
  entity: string; // "" = all
  actorId: string; // "" = all
  from: string; // YYYY-MM-DD or ""
  to: string; // YYYY-MM-DD or ""
  search: string; // free text on summary
}

export const EMPTY_ACTIVITY_FILTERS: ActivityFilters = {
  action: "",
  entity: "",
  actorId: "",
  from: "",
  to: "",
  search: "",
};

export function hasActiveFilters(f: ActivityFilters): boolean {
  return Boolean(f.action || f.entity || f.actorId || f.from || f.to || f.search.trim());
}

/** actorId filter sentinel for automated/system writes (actor_id IS NULL). */
export const SYSTEM_ACTOR = "__system__";

const PAGE_SIZE = 50;
// America/Phoenix is UTC-7 year-round (no DST) — mirrors src/lib/dates.ts. Anchor
// day-range boundaries to the business day, not UTC midnight.
const PHX = "-07:00";
const dayStart = (d: string) => `${d}T00:00:00${PHX}`;
const dayEnd = (d: string) => `${d}T23:59:59.999${PHX}`;

/** Does a realtime-arriving row belong in the currently-filtered view? */
function matchesFilters(row: ActivityRow, f: ActivityFilters, orgId: string): boolean {
  if (row.org_id !== orgId) return false;
  if (f.action && row.action !== f.action) return false;
  if (f.entity && row.entity !== f.entity) return false;
  if (f.actorId === SYSTEM_ACTOR) {
    if (row.actor_id !== null) return false;
  } else if (f.actorId && row.actor_id !== f.actorId) return false;
  const t = new Date(row.created_at).getTime();
  if (f.from && t < new Date(dayStart(f.from)).getTime()) return false;
  if (f.to && t > new Date(dayEnd(f.to)).getTime()) return false;
  const s = f.search.trim().toLowerCase();
  if (s && !(row.summary ?? "").toLowerCase().includes(s)) return false;
  return true;
}

/**
 * Paginated, filtered, live activity feed for the current org.
 *
 * Replaces the page's old unbounded `useEntity("activity_log")` (a `SELECT *`
 * with no limit over the whole log). Keyset pagination on `created_at desc` with
 * a `.lt(cursor)` load-more; all filters run server-side. A realtime INSERT
 * subscription prepends new rows that pass the active filter, with no refetch.
 */
export function useActivityFeed() {
  const { activeOrgId } = useAuth();
  const ready = !!supabase && !!activeOrgId;

  const [events, setEvents] = useState<ActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(ready);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [filters, setFilters] = useState<ActivityFilters>(EMPTY_ACTIVITY_FILTERS);

  // The realtime callback is set up once per org; read the latest filters from a
  // ref so changing a filter doesn't tear down and rebuild the subscription.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const runQuery = useCallback(
    async (f: ActivityFilters, cursor?: string): Promise<ActivityRow[]> => {
      let q = supabase!.from("activity_log").select("*").eq("org_id", activeOrgId!);
      if (f.action) q = q.eq("action", f.action);
      if (f.entity) q = q.eq("entity", f.entity);
      if (f.actorId === SYSTEM_ACTOR) q = q.is("actor_id", null);
      else if (f.actorId) q = q.eq("actor_id", f.actorId);
      if (f.from) q = q.gte("created_at", dayStart(f.from));
      if (f.to) q = q.lte("created_at", dayEnd(f.to));
      if (f.search.trim()) q = q.ilike("summary", `%${f.search.trim()}%`);
      if (cursor) q = q.lt("created_at", cursor);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(PAGE_SIZE);
      if (error) {
        logDbError("fetch activity", error);
        return [];
      }
      return (data ?? []) as ActivityRow[];
    },
    [activeOrgId],
  );

  // (Re)load the first page whenever filters or the org change.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setIsLoading(true);
    runQuery(filters).then((page) => {
      if (cancelled) return;
      setEvents(page);
      setHasMore(page.length === PAGE_SIZE);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, runQuery, filters]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || events.length === 0) return;
    setIsLoadingMore(true);
    const cursor = events[events.length - 1].created_at;
    const page = await runQuery(filtersRef.current, cursor);
    setEvents((prev) => {
      const seen = new Set(prev.map((e) => e.id));
      return [...prev, ...page.filter((e) => !seen.has(e.id))];
    });
    setHasMore(page.length === PAGE_SIZE);
    setIsLoadingMore(false);
  }, [isLoadingMore, hasMore, events, runQuery]);

  // Live prepend: a new activity row from a teammate/system shows instantly if
  // it matches the active filter. Org-scoped + RLS already limit what arrives.
  useEffect(() => {
    if (!ready) return;
    const channel = supabase!
      .channel(`activity-feed-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log" }, (payload) => {
        const row = payload.new as ActivityRow;
        if (!row || !matchesFilters(row, filtersRef.current, activeOrgId!)) return;
        setEvents((prev) => (prev.some((e) => e.id === row.id) ? prev : [row, ...prev]));
      })
      .subscribe();
    return () => {
      void supabase!.removeChannel(channel);
    };
  }, [ready, activeOrgId]);

  return { events, isLoading, isLoadingMore, hasMore, loadMore, filters, setFilters };
}
