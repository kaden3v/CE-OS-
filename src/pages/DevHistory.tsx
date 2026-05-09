import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Download } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { EntityDiff } from "@/components/EntityDiff";
import { cn } from "@/lib/utils";
import { useChangeLogs } from "@/hooks/useChangeLogs";
import type { ChangeLog } from "@/lib/schemas";
import { diffTuplesToSideRecords } from "@/lib/changeLog";
import { parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { formatLocal, normalizeUtcIso, utcIsoNow } from "@/lib/dates";
import { useApp } from "@/contexts/AppContext";

const ACTIONS: ChangeLog["action"][] = ["create", "update", "delete"];

function previewDiff(diff: ChangeLog["diff"]): string {
  try {
    const s = JSON.stringify(diff);
    return s.length > 96 ? `${s.slice(0, 96)}…` : s;
  } catch {
    return "(unserializable diff)";
  }
}

function entryCalendarDayInTz(utcIso: string, tz: string): string {
  return formatInTimeZone(parseISO(normalizeUtcIso(utcIso)), tz, "yyyy-MM-dd");
}

function inOperatorDateRange(
  utcIso: string,
  from: string | undefined,
  to: string | undefined,
  tz: string
): boolean {
  const day = entryCalendarDayInTz(utcIso, tz);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function exportFiltered(rows: ChangeLog[]) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `change-log-${utcIsoNow().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function DevHistory() {
  const { settings } = useApp();
  const entries = useChangeLogs();
  const [resourceFilter, setResourceFilter] = useState<Set<string>>(
    () => new Set()
  );
  const [actionFilter, setActionFilter] = useState<Set<ChangeLog["action"]>>(
    () => new Set()
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<ChangeLog | null>(null);

  const resourceOptions = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) s.add(e.resource);
    return Array.from(s).sort();
  }, [entries]);

  const sorted = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          Date.parse(b.timestamp) - Date.parse(a.timestamp)
      ),
    [entries]
  );

  const filtered = useMemo(() => {
    return sorted.filter((e) => {
      if (resourceFilter.size > 0 && !resourceFilter.has(e.resource)) {
        return false;
      }
      if (actionFilter.size > 0 && !actionFilter.has(e.action)) {
        return false;
      }
      if (
        !inOperatorDateRange(
          e.timestamp,
          dateFrom || undefined,
          dateTo || undefined,
          settings.operatorTimezone
        )
      ) {
        return false;
      }
      return true;
    });
  }, [
    sorted,
    resourceFilter,
    actionFilter,
    dateFrom,
    dateTo,
    settings.operatorTimezone,
  ]);

  const toggleResource = (r: string) => {
    setResourceFilter((prev) => {
      if (prev.size === 0) return new Set([r]);
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  };

  const toggleAction = (a: ChangeLog["action"]) => {
    setActionFilter((prev) => {
      if (prev.size === 0) return new Set([a]);
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  };

  const columns = useMemo((): DataTableColumn<ChangeLog>[] => {
    return [
      {
        key: "timestamp",
        header: "Time",
        sortable: true,
        render: (row) => (
          <span className="font-mono text-xs text-text-secondary whitespace-nowrap">
            {formatLocal(row.timestamp, "PPpp", settings.operatorTimezone)}
          </span>
        ),
      },
      { key: "resource", header: "Resource", sortable: true },
      {
        key: "resourceId",
        header: "Resource ID",
        render: (row) => (
          <span className="font-mono text-xs">{row.resourceId}</span>
        ),
      },
      { key: "action", header: "Action", sortable: true },
      { key: "source", header: "Source", sortable: true },
      {
        key: "diff",
        header: "Diff preview",
        render: (row) => (
          <span className="text-xs text-text-secondary line-clamp-2 font-mono">
            {previewDiff(row.diff)}
          </span>
        ),
      },
    ];
  }, [settings.operatorTimezone]);

  const openDetail = (row: ChangeLog) => {
    setSelected(row);
    setDetailOpen(true);
  };

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto flex flex-col gap-6 min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            to="/settings"
            className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="w-3 h-3" /> Settings
          </Link>
          <h1 className="text-2xl font-semibold">Write history</h1>
          <p className="text-sm text-text-secondary mt-1">
            Last {entries.length} mutation(s) retained locally (FIFO cap).
          </p>
        </div>
        <Button
          variant="outline"
          className="shrink-0 gap-2"
          type="button"
          onClick={() => exportFiltered(filtered)}
        >
          <Download className="w-4 h-4" />
          Export logs
        </Button>
      </div>

      <Card className="p-4 space-y-4 border-border-subtle">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-wide text-text-secondary shrink-0">
            Resource
          </span>
          {resourceOptions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => toggleResource(r)}
              className={cn(
                "text-xs px-2 py-1 rounded-md border transition-colors",
                resourceFilter.size === 0 || resourceFilter.has(r)
                  ? "border-accent-brand/40 bg-accent-brand/10 text-text-primary"
                  : "border-border-subtle text-text-tertiary opacity-50"
              )}
            >
              {r}
            </button>
          ))}
          {resourceOptions.length === 0 && (
            <span className="text-xs text-text-tertiary">No entries yet</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-wide text-text-secondary shrink-0">
            Action
          </span>
          {ACTIONS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => toggleAction(a)}
              className={cn(
                "text-xs px-2 py-1 rounded-md border capitalize transition-colors",
                actionFilter.size === 0 || actionFilter.has(a)
                  ? "border-border-strong bg-bg-active text-text-primary"
                  : "border-border-subtle text-text-tertiary opacity-50"
              )}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-text-secondary">
              From
            </label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-text-secondary">
              To
            </label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <span className="text-xs text-text-tertiary pb-2">
            Showing {filtered.length} of {entries.length}
          </span>
        </div>
      </Card>

      <DataTable
        ariaLabel="Change log"
        data={filtered}
        columns={columns}
        onRowClick={(row: ChangeLog) => openDetail(row)}
      />

      {selected && (
        <Dialog
          open={detailOpen}
          onOpenChange={(o) => {
            setDetailOpen(o);
            if (!o) setSelected(null);
          }}
          title={`${selected.action} · ${selected.resource} · ${selected.resourceId}`}
          description={`${selected.source} · ${selected.timestamp}`}
          width={880}
        >
          <ChangeLogDetailBody entry={selected} />
        </Dialog>
      )}
    </div>
  );
}

function ChangeLogDetailBody({ entry }: { entry: ChangeLog }) {
  const summaryOnly =
    Object.keys(entry.diff).length === 1 && "__summary" in entry.diff;

  if (summaryOnly) {
    const pair = entry.diff.__summary;
    const msg =
      pair && Array.isArray(pair) ? String(pair[1] ?? pair[0]) : "";
    return (
      <p className="text-sm text-text-secondary whitespace-pre-wrap">{msg}</p>
    );
  }

  if (entry.action === "create" && entry.diff.__created) {
    const v = entry.diff.__created[1];
    return (
      <pre className="text-xs font-mono bg-bg-active border border-border-subtle rounded-lg p-4 overflow-x-auto max-h-[min(70vh,560px)]">
        {JSON.stringify(v, null, 2)}
      </pre>
    );
  }

  if (entry.action === "delete" && entry.diff.__deleted) {
    const v = entry.diff.__deleted[0];
    return (
      <pre className="text-xs font-mono bg-bg-active border border-border-subtle rounded-lg p-4 overflow-x-auto max-h-[min(70vh,560px)]">
        {JSON.stringify(v, null, 2)}
      </pre>
    );
  }

  const { before, after } = diffTuplesToSideRecords(entry.diff);
  return (
    <EntityDiff
      left={before as Record<string, unknown>}
      right={after as Record<string, unknown>}
      leftTitle="Before"
      rightTitle="After"
    />
  );
}
