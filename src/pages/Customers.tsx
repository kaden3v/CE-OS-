import { useState, useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Store, ShoppingBag, X, MessageSquare, Mail, History } from "lucide-react";
import { useDataState } from "@/hooks/useDataState";
import { LoadingTable, ErrorState, EmptyState } from "@/components/ui/StateRenderer";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { CultivarName } from "@/components/ui/CultivarName";

const CUSTOMERS = Array.from({ length: 25 }).map((_, i) => {
  const names = ["Sarah Chen", "Marcus Aldana", "Priya Patel", "Alice Smith", "Luis Garcia", "Emma Wilson"];
  const name = names[Math.floor(Math.random() * names.length)] + " " + i;
  const channel = Math.random() > 0.5 ? "Shopify" : "Etsy";
  const numOrders = Math.floor(Math.random() * 8) + 1;
  const ltv = numOrders * (15 + Math.floor(Math.random() * 40));
  
  return {
    id: i + 1,
    name,
    email: name.toLowerCase().replace(" ", ".") + "@example.com",
    channel,
    orders: numOrders,
    ltv: ltv,
    lastOrder: `${Math.floor(Math.random() * 30) + 1} days ago`,
    rosetteSubscriber: Math.random() > 0.8 && channel === "Shopify",
  };
});

export default function Customers() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data, isLoading, isError, isEmpty } = useDataState(CUSTOMERS);

  const selectedCustomer = useMemo(() => data.find((c) => c.id === selectedId), [data, selectedId]);

  const columns = useMemo(() => [
    {
      accessorKey: "name",
      header: "Name",
      cell: (info: any) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary">{info.getValue()}</span>
          {info.row.original.rosetteSubscriber && (
            <Badge variant="brand">Rosette+</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: (info: any) => <span className="text-text-secondary">{info.getValue()}</span>,
    },
    {
      accessorKey: "channel",
      header: "Pref. Channel",
      cell: (info: any) => (
        <div className="flex items-center gap-2 text-text-secondary">
          {info.getValue() === "Shopify" ? <Store className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
          {info.getValue()}
        </div>
      ),
    },
    {
      accessorKey: "orders",
      header: "Total Orders",
      cell: (info: any) => <span className="tabular-nums">{info.getValue()}</span>,
    },
    {
      accessorKey: "ltv",
      header: "Lifetime Value",
      cell: (info: any) => <span className="tabular-nums font-medium">${info.getValue().toFixed(2)}</span>,
    },
    {
      accessorKey: "lastOrder",
      header: "Last Order",
      cell: (info: any) => <span className="text-text-secondary">{info.getValue()}</span>,
    },
  ], []);

  return (
    <div className="flex h-full relative">
      <div className={cn("flex-1 p-4 md:p-8 flex flex-col h-full transition-all", selectedCustomer ? "md:pr-[480px] duration-200 ease-out" : "duration-150 ease-in")}>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-2">Customers</h1>
          <p className="text-sm text-text-secondary">Read-only view of customer lifetime value and order history.</p>
        </div>

        <Card className="flex-1 overflow-auto flex flex-col">
          {isLoading ? (
             <LoadingTable cols={6} rows={15} />
          ) : isError ? (
             <ErrorState />
          ) : isEmpty ? (
             <EmptyState title="No customers yet" description="They will appear here after the first order imports." />
          ) : (
             <DataTable columns={columns} data={data} onRowClick={(row) => setSelectedId(row.id)} />
          )}
        </Card>
      </div>

      {/* Slide-in Detail Panel */}
      <div 
        className={cn(
          "fixed inset-0 md:inset-auto md:top-[56px] md:right-0 md:bottom-0 w-full md:w-[480px] bg-bg-base md:bg-[rgba(255,255,255,0.04)] backdrop-blur-md md:border-l border-border-subtle shadow-2xl transition-transform z-50 md:z-20 flex flex-col", selectedCustomer ? "translate-x-0 duration-200 ease-out" : "translate-x-full duration-150 ease-in"
        )}
      >
        {selectedCustomer && (
          <>
            <div className="p-4 md:p-6 border-b border-border-subtle flex items-start justify-between bg-bg-elevated md:bg-transparent">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-full bg-accent-brand/20 text-accent-brand flex items-center justify-center text-lg font-medium border border-accent-brand/30">
                    {selectedCustomer.name.split(" ").map((n: string) => n[0]).join("")}
                 </div>
                 <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-xl font-semibold">{selectedCustomer.name}</h2>
                    {selectedCustomer.rosetteSubscriber && <Badge variant="brand">Rosette+</Badge>}
                  </div>
                  <div className="text-sm text-text-secondary flex items-center gap-2">
                     <Mail className="w-3.5 h-3.5" />
                     {selectedCustomer.email}
                  </div>
                 </div>
              </div>
              <button 
                onClick={() => setSelectedId(null)}
                className="hidden md:flex p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                 <div className="p-4 rounded-xl bg-bg-active border border-border-subtle">
                    <div className="text-xs text-text-secondary uppercase mb-2">Total Orders</div>
                    <div className="text-2xl font-medium tabular-nums">{selectedCustomer.orders}</div>
                 </div>
                 <div className="p-4 rounded-xl bg-bg-active border border-border-subtle">
                    <div className="text-xs text-text-secondary uppercase mb-2">Lifetime Value</div>
                    <div className="text-2xl font-medium tabular-nums text-ok">${selectedCustomer.ltv.toFixed(2)}</div>
                 </div>
              </div>

              <section>
                 <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Associations & History</h3>
                 <div className="space-y-2">
                    <Link to={`/customers/${selectedCustomer.id}/thread`} className="flex items-center justify-between p-2 rounded-lg border border-border-subtle bg-[rgba(255,255,255,0.02)] hover:bg-bg-hover transition-colors group">
                       <div className="flex items-center gap-2">
                         <div className="w-8 h-8 rounded bg-bg-elevated flex items-center justify-center text-text-secondary group-hover:text-text-primary transition-colors">
                            <MessageSquare className="w-4 h-4" />
                         </div>
                         <div>
                            <span className="font-medium text-sm block">Comms Thread</span>
                            <span className="text-xs text-text-tertiary">Etsy Messages & Emails</span>
                         </div>
                       </div>
                       <Badge>2 Unread</Badge>
                    </Link>
                    
                    <button className="w-full flex items-center justify-between p-2 rounded-lg border border-border-subtle bg-[rgba(255,255,255,0.02)] hover:bg-bg-hover transition-colors group">
                       <div className="flex items-center gap-2">
                         <div className="w-8 h-8 rounded bg-bg-elevated flex items-center justify-center text-text-secondary group-hover:text-text-primary transition-colors">
                            <History className="w-4 h-4" />
                         </div>
                         <div>
                            <span className="font-medium text-sm block">Order History</span>
                            <span className="text-xs text-text-tertiary">Last seen {selectedCustomer.lastOrder}</span>
                         </div>
                       </div>
                    </button>
                 </div>
              </section>
            </div>
            
            <div className="md:hidden p-4 border-t border-border-subtle pb-safe">
              <Button variant="outline" className="w-full" onClick={() => setSelectedId(null)}>Close</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
