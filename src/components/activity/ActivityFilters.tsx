import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ACTION_META, ENTITY_LABELS, humanizeField } from "@/lib/activityMeta";
import { monthRange, ytdRange } from "@/lib/dates";
import {
  type ActivityFilters as Filters,
  EMPTY_ACTIVITY_FILTERS,
  SYSTEM_ACTOR,
  hasActiveFilters,
} from "@/hooks/useActivityFeed";
import type { OrgMember } from "@/hooks/useOrgMembers";

interface ActivityFiltersProps {
  filters: Filters;
  setFilters: (f: Filters) => void;
  members: OrgMember[];
}

const selectCls =
  "bg-bg-elevated border border-border-strong rounded-[8px] px-2 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors";

export function ActivityFilters({ filters, setFilters, members }: ActivityFiltersProps) {
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });
  const active = hasActiveFilters(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
        <Input
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search activity…"
          className="w-full pl-8"
          aria-label="Search activity"
        />
      </div>

      <select className={selectCls} value={filters.action} onChange={(e) => set({ action: e.target.value })} aria-label="Filter by action">
        <option value="">All actions</option>
        {Object.entries(ACTION_META).map(([key, meta]) => (
          <option key={key} value={key}>
            {humanizeField(meta.label)}
          </option>
        ))}
      </select>

      <select className={selectCls} value={filters.entity} onChange={(e) => set({ entity: e.target.value })} aria-label="Filter by record type">
        <option value="">All records</option>
        {Object.keys(ENTITY_LABELS).map((key) => (
          <option key={key} value={key}>
            {humanizeField(key)}
          </option>
        ))}
      </select>

      <select className={selectCls} value={filters.actorId} onChange={(e) => set({ actorId: e.target.value })} aria-label="Filter by person">
        <option value="">Anyone</option>
        <option value={SYSTEM_ACTOR}>System (automated)</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.displayName?.trim() || "Teammate"}
          </option>
        ))}
      </select>

      <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} className="text-text-secondary" aria-label="From date" />
      <Input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} className="text-text-secondary" aria-label="To date" />

      <Button size="sm" variant="outline" onClick={() => set(monthRange())}>This month</Button>
      <Button size="sm" variant="outline" onClick={() => set(ytdRange())}>YTD</Button>

      {active && (
        <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_ACTIVITY_FILTERS)} className="gap-1">
          <X className="w-3.5 h-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}
