import React, { useState, useMemo } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Plus, Package, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDataState } from "@/hooks/useDataState";
import { EmptyState, ErrorState, LoadingTable, StateRenderer, resolveDataViewState } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/Input";

const RECEIPTS = [
  { id: "REC-2401", date: "Today", vendor: "SuperMoss", items: "Sphagnum Moss (50kg)", status: "Pending Inspection", type: "Supplies" },
  { id: "REC-2402", date: "Yesterday", vendor: "Local Nursery", items: "Perlite (x10 bags)", status: "Received", type: "Supplies" },
  { id: "REC-2403", date: "Oct 10", vendor: "Wholesale Carnivores", items: "P. gigantea plugs x100", status: "Quarantined", type: "Plants" },
  { id: "REC-2404", date: "Oct 08", vendor: "Customer Return", items: "Order ORD-1102 (Damaged in transit)", status: "Processing", type: "Return" },
];

type ReceiptRow = (typeof RECEIPTS)[number];

export default function Receiving() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [receiptsData, setReceiptsData] = useState<ReceiptRow[]>(RECEIPTS);
  const { data, isLoading, isError, isEmpty } = useDataState<ReceiptRow>(receiptsData);
  const { addToast } = useApp();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newReceipt, setNewReceipt] = useState({ vendor: "", items: "", type: "Supplies" });

  const handleAddReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    const idNum = Math.max(...receiptsData.map(r => parseInt(r.id.split('-')[1]))) + 1 || 2405;
    const receipt = {
      id: `REC-${idNum}`,
      date: "Today",
      vendor: newReceipt.vendor || "Unknown Vendor",
      items: newReceipt.items || "Unknown Items",
      status: "Pending Inspection",
      type: newReceipt.type
    };
    setReceiptsData([receipt, ...receiptsData]);
    setIsAddModalOpen(false);
    setNewReceipt({ vendor: "", items: "", type: "Supplies" });
    addToast("Receipt logged successfully", "success");
  };

  const selectedReceipt = useMemo(() => data.find(r => r.id === selectedId), [data, selectedId]);

  const columns = useMemo((): DataTableColumn<ReceiptRow>[] => [
    { key: "id", header: "Receipt ID", render: (row) => <span className="font-mono text-xs text-text-secondary">{row.id}</span> },
    { key: "date", header: "Date" },
    { key: "vendor", header: "Source/Vendor", render: (row) => <span className="font-medium">{row.vendor}</span> },
    { key: "type", header: "Type", render: (row) => <Badge variant="outline">{row.type}</Badge> },
    { key: "items", header: "Items Received" },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={row.status === "Received" ? "brand" : "default"}>{row.status}</Badge>
      ),
    },
  ], []);

  return (
    <div className="flex h-full relative p-4 md:p-8">
      <div className={cn("flex-1 flex flex-col h-full transition-all", selectedReceipt ? "md:pr-[480px] duration-200 ease-out" : "duration-150 ease-in")}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold mb-2">Receiving</h1>
            <p className="text-sm text-text-secondary">Log incoming shipments, supplies, wholesale plants, and returns.</p>
          </div>
          <Button variant="brand" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Log Receipt
          </Button>
        </div>

        <Card className="flex-1 overflow-auto flex flex-col">
          <StateRenderer
            state={resolveDataViewState(isLoading, isError, isEmpty)}
            data={data}
            loadingFallback={<LoadingTable cols={6} rows={15} />}
            errorFallback={<ErrorState />}
            emptyFallback={<EmptyState icon={Package} title="No Incoming Shipments" description="Nothing is pending receipt." />}
          >
            {(rows) => (
              <DataTable columns={columns} data={rows} onRowClick={(row) => setSelectedId(row.id)} />
            )}
          </StateRenderer>
        </Card>
      </div>

      {/* Slide-in Detail Panel */}
      <div 
        className={cn(
          "fixed inset-0 md:inset-auto md:top-[56px] md:right-0 md:bottom-0 w-full md:w-[480px] bg-bg-base md:bg-[rgba(255,255,255,0.04)] backdrop-blur-md md:border-l border-border-subtle shadow-2xl transition-transform z-50 md:z-20 flex flex-col", selectedReceipt ? "translate-x-0 duration-200 ease-out" : "translate-x-full duration-150 ease-in"
        )}
      >
        {selectedReceipt && (
          <>
            <div className="p-4 md:p-6 border-b border-border-subtle flex items-start justify-between bg-bg-elevated md:bg-transparent">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xl font-semibold">{selectedReceipt.id}</h2>
                  <Badge variant={selectedReceipt.status === "Received" ? "brand" : "default"}>
                    {selectedReceipt.status}
                  </Badge>
                </div>
                <div className="text-sm text-text-secondary">Received {selectedReceipt.date}</div>
              </div>
              <button 
                onClick={() => setSelectedId(null)}
                className="p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
              <section>
                 <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Origin</h3>
                 <div className="p-4 rounded-xl border border-border-subtle bg-bg-active">
                    <div className="text-lg font-medium">{selectedReceipt.vendor}</div>
                    <div className="text-sm text-text-secondary mt-2">Type: {selectedReceipt.type}</div>
                 </div>
              </section>

              <section>
                 <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Manifest</h3>
                 <div className="p-4 rounded-xl border border-border-subtle">
                    <p className="text-text-primary">{selectedReceipt.items}</p>
                 </div>
              </section>

              {selectedReceipt.status === "Pending Inspection" && (
                 <section className="bg-bg-active p-4 rounded-xl border border-border-subtle animate-pulse">
                    <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Pending Inspection
                    </h3>
                    <p className="text-sm text-text-secondary mb-4">Please verify the contents match the manifest before recording into inventory.</p>
                    <div className="flex gap-2">
                       <Button variant="outline" className="flex-1" onClick={() => addToast("Issue flagged. Quality check requested.", "info")}>Flag Issue</Button>
                       <Button className="flex-1" onClick={() => {
                          setReceiptsData(prev => prev.map(r => r.id === selectedReceipt.id ? { ...r, status: "Received" } : r));
                          addToast("Receipt marked as inspected and received.", "success");
                       }}>Mark Inspected</Button>
                    </div>
                 </section>
              )}
               {selectedReceipt.status === "Quarantined" && (
                 <section className="bg-status-warn/10 p-4 rounded-xl border border-status-warn/20">
                    <h3 className="text-sm font-medium mb-2 text-status-warn">Currently in Quarantine</h3>
                    <p className="text-sm text-text-secondary">Live plants must wait 14 days in isolation before moving to main inventory. Release timing is tracked outside this app for now.</p>
                 </section>
              )}
            </div>
          </>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl flex flex-col">
             <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
              <h2 className="text-lg font-semibold">Log Receipt</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <form id="add-receipt-form" onSubmit={handleAddReceipt} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Vendor / Source</label>
                  <Input required placeholder="SuperMoss" value={newReceipt.vendor} onChange={(e) => setNewReceipt({...newReceipt, vendor: e.target.value})} className="w-full" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <select
                     value={newReceipt.type}
                     onChange={(e) => setNewReceipt({...newReceipt, type: e.target.value})}
                     className="w-full bg-bg-base border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-brand focus:border-transparent"
                  >
                     <option value="Supplies">Supplies</option>
                     <option value="Plants">Plants</option>
                     <option value="Return">Customer Return</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Items Manifest</label>
                  <Input required placeholder="Sphagnum Moss (50kg)" value={newReceipt.items} onChange={(e) => setNewReceipt({...newReceipt, items: e.target.value})} className="w-full" />
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-border-subtle bg-bg-base/50 flex justify-end gap-2 shrink-0">
               <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
               <Button variant="brand" type="submit" form="add-receipt-form">Save Receipt</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
