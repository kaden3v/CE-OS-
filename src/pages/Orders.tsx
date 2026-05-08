import { useState, useMemo } from "react";
import { Link } from "react-router";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { X, Search, Filter, Printer, PackageCheck, Send, Store, ShoppingBag, PackageSearch, Barcode, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CultivarName } from "@/components/ui/CultivarName";
import { useDataState } from "@/hooks/useDataState";
import { LoadingTable, ErrorState, EmptyState } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";

// Generate 30 realistic orders
const CULTIVARS = [
  "P. 'Pirouette'", "P. agnata 'El Lobo'", "P. 'Johanna'", "P. gigantea", 
  "P. moranensis", "P. agnata", "P. debbertiana", "P. 'Tina'", "P. 'Sethos'", "P. esseriana", "D. capensis 'Red'"
];
const NAMES = ["Sarah Chen", "Marcus Aldana", "Priya Patel", "John Doe", "Alice Smith", "Bob Johnson", "Emma Wilson", "James Taylor", "Sophia Davis", "Luis Garcia"];
const STATUSES = ["Pending", "Processing", "Packed", "Shipped", "Delivered", "Cancelled"];
const CHANNELS = ["Etsy", "Shopify"];

const getStatusColor = (status: string) => {
  switch (status) {
    case "Pending": return "alert";
    case "Processing": return "warn";
    case "Packed": return "info";
    case "Shipped": return "ok";
    case "Delivered": return "ok";
    default: return "warn";
  }
};

const fullMockOrders = Array.from({ length: 30 }).map((_, i) => ({
  id: `ORD-${1200 + i}`,
  channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)],
  customer: NAMES[Math.floor(Math.random() * NAMES.length)],
  items: Array.from({ length: Math.floor(Math.random() * 3) + 1 }).map(() => ({
    name: CULTIVARS[Math.floor(Math.random() * CULTIVARS.length)],
    qty: Math.floor(Math.random() * 2) + 1,
    price: 15 + Math.floor(Math.random() * 20),
  })),
  status: STATUSES[Math.floor(Math.random() * STATUSES.length)],
  created: new Date(Date.now() - Math.random() * 10000000000).toISOString().split('T')[0],
}));

export default function Orders() {
  const { globalOrderViewId, setGlobalOrderViewId } = useApp();
  const { data: orders, isLoading, isError, isEmpty } = useDataState(fullMockOrders);
  const [activeTab, setActiveTab] = useState<"all" | "pack-queue">("all");
  const [packingOrder, setPackingOrder] = useState<any | null>(null);
  const [packStep, setPackStep] = useState(1);
  
  const selectedOrder = useMemo(() => {
    if (!globalOrderViewId) return null;
    return fullMockOrders.find(o => o.id === globalOrderViewId) || null;
  }, [globalOrderViewId]);

  const columns = useMemo(() => [
    {
      accessorKey: "id",
      header: "Order #",
      cell: (info: any) => <span className="font-medium text-text-primary hover:underline hover:text-text-secondary cursor-pointer" onClick={(e) => { e.stopPropagation(); setGlobalOrderViewId(info.getValue()); }}>{info.getValue()}</span>,
    },
    {
      accessorKey: "channel",
      header: "Channel",
      cell: (info: any) => (
        <div className="flex items-center gap-2 text-text-secondary">
          {info.getValue() === "Shopify" ? <Store className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
          {info.getValue()}
        </div>
      ),
    },
    {
      accessorKey: "customer",
      header: "Customer",
      cell: (info: any) => (
        <Link 
          to="/customers" 
          onClick={(e) => e.stopPropagation()} 
          className="text-text-primary hover:underline decoration-text-secondary transition-colors"
        >
          {info.getValue()}
        </Link>
      )
    },
    {
      accessorKey: "items",
      header: "Items",
      cell: (info: any) => <span className="text-text-secondary">{info.getValue().length} items</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: (info: any) => (
        <div className="flex items-center gap-2">
          <StatusDot status={getStatusColor(info.getValue()) as any} />
          {info.getValue()}
        </div>
      ),
    },
    {
      id: "subtotal",
      header: "Subtotal",
      cell: (info: any) => {
        const total = info.row.original.items.reduce((acc: number, item: any) => acc + item.price * item.qty, 0);
        return <span>${total.toFixed(2)}</span>;
      },
    },
    {
      accessorKey: "created",
      header: "Created",
      cell: (info: any) => <span className="text-text-secondary">{info.getValue()}</span>,
    },
  ], [setGlobalOrderViewId]);

  const queuedOrders = useMemo(() => orders.filter(o => o.status === "Processing" || o.status === "Pending").slice(0, 5), [orders]);

  const renderPackWorkflow = () => {
     if (!packingOrder) return null;
     
     return (
        <div className="fixed inset-0 bg-bg-base/90 backdrop-blur-sm z-[100] p-4 flex items-center justify-center">
           <Card className="w-full max-w-2xl bg-bg-elevated border-border-strong shadow-2xl flex flex-col h-[500px] overflow-hidden relative">
              {/* Header */}
              <div className="p-4 border-b border-border-subtle flex items-center justify-between shrink-0 bg-bg-active">
                 <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                       <PackageCheck className="w-5 h-5 text-accent-brand" />
                       Packing {packingOrder.id}
                    </h2>
                    <p className="text-xs text-text-secondary">{packingOrder.customer}</p>
                 </div>
                 <button onClick={() => { setPackingOrder(null); setPackStep(1); }} className="p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg transition-colors">
                    <X className="w-5 h-5" />
                 </button>
              </div>

              {/* Body */}
              <div className="flex-1 flex min-h-0 bg-bg-base">
                 {/* Steps Sidebar */}
                 <div className="w-48 bg-bg-active border-r border-border-subtle p-4 shrink-0 overflow-y-auto">
                    {[
                       { step: 1, label: "Scan Pick Bin" },
                       { step: 2, label: "Verify Line Items" },
                       { step: 3, label: "Verify Photos" },
                       { step: 4, label: "Add Bonuses" },
                       { step: 5, label: "Generate Label" }
                    ].map((s) => (
                       <div key={s.step} className={cn(
                          "py-2 px-2 rounded-md text-sm font-medium mb-2 transition-colors flex items-center",
                          packStep === s.step ? "bg-accent-brand text-text-primary shadow-sm" : 
                          packStep > s.step ? "text-status-ok" : "text-text-tertiary"
                       )}>
                          <div className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[9px] mr-2 shrink-0 border",
                             packStep === s.step ? "border-text-primary" : packStep > s.step ? "border-transparent text-status-ok" : "border-border-strong"
                          )}>
                             {packStep > s.step ? <CheckCircle2 className="w-4 h-4" /> : s.step}
                          </div>
                          {s.label}
                       </div>
                    ))}
                 </div>

                 {/* Content Area */}
                 <div className="flex-1 p-8 flex flex-col overflow-y-auto relative">
                    {packStep === 1 && (
                       <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                          <div className="w-16 h-16 rounded-full bg-bg-active border border-border-subtle flex items-center justify-center mb-6">
                             <Barcode className="w-8 h-8 text-text-secondary" />
                          </div>
                          <h3 className="text-xl font-medium mb-2">Scan Pick Bin QR</h3>
                          <p className="text-sm text-text-secondary mb-6">Scan the QR code on the physical bin used to collect this order's items during pick.</p>
                          <div className="w-full relative">
                             <input type="text" placeholder="BIN-..." className="w-full bg-bg-elevated border border-border-strong rounded-lg px-4 py-2 text-center font-mono focus:outline-none focus:border-accent-brand transition-colors" />
                             <div className="absolute inset-y-0 right-3 flex items-center">
                                <span className="text-[10px] text-text-tertiary uppercase tracking-wider bg-bg-active px-2 py-2 rounded border border-border-subtle">Ready</span>
                             </div>
                          </div>
                       </div>
                    )}
                    {packStep === 2 && (
                       <div className="flex-1 flex flex-col">
                          <h3 className="text-lg font-medium mb-4">Verify Inventory</h3>
                          <div className="space-y-2 flex-1 overflow-auto">
                             {packingOrder.items.map((item: any, idx: number) => (
                                <div key={idx} className="p-2 border border-border-subtle rounded-lg bg-bg-active flex items-center justify-between cursor-pointer hover:border-accent-brand focus:bg-accent-brand/10 transition-colors">
                                   <div className="flex items-center gap-2">
                                      <div className="w-5 h-5 rounded border border-border-strong flex items-center justify-center">
                                         {/* Assume checked for demo */}
                                      </div>
                                      <span className="font-medium">{item.name}</span>
                                   </div>
                                   <div className="text-sm text-text-secondary font-mono">Qty: {item.qty}</div>
                                </div>
                             ))}
                          </div>
                       </div>
                    )}
                    {packStep > 2 && (
                       <div className="flex-1 flex items-center justify-center text-text-secondary">
                          Placeholder for step {packStep} details.
                       </div>
                    )}
                 </div>
              </div>

              {/* Footer Actions */}
              <div className="p-4 border-t border-border-subtle flex items-center justify-between shrink-0 bg-bg-base">
                 <Button variant="outline" onClick={() => setPackStep(p => Math.max(1, p - 1))} disabled={packStep === 1}>Back</Button>
                 <Button 
                   onClick={() => {
                      if (packStep < 5) setPackStep(p => p + 1);
                      else {
                         setPackingOrder(null);
                         setPackStep(1);
                      }
                   }}
                   className={cn(packStep === 5 ? "bg-status-ok text-bg-base hover:bg-status-ok/90" : "")}
                 >
                    {packStep === 5 ? "Mark Packed & Print Label" : "Next Step"}
                 </Button>
              </div>
           </Card>
        </div>
     );
  };

  return (
    <div className="flex h-full relative">
      <div className={cn("flex-1 p-4 md:p-8 flex flex-col transition-all", selectedOrder ? "pr-0 md:pr-[480px] duration-200 ease-out" : "duration-150 ease-in")}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-semibold mb-2">Orders</h1>
            <p className="text-sm text-text-secondary">Central source of truth for Shopify and Etsy sales.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <Input placeholder="Search orders..." className="pl-8 w-64" />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              Filter
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6 border-b border-border-subtle pb-px relative shrink-0">
          <button
            onClick={() => setActiveTab("all")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px]",
              activeTab === "all" ? "border-text-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            All Orders
          </button>
          <button
            onClick={() => setActiveTab("pack-queue")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px] flex items-center gap-2",
              activeTab === "pack-queue" ? "border-status-ok text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            <PackageCheck className="w-4 h-4" />
            Pack Queue
            <Badge variant="default" className="ml-2 px-2 py-0 text-xs bg-bg-active">5</Badge>
          </button>
        </div>

        {activeTab === "all" ? (
           <Card className="flex-1 overflow-auto flex flex-col min-h-0">
             {isLoading ? (
               <LoadingTable cols={7} rows={12} />
             ) : isError ? (
               <ErrorState title="Couldn't load orders" description="Check your connection to Shopify and Etsy and try again." onRetry={() => window.location.reload()} />
             ) : isEmpty ? (
               <EmptyState icon={PackageSearch} title="No orders yet" description="Orders will appear here as they import from Etsy and Shopify." action={<Button variant="outline" className="mt-2">Refresh sync</Button>} />
             ) : (
               <DataTable columns={columns} data={orders} onRowClick={(row) => setGlobalOrderViewId(row.id)} />
             )}
           </Card>
        ) : (
           <div className="flex-1 overflow-auto min-h-0">
             {queuedOrders.length === 0 ? (
               <EmptyState icon={PackageCheck} title="Nothing to pack" description="Pending orders will appear here when they're ready." />
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {queuedOrders.map(order => (
                     <Card key={order.id} className="p-4 border-status-ok/20 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-status-ok/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110 pointer-events-none"></div>
                        <div className="flex justify-between items-start mb-4">
                           <div>
                              <h3 className="font-semibold text-lg flex items-center gap-2">{order.id}</h3>
                              <div className="text-sm text-text-secondary">{order.customer}</div>
                           </div>
                           <div className="flex flex-col items-end">
                              <Badge variant="outline" className="mb-2">{order.channel}</Badge>
                              <div className="text-xs text-text-tertiary">30 mins ago</div>
                           </div>
                        </div>

                        <div className="space-y-1 mb-4 flex-1 min-h-[60px]">
                           {order.items.map((item: any, idx: number) => (
                              <div key={idx} className="flex justify-between text-sm">
                                 <span className="text-text-primary line-clamp-1">{item.name}</span>
                                 <span className="text-text-secondary font-mono w-8 text-right shrink-0">x{item.qty}</span>
                              </div>
                           ))}
                        </div>

                        <Button 
                          variant="brand" 
                          className="w-full shadow-[0_0_15px_rgba(194,113,79,0.15)] hover:shadow-[0_0_20px_rgba(194,113,79,0.25)] transition-shadow"
                          onClick={() => { setPackingOrder(order); setPackStep(1); }}
                        >
                          <PackageCheck className="w-4 h-4 mr-2" /> Start Packing
                        </Button>
                     </Card>
                  ))}
                  
                  <Card className="p-4 border-dashed border-border-strong bg-transparent flex flex-col items-center justify-center text-text-tertiary h-[220px]">
                     <CheckCircle2 className="w-8 h-8 mb-2 opacity-50" />
                     <p className="text-sm">No more orders in queue</p>
                  </Card>
               </div>
             )}
           </div>
        )}
      </div>

      {/* Slide-in Detail Panel */}
      <div 
        className={cn(
          "fixed inset-0 md:inset-auto md:top-[56px] md:right-0 md:bottom-0 w-full md:w-[480px] bg-bg-base md:bg-[rgba(255,255,255,0.04)] backdrop-blur-md md:border-l border-border-subtle shadow-2xl transition-transform z-50 md:z-20 flex flex-col", selectedOrder ? "translate-x-0 duration-200 ease-out" : "translate-x-full duration-150 ease-in"
        )}
      >
        {selectedOrder && (
          <>
            <div className="p-4 md:p-6 border-b border-border-subtle flex items-start justify-between bg-bg-elevated md:bg-transparent shrink-0">
               <div>
                  <div className="flex items-center gap-2 mb-2">
                     <h2 className="text-xl font-semibold">{selectedOrder.id}</h2>
                     <Badge variant={selectedOrder.channel === "Shopify" ? "brand" : "default"}>
                        {selectedOrder.channel}
                     </Badge>
                     <div className="flex items-center gap-2 text-sm">
                        <StatusDot status={getStatusColor(selectedOrder.status as string) as any} />
                        {selectedOrder.status}
                     </div>
                  </div>
                  <div className="text-sm text-text-secondary">{selectedOrder.created}</div>
               </div>
               <button 
                  onClick={() => setGlobalOrderViewId(null)}
                  className="p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors"
               >
                  <X className="w-5 h-5" />
               </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
               {/* Customer */}
               <section>
                  <div className="flex justify-between items-end mb-2">
                     <h3 className="text-xs uppercase tracking-wide text-text-secondary">Customer</h3>
                     <Link to="/customers" className="text-xs text-text-secondary hover:text-text-primary transition-colors">View profile &rarr;</Link>
                  </div>
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 rounded-full bg-bg-active border border-border-subtle flex items-center justify-center text-lg font-medium">
                        {selectedOrder.customer.split(" ").map(n => n[0]).join("")}
                     </div>
                     <div>
                        <Link to="/customers" className="font-medium hover:underline decoration-text-secondary transition-colors block">{selectedOrder.customer}</Link>
                        <div className="text-sm text-text-secondary">{selectedOrder.customer.toLowerCase().replace(" ", ".")}@example.com</div>
                     </div>
                  </div>
               </section>

               {/* Line Items */}
               <section>
                  <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Line Items</h3>
                  <div className="space-y-3">
                     {selectedOrder.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-sm p-2 bg-bg-active rounded-lg border border-border-subtle hover:border-border-strong transition-colors cursor-default">
                           <div>
                              <Link to="/cultivars" className="font-medium hover:underline decoration-text-secondary transition-colors">{item.name}</Link>
                              <div className="text-text-secondary mt-2">Qty: {item.qty}</div>
                           </div>
                           <div className="font-medium tabular-nums text-right">
                              ${(item.price * item.qty).toFixed(2)}
                              <div className="text-xs text-text-secondary mt-2 font-normal">${item.price.toFixed(2)} ea</div>
                           </div>
                        </div>
                     ))}
                  </div>
               </section>

               {/* Shipping */}
               <section>
                  <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Shipping</h3>
                  <div className="text-sm space-y-1 p-4 rounded-lg border border-border-subtle bg-bg-base">
                     <div className="font-medium">Destination</div>
                     <div className="text-text-secondary mb-4">
                        123 Main St<br/>
                        Apt 4B<br/>
                        Phoenix, AZ 85001
                     </div>
                     <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                        <span className="text-text-secondary">Recommendation</span>
                        <Badge variant="brand">Ship Now</Badge>
                     </div>
                  </div>
               </section>

               <section className="pt-4 mt-8 border-t border-border-subtle">
                  <div className="flex items-center justify-between cursor-pointer group">
                     <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">View audit history (3 entries)</span>
                     <span className="text-[10px] uppercase font-medium bg-bg-active text-text-tertiary px-2 py-2 rounded">Log</span>
                  </div>
               </section>
            </div>

            {/* Actions */}
            <div className="p-4 md:p-6 border-t border-border-subtle grid grid-cols-2 gap-2 bg-bg-base/50 pb-safe shrink-0">
               <Button variant="outline" className="w-full">
                  <Printer className="w-4 h-4 mr-2" />
                  Print List
               </Button>
               <Button className="w-full" onClick={() => { setGlobalOrderViewId(null); setPackingOrder(selectedOrder); setPackStep(1); }}>
                  <PackageCheck className="w-4 h-4 mr-2" />
                  Pack Now
               </Button>
               <Button variant="brand" className="col-span-2">
                  <Send className="w-4 h-4 mr-2" />
                  Generate Label
               </Button>
            </div>
          </>
        )}
      </div>

      {/* Packing Overlay */}
      {renderPackWorkflow()}
    </div>
  );
}
