import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  actionMeta,
  entityLabel,
  actorLabel,
  snapshotFields,
  formatSnapshotValue,
  humanizeField,
  ACTIVITY_ENTITIES,
} from "@/lib/activityMeta";
import { formatBusinessDateTime } from "@/lib/dates";
import { formatRelative } from "@/lib/format";
import { useActivityNavigate, canNavigateToRecord } from "@/hooks/useActivityNavigate";
import type { ActivityRow } from "@/hooks/useActivityFeed";

interface ActivityDetailModalProps {
  event: ActivityRow | null;
  onClose: () => void;
  nameById: Map<string, string>;
}

type Snapshot = Record<string, unknown> | null | undefined; // undefined = loading, null = gone

/** Live snapshot of the record an event touched. Guarded by the entity
 *  allow-list so a dynamic table name can never reach `.from()` unchecked. */
async function fetchEntitySnapshot(entity: string, entityId: string, orgId: string): Promise<Record<string, unknown> | null> {
  if (!supabase || !ACTIVITY_ENTITIES.has(entity)) return null;
  const { data } = await (supabase as any)
    .from(entity)
    .select("*")
    .eq("id", entityId)
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

export function ActivityDetailModal({ event, onClose, nameById }: ActivityDetailModalProps) {
  const { activeOrgId } = useAuth();
  const navigateToRecord = useActivityNavigate();
  const [snapshot, setSnapshot] = useState<Snapshot>(undefined);

  useEffect(() => {
    if (!event || !event.entity_id || !activeOrgId) {
      setSnapshot(null);
      return;
    }
    setSnapshot(undefined);
    let cancelled = false;
    fetchEntitySnapshot(event.entity, event.entity_id, activeOrgId).then((r) => {
      if (!cancelled) setSnapshot(r);
    });
    return () => {
      cancelled = true;
    };
  }, [event, activeOrgId]);

  if (!event) return null;

  const meta = actionMeta(event.action);
  const Icon = meta.icon;
  const actor = actorLabel(event.actor_id, nameById);
  const fields = snapshot ? snapshotFields(event.entity, snapshot) : [];
  const canOpen = canNavigateToRecord(event.entity, event.entity_id) && snapshot !== null;

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${meta.tone}`} strokeWidth={1.5} />
          <span>
            <span className="font-medium">{actor}</span>{" "}
            <span className="text-text-secondary font-normal">{meta.label}</span> {entityLabel(event.entity)}
          </span>
        </span>
      }
    >
      <div className="p-4 space-y-5">
        {/* Event facts */}
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-tertiary">When</dt>
          <dd className="text-text-primary">
            {formatBusinessDateTime(event.created_at)}{" "}
            <span className="text-text-tertiary">· {formatRelative(event.created_at)}</span>
          </dd>

          <dt className="text-text-tertiary">Who</dt>
          <dd className="text-text-primary">{actor}</dd>

          <dt className="text-text-tertiary">What</dt>
          <dd className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{humanizeField(meta.label)}</Badge>
            <Badge variant="default">{humanizeField(event.entity)}</Badge>
          </dd>

          {event.summary && (
            <>
              <dt className="text-text-tertiary">Details</dt>
              <dd className="text-text-primary">{event.summary}</dd>
            </>
          )}

          {event.entity_id && (
            <>
              <dt className="text-text-tertiary">Record</dt>
              <dd className="font-mono text-xs text-text-secondary break-all">{event.entity_id}</dd>
            </>
          )}
        </dl>

        {/* Live record snapshot */}
        {event.entity_id && (
          <div className="border-t border-border-subtle pt-4">
            <h4 className="text-xs uppercase tracking-wide text-text-tertiary mb-2">Current state</h4>
            {snapshot === undefined ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-4 bg-bg-elevated rounded animate-pulse" style={{ width: `${70 - i * 12}%` }} />
                ))}
              </div>
            ) : snapshot === null ? (
              <p className="text-sm text-text-secondary">
                {event.action === "deleted" ? "This record was deleted." : "This record is no longer available."}
              </p>
            ) : fields.length === 0 ? (
              <p className="text-sm text-text-secondary">No additional detail to show.</p>
            ) : (
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
                {fields.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-text-tertiary">{humanizeField(key)}</dt>
                    <dd className="text-text-primary break-words">{formatSnapshotValue(key, value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}

        {canOpen && (
          <div className="border-t border-border-subtle pt-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                navigateToRecord(event.entity, event.entity_id);
                onClose();
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" /> View record
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
