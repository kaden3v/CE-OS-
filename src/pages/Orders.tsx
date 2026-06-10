import { useState, useMemo, FormEvent } from "react";
import { Link } from "react-router";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { X, Search, Plus, Trash2, Store, ShoppingBag, PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { CultivarName } from "@/components/ui/CultivarName";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";
import { useOrders, type OrderWithRelations } from "@/hooks/useOrders";
import { useEntity } from "@/hooks/useEntity";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

type Customer = Tables<"customers">;
type Cultivar = Tables<"cultivars">;

const STATUSES = ["pending", "processing", "packed", "shipped", "delivered", "cancelled", "refunded"] as const;
type Status = (typeof STATUSES)[number];

const statusColor = (s: string) => {
  switch (s) {
    case "pending": return "alert" as const;
    case "processing": return "warn" as const;
    case "packed": return "info" as const;
    case "shipped": return "ok" as const;
    case "delivered": return "ok" as const;
    case "cancelled":
    case "refunded": return "warn" as const;
    default: return "info" as const;
  }
};

export default function Orders() {
  const { globalOrderViewId, setGlobalOrderViewId, addToast } = useApp();
  const { data: orders, isLoading, createOrder, updateStatus, updateItem, removeItem, deleteOrder } = useOrders();
  const { data: customers } = useEntity<Customer>("customers", [], { toRow: (c) => ({ name: c.name }) });
  const { data: cultivars } = useEntity<Cultivar>("cultivars", [], { toRow: (c) => ({ name: c.name }) });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const selected = useMemo(() => orders.find((o) => o.id === globalOrderViewId) ?? null, [orders, globalOrderViewId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matchSearch = !q || o.id.toLowerCase().includes(q) || (o.customer?.name ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  // Add-order form
  type DraftItem = { cultivar_id: string; qty: number; price: number };
  const [draft, setDraft] = useState<{ customer_id: string; channel: string; status: Status; items: DraftItem[] }>({
    customer_id: "",
    channel: "shopify",
    status: "pending",
    items: [{ cultivar_id: "", qty: 1, price: 0 }],
  });

  const addLine = () => setDraft((d) => ({ ...d, items: [...d.items, { cultivar_id: "", qty: 1, price: 0 }] }));
  const removeLine = (i: number) => setDraft((d) => ({ ...d, items: d.items.filter((_, idx) => idx !== i) }));
  const updateLine = (i: number, patch: Partial<DraftItem>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const items = draft.items
      .filter((it) => it.cultivar_id && it.qty > 0)
      .map((it) => {
        const cultivar = cultivars.find((c) => c.id === it.cultivar_id);
        return {
          cultivar_id: it.cultivar_id,
          inventory_id: null,
          name_snapshot: cultivar?.name ?? "Unknown",
          qty: it.qty,
          price: it.price,
        };
      });
    if (items.length === 0) {
      addToast({ title: "Add at least one line item", status: "warn" });
      return;
    }
    const result = await createOrder({
      customer_id: draft.customer_id || null,
      channel: draft.channel,
      status: draft.status,
      items,
    });
    if (!result.ok) {
      addToast({ title: "Couldn't create order", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setIsAddOpen(false);
    setDraft({ customer_id: "", channel: "shopify", status: "pending", items: [{ cultivar_id: "", qty: 1, price: 0 }] });
    addToast({ title: "Order created", description: `${items.length} item(s)`, status: "ok" });
  };

  const handleStatusChange = async (orderId: string, status: Status) => {
    const result = await updateStatus(orderId, status);
    if (!result.ok) {
      addToast({ title: "Couldn't update status", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    addToast({ title: "Status updated", description: status, status: "ok" });
  };

  const handleItemPatch = async (orderId: string, itemId: string, patch: { qty?: number; price?: number }) => {
    const result = await updateItem(orderId, itemId, patch);
    if (!result.ok) {
      addToast({ title: "Couldn't update item", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    addToast({ title: "Item updated", status: "ok" });
  };

  const handleItemRemove = async (orderId: string, itemId: string) => {
    const result = await removeItem(orderId, itemId);
    if (!result.ok) {
      addToast({
        title: "Couldn't remove item",
        description: result.code === "LAST_ITEM" ? "An order needs at least one item — delete the order instead." : friendlyDbError({ code: result.code } as any),
        status: "alert",
      });
      return;
    }
    addToast({ title: "Item removed", status: "info" });
  };

  const handleDelete = async (orderId: string) => {
    if (!confirm("Delete this order? This also removes its line items.")) return;
    const result = await deleteOrder(orderId);
    if (!result.ok) {
      addToast({ title: "Couldn't delete", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setGlobalOrderViewId(null);
    addToast({ title: "Order deleted", status: "info" });
  };

  const columns = useMemo(
    () => [
      { accessorKey: "id", header: "Order #", cell: (info: any) => <span className="font-mono text-xs">{info.getValue().slice(0, 8)}</span> },
      {
        accessorKey: "channel",
        header: "Channel",
        cell: (info: any) => (
          <div className="flex items-center gap-2 text-text-secondary capitalize">
            {info.getValue() === "shopify" ? <Store className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
            {info.getValue()}
          </div>
        ),
      },
      { accessorKey: "customer", header: "Customer", cell: (info: any) => <span className="font-medium">{info.row.original.customer?.name ?? "—"}</span> },
      { accessorKey: "items", header: "Items", cell: (info: any) => <span className="text-text-secondary">{info.row.original.items?.length ?? 0}</span> },
      {
        accessorKey: "status",
        header: "Status",
        cell: (info: any) => (
          <div className="flex items-center gap-2 capitalize">
            <StatusDot status={statusColor(info.getValue())} />
            {info.getValue()}
          </div>
        ),
      },
      { accessorKey: "total", header: "Total", cell: (info: any) => <span className="font-medium tabular-nums">${Number(info.getValue()).toFixed(2)}</span> },
      { accessorKey: "placed_at", header: "Placed", cell: (info: any) => <span className="text-text-secondary">{new Date(info.getValue()).toLocaleDateString()}</span> },
    ],
    [],
  );

  const isEmpty = !isLoading && orders.length === 0;

  return (
    <div className="flex h-full relative">
      <div className={cn("flex-1 p-4 md:p-8 flex flex-col transition-all", selected ? "pr-0 md:pr-[480px] duration-200 ease-out" : "duration-150 ease-in")}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-semibold mb-2">Orders</h1>
            <p className="text-sm text-text-secondary">All sales across channels.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <Input placeholder="Search orders..." className="pl-8 w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant="brand" onClick={() => setIsAddOpen(true)} disabled={cultivars.length === 0}>
              <Plus className="w-4 h-4 mr-2" />
              New Order
            </Button>
          </div>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto">
          {(["all", ...STATUSES] as const).map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? "brand" : "outline"} onClick={() => setStatusFilter(s as typeof statusFilter)} className="capitalize">
              {s}
            </Button>
          ))}
        </div>

        <Card className="flex-1 overflow-auto flex flex-col min-h-0">
          {isLoading ? (
            <LoadingTable cols={7} rows={10} />
          ) : isEmpty ? (
            <EmptyState
              icon={PackageSearch}
              title="No orders yet"
              description={cultivars.length === 0 ? "Add cultivars first, then create your first order." : "Create an order to start tracking."}
              action={<Button variant="outline" onClick={() => setIsAddOpen(true)} disabled={cultivars.length === 0}>New Order</Button>}
            />
          ) : (
            <DataTable columns={columns} data={filtered} onRowClick={(row: OrderWithRelations) => setGlobalOrderViewId(row.id)} />
          )}
        </Card>
      </div>

      {/* Detail panel */}
      <div
        className={cn(
          "fixed inset-0 md:inset-auto md:top-[56px] md:right-0 md:bottom-0 w-full md:w-[480px] bg-bg-base md:bg-[rgba(255,255,255,0.04)] backdrop-blur-md md:border-l border-border-subtle shadow-2xl transition-transform z-50 md:z-20 flex flex-col",
          selected ? "translate-x-0 duration-200 ease-out" : "translate-x-full duration-150 ease-in",
        )}
      >
        {selected && (
          <>
            <div className="p-4 md:p-6 border-b border-border-subtle flex items-start justify-between bg-bg-elevated md:bg-transparent">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xl font-semibold font-mono">{selected.id.slice(0, 8)}</h2>
                  <Badge variant={selected.channel === "shopify" ? "brand" : "default"} className="capitalize">{selected.channel}</Badge>
                  <div className="flex items-center gap-2 text-sm capitalize">
                    <StatusDot status={statusColor(selected.status)} />
                    {selected.status}
                  </div>
                </div>
                <div className="text-sm text-text-secondary">{new Date(selected.placed_at).toLocaleString()}</div>
              </div>
              <button onClick={() => setGlobalOrderViewId(null)} aria-label="Close" className="p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
              {selected.customer && (
                <section>
                  <div className="flex justify-between items-end mb-2">
                    <h3 className="text-xs uppercase tracking-wide text-text-secondary">Customer</h3>
                    <Link to="/customers" className="text-xs text-text-secondary hover:text-text-primary transition-colors">View profile →</Link>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-bg-active border border-border-subtle flex items-center justify-center text-lg font-medium">
                      {selected.customer.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-medium">{selected.customer.name}</div>
                      <div className="text-sm text-text-secondary">{selected.customer.email ?? ""}</div>
                    </div>
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Line Items</h3>
                <div className="space-y-3">
                  {selected.items.map((item) => (
                    <div key={`${item.id}-${item.qty}-${item.price}`} className="flex justify-between items-center gap-2 text-sm p-2 bg-bg-active rounded-lg border border-border-subtle">
                      <div className="flex-1 min-w-0">
                        <CultivarName name={item.name_snapshot} className="font-medium" />
                        <div className="flex items-center gap-2 mt-2">
                          <label className="text-xs text-text-tertiary">Qty</label>
                          <Input
                            type="number"
                            min={1}
                            defaultValue={item.qty}
                            className="w-16 px-2 py-1 text-xs"
                            onBlur={(e) => {
                              const qty = Math.max(1, Number(e.target.value) || 1);
                              if (qty !== item.qty) handleItemPatch(selected.id, item.id, { qty });
                            }}
                          />
                          <label className="text-xs text-text-tertiary">$ ea</label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={Number(item.price)}
                            className="w-20 px-2 py-1 text-xs"
                            onBlur={(e) => {
                              const price = Math.max(0, Number(e.target.value) || 0);
                              if (price !== Number(item.price)) handleItemPatch(selected.id, item.id, { price });
                            }}
                          />
                        </div>
                      </div>
                      <div className="font-medium tabular-nums text-right shrink-0">
                        ${(Number(item.price) * item.qty).toFixed(2)}
                        <button
                          onClick={() => handleItemRemove(selected.id, item.id)}
                          aria-label="Remove item"
                          className="block ml-auto mt-2 p-1 text-text-tertiary hover:text-status-alert rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-4 pt-4 border-t border-border-subtle text-sm">
                  <span className="text-text-secondary">Total</span>
                  <span className="font-medium tabular-nums">${Number(selected.total).toFixed(2)}</span>
                </div>
              </section>

              <section>
                <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Status</h3>
                <div className="grid grid-cols-3 gap-2">
                  {STATUSES.map((s) => (
                    <Button key={s} size="sm" variant={selected.status === s ? "brand" : "outline"} onClick={() => handleStatusChange(selected.id, s)} className="capitalize">
                      {s}
                    </Button>
                  ))}
                </div>
              </section>
            </div>

            <div className="p-4 md:p-6 border-t border-border-subtle bg-bg-base/50 flex gap-2 pb-safe">
              <Button variant="outline" className="flex-1" onClick={() => handleDelete(selected.id)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Create modal */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl bg-bg-elevated border-border-strong shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <h2 className="text-lg font-semibold">New Order</h2>
              <button onClick={() => setIsAddOpen(false)} aria-label="Close" className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Customer</label>
                  <select
                    className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong"
                    value={draft.customer_id}
                    onChange={(e) => setDraft({ ...draft, customer_id: e.target.value })}
                  >
                    <option value="">— None —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Channel</label>
                  <select className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong" value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
                    <option value="shopify">Shopify</option>
                    <option value="etsy">Etsy</option>
                    <option value="wholesale">Wholesale</option>
                    <option value="direct">Direct</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Status</label>
                  <select className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong capitalize" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s} className="capitalize">{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs uppercase tracking-wide text-text-secondary">Line Items</label>
                  <Button type="button" size="sm" variant="ghost" onClick={addLine}>
                    <Plus className="w-3 h-3 mr-1" />
                    Add line
                  </Button>
                </div>
                <div className="space-y-2">
                  {draft.items.map((line, i) => (
                    <div key={i} className="grid grid-cols-[2fr_60px_80px_32px] gap-2 items-end">
                      <select
                        className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong"
                        value={line.cultivar_id}
                        onChange={(e) => updateLine(i, { cultivar_id: e.target.value })}
                      >
                        <option value="">— Pick cultivar —</option>
                        {cultivars.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <Input type="number" min="1" placeholder="Qty" value={line.qty} onChange={(e) => updateLine(i, { qty: Number(e.target.value) || 1 })} />
                      <Input type="number" step="0.01" min="0" placeholder="Price" value={line.price} onChange={(e) => updateLine(i, { price: Number(e.target.value) || 0 })} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)} aria-label="Remove line" disabled={draft.items.length === 1}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="text-right text-sm text-text-secondary mt-4">
                  Subtotal: <span className="font-medium text-text-primary tabular-nums">${draft.items.reduce((s, it) => s + it.qty * it.price, 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button type="submit">Create Order</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
