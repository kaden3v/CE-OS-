import { useMemo } from "react";
import { actionMeta, entityLabel, actorLabel } from "@/lib/activityMeta";
import { relativeDayLabel } from "@/lib/dates";
import { formatRelative } from "@/lib/format";
import type { ActivityRow } from "@/hooks/useActivityFeed";

interface ActivityListProps {
  events: ActivityRow[];
  nameById: Map<string, string>;
  onSelect: (event: ActivityRow) => void;
  /** Insert "Today"/"Yesterday"/date headers (the main feed). Off for compact
   *  per-record history where every row is the same record. */
  grouped?: boolean;
}

interface Group {
  day: string;
  items: ActivityRow[];
}

/** Reusable activity timeline. Each row is a button → opens the detail modal. */
export function ActivityList({ events, nameById, onSelect, grouped = false }: ActivityListProps) {
  const groups = useMemo<Group[]>(() => {
    if (!grouped) return [{ day: "", items: events }];
    const out: Group[] = [];
    for (const e of events) {
      const day = relativeDayLabel(e.created_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items = [...last.items, e];
      else out.push({ day, items: [e] });
    }
    return out;
  }, [events, grouped]);

  return (
    <div>
      {groups.map((group) => (
        <section key={group.day || "all"}>
          {grouped && (
            <h3 className="bg-bg-base/40 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-tertiary border-b border-border-subtle">
              {group.day}
            </h3>
          )}
          <ul className="divide-y divide-border-subtle/50">
            {group.items.map((e) => {
              const meta = actionMeta(e.action);
              const Icon = meta.icon;
              const actor = actorLabel(e.actor_id, nameById);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(e)}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-bg-hover transition-colors focus:outline-none focus:bg-bg-hover"
                  >
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${meta.tone}`} strokeWidth={1.5} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary">
                        <span className="font-medium">{actor}</span>{" "}
                        <span className="text-text-secondary">{meta.label}</span> {entityLabel(e.entity)}
                        {e.summary && <span className="text-text-secondary"> — {e.summary}</span>}
                      </p>
                      <p className="text-xs text-text-tertiary mt-0.5">{formatRelative(e.created_at)}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
