import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { History, PlusCircle, PencilLine, Trash2, UploadCloud } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { useEntity } from "@/hooks/useEntity";
import { useOrgMembers } from "@/hooks/useOrgMembers";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/lib/database.types";

type ActivityRow = Tables<"activity_log">;

const ACTION_META: Record<string, { icon: typeof PlusCircle; label: string; tone: string }> = {
  created: { icon: PlusCircle, label: "added", tone: "text-status-ok" },
  updated: { icon: PencilLine, label: "updated", tone: "text-status-info" },
  deleted: { icon: Trash2, label: "removed", tone: "text-status-alert" },
  imported: { icon: UploadCloud, label: "imported", tone: "text-accent-brand" },
};

const ENTITY_LABELS: Record<string, string> = {
  cultivars: "a cultivar",
  customers: "a customer",
  expenses: "an expense",
  inventory: "an inventory item",
  licenses: "a license",
  listings: "a listing",
  mortality_events: "a mortality event",
  orders: "an order",
  plant_photos: "a photo",
  print_jobs: "a print job",
  propagation_batches: "a propagation batch",
  qr_codes: "a QR code",
  shipments: "a shipment",
  subscriptions: "a subscription",
  supplies: "a supply",
  tasks: "a task",
  vendors: "a vendor",
};

export default function Activity() {
  const { user } = useAuth();
  const { members } = useOrgMembers();
  // Realtime-refreshed via useEntity's subscription, so the feed updates live.
  const { data: events, isLoading } = useEntity<ActivityRow>("activity_log", [], {
    orderBy: "created_at",
  });

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => {
      map.set(m.user_id, m.user_id === user?.id ? "You" : (m.displayName?.trim() || "A teammate"));
    });
    return map;
  }, [members, user?.id]);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary flex items-center gap-2">
          <History className="w-5 h-5 text-text-secondary" /> Activity
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Everything your team has changed, newest first. Updates live.
        </p>
      </div>

      <Card>
        {isLoading ? (
          <div className="p-4">
            <LoadingTable rows={6} cols={3} />
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={History}
            title="No activity yet"
            description="Changes your team makes to orders, inventory, and records will show up here."
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {events.map((e) => {
              const meta = ACTION_META[e.action] ?? ACTION_META.updated;
              const Icon = meta.icon;
              const actor = (e.actor_id && nameById.get(e.actor_id)) || "A teammate";
              const entityLabel = ENTITY_LABELS[e.entity] ?? e.entity;
              return (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${meta.tone}`} strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary">
                      <span className="font-medium">{actor}</span>{" "}
                      <span className="text-text-secondary">{meta.label}</span> {entityLabel}
                      {e.summary && (
                        <span className="text-text-secondary"> — {e.summary}</span>
                      )}
                    </p>
                    <p className="text-xs text-text-tertiary mt-0.5">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
