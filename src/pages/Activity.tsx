import { useState } from "react";
import { History } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingTable, EmptyState, ZeroResultState } from "@/components/ui/StateRenderer";
import { useActivityFeed, hasActiveFilters, EMPTY_ACTIVITY_FILTERS, type ActivityRow } from "@/hooks/useActivityFeed";
import { useOrgMembers } from "@/hooks/useOrgMembers";
import { useActorNames } from "@/hooks/useActorNames";
import { ActivityFilters } from "@/components/activity/ActivityFilters";
import { ActivityList } from "@/components/activity/ActivityList";
import { ActivityDetailModal } from "@/components/activity/ActivityDetailModal";

export default function Activity() {
  const { events, isLoading, isLoadingMore, hasMore, loadMore, filters, setFilters } = useActivityFeed();
  const { members } = useOrgMembers();
  const nameById = useActorNames();
  const [selected, setSelected] = useState<ActivityRow | null>(null);
  const filtered = hasActiveFilters(filters);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary flex items-center gap-2">
          <History className="w-5 h-5 text-text-secondary" /> Activity
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Everything your team has changed, newest first. Click any event for detail. Updates live.
        </p>
      </div>

      <ActivityFilters filters={filters} setFilters={setFilters} members={members} />

      <Card className="p-0">
        {isLoading ? (
          <div className="p-4">
            <LoadingTable rows={6} cols={3} />
          </div>
        ) : events.length === 0 ? (
          filtered ? (
            <ZeroResultState onClearOption={() => setFilters(EMPTY_ACTIVITY_FILTERS)} />
          ) : (
            <EmptyState
              icon={History}
              title="No activity yet"
              description="Changes your team makes to orders, inventory, and records will show up here."
            />
          )
        ) : (
          <>
            <ActivityList events={events} nameById={nameById} onSelect={setSelected} grouped />
            {hasMore && (
              <div className="p-3 border-t border-border-subtle">
                <Button variant="outline" size="sm" className="w-full" onClick={loadMore} disabled={isLoadingMore}>
                  {isLoadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <ActivityDetailModal event={selected} onClose={() => setSelected(null)} nameById={nameById} />
    </div>
  );
}
