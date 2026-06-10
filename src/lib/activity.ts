import { supabase } from "@/lib/supabase";

export type ActivityAction = "created" | "updated" | "deleted" | "imported";

interface LogActivityInput {
  orgId: string;
  actorId: string;
  action: ActivityAction;
  /** Table / feature the action applies to, e.g. "orders". */
  entity: string;
  entityId?: string | null;
  /** Short human label, e.g. the row's name. */
  summary?: string | null;
}

/**
 * Fire-and-forget audit write to `activity_log`. Never blocks the calling
 * mutation and never surfaces errors to the UI — a failed audit write must not
 * break the action it describes.
 */
export function logActivity(input: LogActivityInput): void {
  if (!supabase) return;
  void (supabase as any)
    .from("activity_log")
    .insert({
      org_id: input.orgId,
      actor_id: input.actorId,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      summary: input.summary ?? null,
    })
    .then(({ error }: { error: { message?: string } | null }) => {
      if (error) console.warn("[activity] log failed:", error.message);
    });
}

/** Best-effort human label for a row (name/title-bearing entities). */
export function rowSummary(row: Record<string, unknown>): string | null {
  const candidate = row.name ?? row.title;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}
