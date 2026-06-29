import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { logDbError } from "@/lib/dbErrors";
import { useActorNames } from "@/hooks/useActorNames";
import { ActivityList } from "./ActivityList";
import { ActivityDetailModal } from "./ActivityDetailModal";
import type { ActivityRow } from "@/hooks/useActivityFeed";

interface RecordActivityProps {
  entity: string;
  entityId: string;
  /** Cap; one record rarely has many events. */
  limit?: number;
}

/**
 * Drop-in history of a single record's activity_log entries, for detail panels
 * (e.g. an order's own timeline). Compact (ungrouped) and clickable into the
 * same detail modal the Activity page uses.
 */
export function RecordActivity({ entity, entityId, limit = 50 }: RecordActivityProps) {
  const { activeOrgId } = useAuth();
  const nameById = useActorNames();
  const [events, setEvents] = useState<ActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<ActivityRow | null>(null);

  useEffect(() => {
    if (!supabase || !activeOrgId || !entityId) return;
    let cancelled = false;
    setIsLoading(true);
    supabase
      .from("activity_log")
      .select("*")
      .eq("org_id", activeOrgId)
      .eq("entity", entity)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(limit)
      .then(({ data, error }) => {
        if (error) logDbError("fetch record activity", error);
        if (!cancelled) {
          setEvents((data ?? []) as ActivityRow[]);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entity, entityId, activeOrgId, limit]);

  if (isLoading) {
    return <div className="h-12 bg-bg-elevated rounded animate-pulse" />;
  }
  if (events.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-tertiary px-1 py-2">
        <History className="w-4 h-4" /> No history yet.
      </p>
    );
  }

  return (
    <>
      <div className="border border-border-subtle rounded-lg overflow-hidden">
        <ActivityList events={events} nameById={nameById} onSelect={setSelected} />
      </div>
      <ActivityDetailModal event={selected} onClose={() => setSelected(null)} nameById={nameById} />
    </>
  );
}
