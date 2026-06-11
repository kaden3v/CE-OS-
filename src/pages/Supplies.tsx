import { useState, FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { EmptyState } from "@/components/ui/StateRenderer";
import { PackageOpen, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useEntity } from "@/hooks/useEntity";
import { useApp } from "@/contexts/AppContext";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

type Supply = Tables<"supplies">;
type Vendor = Tables<"vendors">;

const SEED: Supply[] = [];

export default function Supplies() {
  const { data: supplies, add, isLoading } = useEntity<Supply>("supplies", SEED, {
    toRow: (s) => ({
      name: s.name,
      unit: s.unit,
      on_hand: s.on_hand,
      reorder_threshold: s.reorder_threshold,
      cost: s.cost,
      vendor_id: s.vendor_id,
      notes: s.notes,
    }),
  });
  const { data: vendors } = useEntity<Vendor>("vendors", [], {
    toRow: (v) => ({ name: v.name }),
  });

  const { addToast } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "pc", on_hand: 0, reorder_threshold: 0, cost: 0, vendor_id: "" });

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const result = await add({
      id: crypto.randomUUID(),
      name,
      unit: form.unit.trim() || null,
      on_hand: Number(form.on_hand) || 0,
      reorder_threshold: form.reorder_threshold ? Number(form.reorder_threshold) : null,
      cost: form.cost ? Number(form.cost) : null,
      vendor_id: form.vendor_id || null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Supply);
    if (result.ok === false) {
      addToast({ title: "Couldn't add supply", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setIsOpen(false);
    setForm({ name: "", unit: "pc", on_hand: 0, reorder_threshold: 0, cost: 0, vendor_id: "" });
    addToast({ title: "Supply added", description: name, status: "ok" });
  };

  const isEmpty = !isLoading && supplies.length === 0;
  const vendorName = (id: string | null) => (id ? vendors.find((v) => v.id === id)?.name ?? "—" : "—");
  const isLow = (s: Supply) => s.reorder_threshold !== null && s.on_hand < s.reorder_threshold;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Supplies</h1>
          <p className="text-sm text-text-secondary">Physical inventory for shipping and potting media.</p>
        </div>
        <Button variant="brand" onClick={() => setIsOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Supply
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => <Card key={i} className="p-4 h-[160px] animate-pulse bg-bg-elevated/50" />)}
        {!isLoading && isEmpty && (
          <div className="col-span-full">
            <EmptyState
              icon={PackageOpen}
              title="No supplies tracked"
              description="Track potting media, pots, shipping boxes, and consumables."
              action={<Button variant="outline" onClick={() => setIsOpen(true)}>Add Supply</Button>}
            />
          </div>
        )}
        {!isLoading && !isEmpty &&
          supplies.map((item) => (
            <Card key={item.id} className="p-4 hover:border-border-strong transition-colors">
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-medium text-lg leading-tight">{item.name}</h3>
                {isLow(item) && <Badge className="text-status-alert border-status-alert/20">Low</Badge>}
              </div>
              <div className="flex items-center gap-6 mb-4">
                <div>
                  <span className="block text-xs uppercase tracking-wide text-text-secondary mb-2">On hand</span>
                  <span className="font-medium tabular-nums flex items-center gap-2">
                    <StatusDot status={isLow(item) ? "alert" : "ok"} />
                    {item.on_hand} {item.unit ?? ""}
                  </span>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Reorder at</span>
                  <span className="text-text-secondary tabular-nums">{item.reorder_threshold ?? "—"} {item.unit ?? ""}</span>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Unit cost</span>
                  <span className="text-text-secondary tabular-nums">{item.cost != null ? `$${Number(item.cost).toFixed(2)}` : "—"}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-text-secondary pt-2 border-t border-border-subtle">
                <span>{vendorName(item.vendor_id)}</span>
                {item.cost != null && (
                  <span className="tabular-nums text-text-tertiary">
                    {`$${(Number(item.cost) * item.on_hand).toFixed(2)} on hand`}
                  </span>
                )}
              </div>
            </Card>
          ))}
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <h2 className="text-lg font-semibold">New Supply</h2>
              <button onClick={() => setIsOpen(false)} aria-label="Close" className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-4 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Name *</label>
                <Input required placeholder="e.g. Pumice" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Unit</label>
                  <Input placeholder="bag, pc, bale" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Vendor</label>
                  <select
                    className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong"
                    value={form.vendor_id}
                    onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
                  >
                    <option value="">— None —</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">On hand</label>
                  <Input type="number" min="0" value={form.on_hand} onChange={(e) => setForm({ ...form, on_hand: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Reorder at</label>
                  <Input type="number" min="0" value={form.reorder_threshold} onChange={(e) => setForm({ ...form, reorder_threshold: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Unit cost $</label>
                  <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.cost || ""} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit">Save Supply</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
