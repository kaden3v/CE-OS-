import { useMemo } from "react";
import { Link } from "react-router";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, Printer, CheckCircle2 } from "lucide-react";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";
import { useEntity } from "@/hooks/useEntity";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

type PrintJob = Tables<"print_jobs">;

const KIND_LABEL: Record<string, string> = {
  label: "Shipping Label",
  invoice: "Invoice / Packing Slip",
  "care-card": "Care Card",
  qr: "QR Code",
  other: "Other",
};

export default function PrintQueue() {
  const { data: jobs, update, remove, isLoading } = useEntity<PrintJob>("print_jobs", [], {
    toRow: (j) => ({
      shipment_id: j.shipment_id,
      kind: j.kind,
      status: j.status,
      payload: j.payload,
      printed_at: j.printed_at,
    }),
  });
  const { addToast } = useApp();

  const handlePrintAll = async () => {
    addToast({ title: "Sending pending jobs…", status: "info" });
    const pending = jobs.filter((j) => j.status === "pending");
    await Promise.all(pending.map((j) => update(j.id, { status: "printed", printed_at: new Date().toISOString() } as Partial<PrintJob>)));
    addToast({ title: "Marked as printed", description: `${pending.length} job(s)`, status: "ok" });
  };

  const handleClearCompleted = async () => {
    const printed = jobs.filter((j) => j.status === "printed");
    for (const j of printed) {
      const result = await remove(j.id);
      if (result.ok === false) {
        addToast({ title: "Couldn't clear all", description: friendlyDbError({ code: result.code } as any), status: "alert" });
        return;
      }
    }
    addToast({ title: "Queue cleared", description: `${printed.length} job(s)`, status: "info" });
  };

  const columns = useMemo(
    () => [
      { accessorKey: "id", header: "ID", cell: (info: any) => <span className="font-mono text-xs">{info.getValue().slice(0, 8)}</span> },
      { accessorKey: "kind", header: "Type", cell: (info: any) => KIND_LABEL[info.getValue()] ?? info.getValue() },
      { accessorKey: "shipment_id", header: "Shipment", cell: (info: any) => <span className="text-text-secondary">{info.getValue() ? info.getValue().slice(0, 8) : "—"}</span> },
      { accessorKey: "created_at", header: "Queued", cell: (info: any) => <span className="text-text-secondary">{new Date(info.getValue()).toLocaleTimeString()}</span> },
      {
        accessorKey: "status",
        header: "Status",
        cell: (info: any) => {
          const v = info.getValue();
          const pending = v === "pending" || v === "printing";
          return (
            <div className={`flex items-center gap-2 ${pending ? "text-status-warn" : v === "failed" ? "text-status-alert" : "text-status-ok"}`}>
              {pending ? <Printer className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span className="capitalize">{v}</span>
            </div>
          );
        },
      },
    ],
    [],
  );

  const hasPending = jobs.some((j) => j.status === "pending" || j.status === "printing");
  const hasCompleted = jobs.some((j) => j.status === "printed");
  const isEmpty = !isLoading && jobs.length === 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto flex flex-col h-full">
      <div className="mb-6 flex items-center gap-4 shrink-0 justify-between">
        <div className="flex items-center gap-4">
          <Link to="/shipping">
            <Button variant="outline" className="w-10 px-0" aria-label="Back to shipping">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">Print Queue</h1>
            <p className="text-sm text-text-secondary">Labels, slips, and certificates queued for printing.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleClearCompleted} disabled={!hasCompleted}>
            Clear Completed
          </Button>
          <Button variant="brand" onClick={handlePrintAll} disabled={!hasPending}>
            <Printer className="w-4 h-4 mr-2" />
            Mark All Printed
          </Button>
        </div>
      </div>

      <Card className="flex-1 overflow-auto flex flex-col">
        {isLoading ? (
          <LoadingTable cols={5} rows={6} />
        ) : isEmpty ? (
          <EmptyState icon={Printer} title="Queue empty" description="Print jobs queued from shipments will appear here." />
        ) : (
          <DataTable columns={columns} data={jobs} />
        )}
      </Card>
    </div>
  );
}
