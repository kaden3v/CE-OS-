import { useState, useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/StateRenderer";
import { RefreshCcw, X, Code, AlignLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { CultivarName } from "@/components/ui/CultivarName";
import { useApp } from "@/contexts/AppContext";

const TABLES = ["customers", "orders", "inventory", "cultivars", "expenses"];
const ACTIONS = ["CREATE", "UPDATE", "DELETE"];

const AUDIT_LOG = Array.from({ length: 60 }).map((_, i) => {
  const tId = Math.random().toString(36).substring(2, 10);
  return {
    id: `log-${i}`,
    timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().replace("T", " ").substring(0, 19),
    table: TABLES[Math.floor(Math.random() * TABLES.length)],
    action: ACTIONS[Math.floor(Math.random() * ACTIONS.length)],
    recordId: tId,
    actor: "Kaden (Admin)",
  };
}).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

const WEBHOOKS = [
  { id: "EVT-882", source: "shopify", type: "orders/create", timestamp: "10 mins ago", status: "success", payload: { "id": 4829103, "total_price": "45.00", "currency": "USD", "line_items": [{ "title": "P. 'Pirouette'", "quantity": 1 }] } },
  { id: "EVT-881", source: "stripe", type: "charge.succeeded", timestamp: "1 hour ago", status: "success", payload: { "id": "ch_3P2q", "amount": 4500, "status": "succeeded" } },
  { id: "EVT-880", source: "etsy", type: "shop_receipt", timestamp: "2 hours ago", status: "failed", payload: { "receipt_id": 99281, "message": "Signature mismatch" } },
  { id: "EVT-879", source: "shopify", type: "inventory_levels/update", timestamp: "5 hours ago", status: "success", payload: { "inventory_item_id": 91823, "available": 10 } },
];

export default function AuditLog() {
  const [activeTab, setActiveTab] = useState<"database" | "webhooks">("webhooks");
  const [webhookSourceFilter, setWebhookSourceFilter] = useState("all");
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [payloadView, setPayloadView] = useState<"raw" | "mapped">("raw");
  const { addToast } = useApp();

  const selectedWebhook = useMemo(() => WEBHOOKS.find(w => w.id === selectedWebhookId), [selectedWebhookId]);

  const auditColumns = useMemo(() => [
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      cell: (info: any) => <span className="text-text-secondary tabular-nums">{info.getValue()}</span>,
    },
    {
      accessorKey: "table",
      header: "Table",
      cell: (info: any) => <span className="font-medium text-text-primary">{info.getValue()}</span>,
    },
    {
      accessorKey: "recordId",
      header: "Record ID",
      cell: (info: any) => <span className="font-mono text-xs text-text-tertiary">{info.getValue()}</span>,
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: (info: any) => {
        const val = info.getValue();
        return (
          <Badge variant={val === "DELETE" ? "default" : "brand"} className={val === "DELETE" ? "text-status-alert border-status-alert/20" : ""}>
            {val}
          </Badge>
        );
      },
    },
    {
      accessorKey: "actor",
      header: "Actor",
      cell: (info: any) => <span className="text-text-secondary">{info.getValue()}</span>,
    },
  ], []);

  const webhookColumns = useMemo(() => [
    { accessorKey: "id", header: "Event ID", cell: (info: any) => <span className="font-mono text-xs">{info.getValue()}</span> },
    { accessorKey: "timestamp", header: "Time", cell: (info: any) => <span className="text-text-secondary">{info.getValue()}</span> },
    { accessorKey: "source", header: "Source", cell: (info: any) => <Badge variant="outline" className="capitalize">{info.getValue()}</Badge> },
    { accessorKey: "type", header: "Event Type", cell: (info: any) => <span className="font-mono text-xs text-text-primary">{info.getValue()}</span> },
    { accessorKey: "status", header: "Status", cell: (info: any) => (
      <Badge variant={info.getValue() === "success" ? "brand" : "default"} className={info.getValue() !== "success" ? "text-status-alert border-status-alert/20" : ""}>
         {info.getValue()}
      </Badge>
    )},
  ], []);

  const filteredWebhooks = useMemo(() => {
    if (webhookSourceFilter === "all") return WEBHOOKS;
    return WEBHOOKS.filter(w => w.source === webhookSourceFilter);
  }, [webhookSourceFilter]);

  return (
    <div className="flex h-full relative p-4 md:p-8 max-w-7xl mx-auto">
      <div className={cn("flex-1 flex flex-col h-full transition-all", selectedWebhook ? "md:pr-[480px] duration-200 ease-out" : "duration-150 ease-in")}>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-2">System Logs</h1>
          <p className="text-sm text-text-secondary">Audit trails and external integration events.</p>
        </div>

        <div className="flex items-center gap-2 mb-6 border-b border-border-subtle pb-px">
          <button
            onClick={() => setActiveTab("database")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px]",
              activeTab === "database" ? "border-text-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            Database Audit
          </button>
          <button
            onClick={() => setActiveTab("webhooks")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px]",
              activeTab === "webhooks" ? "border-text-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            Webhook Explorer
          </button>
        </div>

        {activeTab === "database" ? (
          <Card className="flex-1 overflow-auto">
            {AUDIT_LOG.length === 0 ? (
               <EmptyState title="Nothing recorded yet" description="Mutations will appear here." />
            ) : (
               <DataTable columns={auditColumns} data={AUDIT_LOG} />
            )}
          </Card>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
             <div className="mb-4">
                <select 
                  className="bg-bg-base border border-border-subtle rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-border-strong hover:border-border-strong transition-colors"
                  value={webhookSourceFilter}
                  onChange={(e) => setWebhookSourceFilter(e.target.value)}
                >
                   <option value="all">All Sources</option>
                   <option value="shopify">Shopify</option>
                   <option value="etsy">Etsy</option>
                   <option value="stripe">Stripe</option>
                </select>
             </div>
             <Card className="flex-1 overflow-auto">
               {filteredWebhooks.length === 0 ? (
                  <EmptyState title="Nothing recorded yet" description="Webhook payloads will appear here." />
               ) : (
                  <DataTable columns={webhookColumns} data={filteredWebhooks} onRowClick={(row: any) => setSelectedWebhookId(row.id)} />
               )}
             </Card>
          </div>
        )}
      </div>

      {/* Slide-in Detail Panel for Webhooks */}
      <div 
        className={cn(
          "fixed inset-0 md:inset-auto md:top-[56px] md:right-0 md:bottom-0 w-full md:w-[480px] bg-bg-base md:bg-[rgba(255,255,255,0.04)] backdrop-blur-md md:border-l border-border-subtle shadow-2xl transition-transform z-50 md:z-20 flex flex-col", selectedWebhook ? "translate-x-0 duration-200 ease-out" : "translate-x-full duration-150 ease-in"
        )}
      >
        {selectedWebhook && (
          <>
            <div className="p-4 md:p-6 pb-0 border-b border-border-subtle flex flex-col bg-bg-elevated md:bg-transparent shrink-0">
               <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h2 className="text-xl font-semibold font-mono">{selectedWebhook.id}</h2>
                      <Badge variant={selectedWebhook.status === "success" ? "brand" : "default"} className={selectedWebhook.status !== "success" ? "text-status-alert border-status-alert/20" : ""}>
                         {selectedWebhook.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-text-secondary">{selectedWebhook.timestamp}</div>
                  </div>
                  <button 
                    onClick={() => setSelectedWebhookId(null)}
                    className="p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
               </div>

               <div className="flex items-center gap-4 mb-6">
                 <div>
                    <div className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Source</div>
                    <div className="font-medium capitalize">{selectedWebhook.source}</div>
                 </div>
                 <div>
                    <div className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Event Type</div>
                    <div className="font-mono text-sm">{selectedWebhook.type}</div>
                 </div>
               </div>

               <div className="flex gap-6 border-b border-transparent">
                  <button
                    onClick={() => setPayloadView("raw")}
                    className={cn(
                      "pb-2 text-sm font-medium transition-colors relative flex items-center gap-2",
                      payloadView === "raw" ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    <Code className="w-4 h-4" />
                    Raw Payload
                    {payloadView === "raw" && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-text-primary"></div>
                    )}
                  </button>
                  <button
                    onClick={() => setPayloadView("mapped")}
                    className={cn(
                      "pb-2 text-sm font-medium transition-colors relative flex items-center gap-2",
                      payloadView === "mapped" ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    <AlignLeft className="w-4 h-4" />
                    Mapped Objects
                    {payloadView === "mapped" && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-brand"></div>
                    )}
                  </button>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6">
               {payloadView === "raw" ? (
                 <div className="bg-[#0D0D0D] p-4 rounded-xl border border-border-subtle overflow-x-auto">
                    <pre className="text-xs text-[#A0A0A0] font-mono leading-relaxed">
                       {JSON.stringify(selectedWebhook.payload, null, 2)}
                    </pre>
                 </div>
               ) : (
                 <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-border-subtle bg-bg-active">
                       <div className="text-sm font-medium mb-2">Mapped Application Entities</div>
                       <div className="text-xs text-text-secondary mb-4">The following internal records were affected by this event.</div>
                       
                       {selectedWebhook.source === "shopify" && selectedWebhook.type === "orders/create" && (
                         <div className="space-y-2">
                            <div className="flex justify-between items-center p-2 rounded bg-bg-base border border-border-subtle">
                               <span className="font-mono text-xs">Order</span>
                               <span className="text-accent-brand font-medium text-sm">ORD-1205</span>
                            </div>
                            <div className="flex justify-between items-center p-2 rounded bg-bg-base border border-border-subtle">
                               <span className="font-mono text-xs">Customer</span>
                               <span className="text-accent-brand font-medium text-sm">CUS-0912</span>
                            </div>
                         </div>
                       )}
                       {!(selectedWebhook.source === "shopify" && selectedWebhook.type === "orders/create") && (
                         <div className="text-sm text-text-tertiary">No mapped entities configured for this event type.</div>
                       )}
                    </div>
                 </div>
               )}
            </div>

            <div className="p-4 md:p-6 border-t border-border-subtle bg-bg-base/50 flex gap-2 pb-safe shrink-0">
               <Button variant="outline" className="flex-1 text-sm" onClick={() => {
                   addToast(`Replaying event ${selectedWebhook.id}...`, "info");
                   setTimeout(() => addToast("Replay dispatched successfully.", "success"), 1500);
               }}><RefreshCcw className="w-4 h-4 mr-2" /> Replay Event</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
