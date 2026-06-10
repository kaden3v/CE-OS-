import { useMemo, useState, FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/StatusDot";
import { Input } from "@/components/ui/Input";
import { DataTable } from "@/components/ui/DataTable";
import { Plus, X, Truck } from "lucide-react";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";
import { useEntity } from "@/hooks/useEntity";
import { useOrders } from "@/hooks/useOrders";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

type Shipment = Tables<"shipments">;

const STATUSES = ["pending", "ready", "held", "shipped", "delivered", "exception"] as const;
type Status = (typeof STATUSES)[number];

export default function Shipping() {
  const { data: shipments, add, update, isLoading } = useEntity<Shipment>("shipments", [], {
    toRow: (s) => ({
      order_id: s.order_id,
      status: s.status,
      carrier: s.carrier,
      tracking_number: s.tracking_number,
      ship_to_zip: s.ship_to_zip,
      ship_to_state: s.ship_to_state,
      weather_hold: s.weather_hold,
      weather_note: s.weather_note,
      shipped_at: s.shipped_at,
      delivered_at: s.delivered_at,
    }),
  });
  const { data: orders } = useOrders();
  const { addToast } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ order_id: "", carrier: "USPS", tracking_number: "", ship_to_zip: "", ship_to_state: "" });

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.order_id) {
      addToast({ title: "Pick an order", status: "warn" });
      return;
    }
    const result = await add({
      id: crypto.randomUUID(),
      order_id: form.order_id,
      status: "pending",
      carrier: form.carrier.trim() || null,
      tracking_number: form.tracking_number.trim() || null,
      ship_to_zip: form.ship_to_zip.trim() || null,
      ship_to_state: form.ship_to_state.trim() || null,
      weather_hold: false,
      weather_note: null,
      shipped_at: null,
      delivered_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Shipment);
    if (result.ok === false) {
      addToast({ title: "Couldn't create shipment", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setIsOpen(false);
    setForm({ order_id: "", carrier: "USPS", tracking_number: "", ship_to_zip: "", ship_to_state: "" });
    addToast({ title: "Shipment created", status: "ok" });
  };

  const setStatus = async (id: string, status: Status) => {
    const patch: Partial<Shipment> = { status };
    if (status === "shipped") patch.shipped_at = new Date().toISOString();
    if (status === "delivered") patch.delivered_at = new Date().toISOString();
    const result = await update(id, patch);
    if (result.ok === false) {
      addToast({ title: "Update failed", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    addToast({ title: "Shipment updated", status: "ok" });
  };

  const orderLabel = (orderId: string) => {
    const o = orders.find((x) => x.id === orderId);
    if (!o) return orderId.slice(0, 8);
    return `${o.id.slice(0, 8)} · ${o.customer?.name ?? "—"}`;
  };

  const columns = useMemo(
    () => [
      { accessorKey: "id", header: "Shipment", cell: (info: any) => <span className="font-mono text-xs">{info.getValue().slice(0, 8)}</span> },
      { accessorKey: "order_id", header: "Order", cell: (info: any) => <span className="font-medium">{orderLabel(info.getValue())}</span> },
      { accessorKey: "carrier", header: "Carrier", cell: (info: any) => <span className="text-text-secondary">{info.getValue() ?? "—"}</span> },
      { accessorKey: "tracking_number", header: "Tracking", cell: (info: any) => <span className="font-mono text-xs">{info.getValue() ?? "—"}</span> },
      {
        accessorKey: "ship_to_state",
        header: "Destination",
        cell: (info: any) => <span className="text-text-secondary">{info.getValue() ? `${info.row.original.ship_to_zip ?? ""} ${info.getValue()}` : "—"}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: (info: any) => {
          const s = info.getValue();
          const tone = s === "shipped" || s === "delivered" ? "ok" : s === "held" || s === "exception" ? "alert" : "warn";
          return (
            <div className="flex items-center gap-2 capitalize">
              <StatusDot status={tone as any} />
              {s}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: (info: any) => {
          const sh: Shipment = info.row.original;
          return (
            <div className="flex gap-1">
              {sh.status === "pending" && <Button size="sm" variant="outline" onClick={() => setStatus(sh.id, "ready")}>Mark Ready</Button>}
              {sh.status === "ready" && <Button size="sm" variant="brand" onClick={() => setStatus(sh.id, "shipped")}>Ship</Button>}
              {sh.status === "shipped" && <Button size="sm" variant="outline" onClick={() => setStatus(sh.id, "delivered")}>Delivered</Button>}
            </div>
          );
        },
      },
    ],
    [orders],
  );

  const isEmpty = !isLoading && shipments.length === 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Shipping</h1>
          <p className="text-sm text-text-secondary">Track outbound shipments and weather holds.</p>
        </div>
        <Button variant="brand" onClick={() => setIsOpen(true)} disabled={orders.length === 0}>
          <Plus className="w-4 h-4 mr-2" />
          New Shipment
        </Button>
      </div>

      <Card className="flex-1 overflow-auto flex flex-col">
        {isLoading ? (
          <LoadingTable cols={7} rows={8} />
        ) : isEmpty ? (
          <EmptyState
            icon={Truck}
            title="No shipments yet"
            description={orders.length === 0 ? "Create an order first." : "Create a shipment from an order to start tracking."}
            action={<Button variant="outline" onClick={() => setIsOpen(true)} disabled={orders.length === 0}>New Shipment</Button>}
          />
        ) : (
          <DataTable columns={columns} data={shipments} />
        )}
      </Card>

      {isOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <h2 className="text-lg font-semibold">New Shipment</h2>
              <button onClick={() => setIsOpen(false)} aria-label="Close" className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-4 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Order *</label>
                <select required className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong" value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })}>
                  <option value="">— Pick an order —</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>{orderLabel(o.id)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Carrier</label>
                  <Input placeholder="USPS / UPS / FedEx" value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Tracking #</label>
                  <Input placeholder="1Z..." value={form.tracking_number} onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Ship to ZIP</label>
                  <Input placeholder="85001" value={form.ship_to_zip} onChange={(e) => setForm({ ...form, ship_to_zip: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">State</label>
                  <Input placeholder="AZ" value={form.ship_to_state} onChange={(e) => setForm({ ...form, ship_to_state: e.target.value })} />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit">Save Shipment</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
