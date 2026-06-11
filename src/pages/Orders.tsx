import { useState, useMemo, FormEvent } from "react";
import { Link } from "react-router";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { X, Search, Plus, Trash2, Store, ShoppingBag, PackageSearch, Truck, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackingUrl, carrierLabel } from "@/lib/tracking";
import { CultivarName } from "@/components/ui/CultivarName";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";
import { useOrders, type OrderWithRelations } from "@/hooks/useOrders";
import { useEntity } from "@/hooks/useEntity";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

type Customer = Tables<"customers">;
type Cultivar = Tables<"cultivars">;
type Shipment = Tables<"shipments">;

const shipmentStatusColor = (s: string) => {
  switch (s) {
    case "pending": return "alert" as const;
    case "ready": return "info" as const;
    case "held": return "warn" as const;
    case "shipped": return "ok" as const;
    case "delivered": return "ok" as const;
    case "exception": return "alert" as const;
    default: return "info" as const;
  }
};

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
  const { data: shipments } = useEntity<Shipment>("shipments", []);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const selected = useMemo(() => orders.find((o) => o.id === globalOrderViewId) ?? null, [orders, globalOrderViewId]);
  const selectedShipment = useMemo(
    () => (selected ? shipments.find((s) => s.order_id === selected.id) ?? null : null),
    [shipments, selected],
  );

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

  const handlePrintInvoice = (order: OrderWithRelations) => {
    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) {
      addToast({ title: "Pop-up blocked", description: "Allow pop-ups to print invoices.", status: "warn" });
      return;
    }
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const itemRows = order.items
      .map(
        (it) =>
          `<tr><td>${esc(it.name_snapshot)}</td><td class="n">${it.qty}</td><td class="n">$${Number(it.price).toFixed(2)}</td><td class="n">$${(Number(it.price) * it.qty).toFixed(2)}</td></tr>`,
      )
      .join("");
    win.document.write(`<!doctype html><html><head><title>Invoice ${esc(order.id.slice(0, 8))}</title>
      <style>
        body{font-family:sans-serif;padding:40px;color:#222;max-width:640px;margin:0 auto}
        h1{font-size:20px;margin:0} .muted{color:#777;font-size:12px}
        table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
        th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd} .n{text-align:right}
        tfoot td{font-weight:600;border-bottom:none}
        .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
      </style></head><body>
      <div class="head">
        <div><h1>Canyon Exotics</h1><div class="muted">Invoice</div></div>
        <div class="muted" style="text-align:right">
          Order ${esc(order.id.slice(0, 8))}<br/>${new Date(order.placed_at).toLocaleDateString()}<br/>${esc(order.channel)}
        </div>
      </div>
      ${order.customer ? `<div class="muted">Bill to:<br/><strong style="color:#222">${esc(order.customer.name)}</strong>${order.customer.email ? `<br/>${esc(order.customer.email)}` : ""}</div>` : ""}
      <table>
        <thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Unit</th><th class="n">Amount</th></tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr><td colspan="3" class="n">Subtotal</td><td class="n">$${Number(order.subtotal).toFixed(2)}</td></tr>
          <tr><td colspan="3" class="n">Shipping</td><td class="n">$${Number(order.shipping).toFixed(2)}</td></tr>
          <tr><td colspan="3" class="n">Tax</td><td class="n">$${Number(order.tax).toFixed(2)}</td></tr>
          <tr><td colspan="3" class="n">Total</td><td class="n">$${Number(order.total).toFixed(2)}</td></tr>
        </tfoot>
      </table>
      <script>window.onload = () => { window.print(); }<\/script>
      </body></html>`);
    win.document.close();
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
                <div className="mt-4 pt-4 border-t border-border-subtle space-y-1.5 text-sm">
                  {(Number(selected.subtotal) > 0 || Number(selected.tax) > 0 || Number(selected.shipping) > 0) && (
                    <>
                      <div className="flex justify-between text-text-secondary">
                        <span>Subtotal</span><span className="tabular-nums">${Number(selected.subtotal).toFixed(2)}</span>
                      </div>
                      {Number(selected.shipping) > 0 && (
                        <div className="flex justify-between text-text-secondary">
                          <span>Shipping</span><span className="tabular-nums">${Number(selected.shipping).toFixed(2)}</span>
                        </div>
                      )}
                      {Number(selected.tax) > 0 && (
                        <div className="flex justify-between text-text-secondary">
                          <span>Tax</span><span className="tabular-nums">${Number(selected.tax).toFixed(2)}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between pt-1">
                    <span className="text-text-secondary">Total</span>
                    <span className="font-medium tabular-nums">${Number(selected.total).toFixed(2)}</span>
                  </div>
                </div>
              </section>

              {selected.notes && (
                <section>
                  <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Buyer Note</h3>
                  <div className="p-3 bg-status-warn/10 border border-status-warn/20 rounded-lg text-sm text-text-primary whitespace-pre-wrap break-words">
                    {selected.notes}
                  </div>
                </section>
              )}

              {selectedShipment && (
                <section>
                  <div className="flex justify-between items-end mb-2">
                    <h3 className="text-xs uppercase tracking-wide text-text-secondary">Shipping</h3>
                    <Link to="/shipping" className="text-xs text-text-secondary hover:text-text-primary transition-colors">All shipments →</Link>
                  </div>
                  <div className="p-3 bg-bg-active rounded-lg border border-border-subtle space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-text-secondary" />
                        <StatusDot status={shipmentStatusColor(selectedShipment.status)} />
                        <span className="capitalize font-medium">{selectedShipment.status}</span>
                        {selectedShipment.weather_hold && <Badge variant="default">Weather hold</Badge>}
                      </div>
                      <span className="text-xs text-text-secondary">
                        {selectedShipment.ship_to_state ? `${selectedShipment.ship_to_state} ` : ""}
                        {selectedShipment.ship_to_zip ?? ""}
                      </span>
                    </div>
                    {selectedShipment.tracking_number ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-text-secondary">{carrierLabel(selectedShipment.carrier, selectedShipment.tracking_number)}</span>
                        <a
                          href={trackingUrl(selectedShipment.carrier, selectedShipment.tracking_number) ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 font-mono text-xs text-text-primary hover:underline"
                          title="Open carrier tracking"
                        >
                          {selectedShipment.tracking_number}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : (
                      <div className="text-xs text-text-tertiary">No tracking number yet.</div>
                    )}
                    {(selectedShipment.shipped_at || selectedShipment.delivered_at) && (
                      <div className="flex gap-4 text-xs text-text-secondary pt-1 border-t border-border-subtle">
                        {selectedShipment.shipped_at && <span>Shipped {new Date(selectedShipment.shipped_at).toLocaleDateString()}</span>}
                        {selectedShipment.delivered_at && <span>Delivered {new Date(selectedShipment.delivered_at).toLocaleDateString()}</span>}
                      </div>
                    )}
                    {selectedShipment.weather_note && (
                      <div className="text-xs text-text-tertiary">{selectedShipment.weather_note}</div>
                    )}
                  </div>
                </section>
              )}

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
              <Button variant="outline" className="flex-1" onClick={() => handlePrintInvoice(selected)}>
                Invoice
              </Button>
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
          <Card className="w-full max-w-2xl bg-bg-elevated border-border-strong shadow-2xl flex flex-col max-h-[85dvh]">
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
