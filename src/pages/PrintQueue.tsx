import { useState, useMemo } from "react";
import { Link } from "react-router";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, Printer, CheckCircle2 } from "lucide-react";
import { EmptyState, StateRenderer } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";

const INITIAL_QUEUE = [
  { id: "LBL-101", type: "Shipping Label", target: "ORD-1198", status: "pending", time: "10:00 AM" },
  { id: "LBL-102", type: "Packing Slip", target: "ORD-1198", status: "pending", time: "10:00 AM" },
  { id: "LBL-103", type: "Phyto Certificate", target: "ORD-1198", status: "pending", time: "10:01 AM" },
  { id: "LBL-104", type: "Shipping Label", target: "ORD-1199", status: "printed", time: "9:45 AM" },
  { id: "LBL-105", type: "Shipping Label", target: "ORD-1200", status: "printed", time: "9:46 AM" },
];

type PrintJobRow = (typeof INITIAL_QUEUE)[number];

export default function PrintQueue() {
  const [queue, setQueue] = useState<PrintJobRow[]>(INITIAL_QUEUE);
  const [isPrinting, setIsPrinting] = useState(false);
  const { addToast } = useApp();

  const handleClearCompleted = () => {
    setQueue(prev => prev.filter(item => item.status !== "printed"));
    addToast("Completed items cleared from queue.", "info");
  };

  const handlePrintAll = () => {
    setIsPrinting(true);
    addToast("Sending jobs to printer...", "info");
    setTimeout(() => {
      setQueue(prev => prev.map(item => ({ ...item, status: "printed" })));
      setIsPrinting(false);
      addToast("Successfully printed pending documents.", "success");
    }, 1500);
  };

  const columns = useMemo((): DataTableColumn<PrintJobRow>[] => [
    { key: "id", header: "ID", render: (row) => <span className="font-mono text-xs">{row.id}</span> },
    { key: "type", header: "Document Type" },
    { key: "target", header: "Related Order" },
    { key: "time", header: "Time Queued", render: (row) => <span className="text-text-secondary">{row.time}</span> },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const isPending = row.status === "pending";
        return (
          <div className={`flex items-center gap-2 ${isPending ? "text-status-warn" : "text-status-ok"}`}>
            {isPending ? <Printer className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span className="capitalize">{row.status}</span>
          </div>
        );
      },
    },
  ], []);

  const hasPending = queue.some(item => item.status === "pending");
  const hasCompleted = queue.some(item => item.status === "printed");
  const isEmpty = queue.length === 0;

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col h-full">
      <div className="mb-6 flex items-center gap-4 shrink-0 justify-between">
        <div className="flex items-center gap-4">
          <Link to="/shipping">
            <Button variant="outline" className="w-10 px-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">Print Queue</h1>
            <p className="text-sm text-text-secondary">Manage labels, packing slips, and certificates pending print.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
             variant="outline" 
             onClick={handleClearCompleted}
             disabled={!hasCompleted}
          >
            Clear Completed
          </Button>
          <Button 
            variant="brand" 
            onClick={handlePrintAll}
            disabled={!hasPending || isPrinting}
          >
            <Printer className={`w-4 h-4 mr-2 ${isPrinting ? 'animate-pulse' : ''}`} />
            {isPrinting ? "Printing..." : "Print All Pending"}
          </Button>
        </div>
      </div>

      <Card className="flex-1 overflow-auto flex flex-col">
        <StateRenderer
          state={isEmpty ? "empty" : "ready"}
          data={queue}
          emptyFallback={(
            <EmptyState
              icon={Printer}
              title="Empty queue"
              description="Nothing is waiting to be printed."
            />
          )}
        >
          {(rows) => <DataTable columns={columns} data={rows} />}
        </StateRenderer>
      </Card>
    </div>
  );
}
