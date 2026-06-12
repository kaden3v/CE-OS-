import { useEffect, useMemo, useState, FormEvent } from "react";
import { useLocation } from "react-router";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { EmptyState, LoadingTable } from "@/components/ui/StateRenderer";
import { PackageOpen, Plus, Receipt, History } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useEntity } from "@/hooks/useEntity";
import { useApp } from "@/contexts/AppContext";
import { friendlyDbError } from "@/lib/dbErrors";
import { formatMoney } from "@/lib/format";
import { formatBusinessDate } from "@/lib/dates";
import { SupplyPurchaseModal, type PurchaseEditing } from "@/components/supplies/SupplyPurchaseModal";
import { PurchaseHistoryModal } from "@/components/supplies/PurchaseHistoryModal";
import type { Tables } from "@/lib/database.types";

type Supply = Tables<"supplies">;
type Vendor = Tables<"vendors">;
type SupplyPurchase = Tables<"supply_purchases">;

const SEED: Supply[] = [];

export default function Supplies() {
  const { data: supplies, add, isLoading, refresh } = useEntity<Supply>("supplies", SEED, {
    toRow: (s) => ({
      name: s.name, unit: s.unit, on_hand: s.on_hand, reorder_threshold: s.reorder_threshold,
      cost: s.cost, vendor_id: s.vendor_id, notes: s.notes,
    }),
  });
  const { data: vendors } = useEntity<Vendor>("vendors", [], { toRow: (v) => ({ name: v.name }) });
  const { data: purchases, refresh: refreshPurchases } = useEntity<SupplyPurchase>("supply_purchases", [], { orderBy: "purchase_date" });

  const { addToast } = useApp();
  const location = useLocation();

  const [addOpen, setAddOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchasePreset, setPurchasePreset] = useState<string | null>(null);
  const [purchaseEditing, setPurchaseEditing] = useState<PurchaseEditing | null>(null);
  const [historySupply, setHistorySupply] = useState<Supply | null>(null);

  // Opened from a Finances Overview quick action → log a purchase.
  useEffect(() => {
    if ((location.state as { openNew?: boolean } | null)?.openNew) openPurchase(null);
  }, [location.state]);

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
    setAddOpen(false);
    setForm({ name: "", unit: "pc", on_hand: 0, reorder_threshold: 0, cost: 0, vendor_id: "" });
    addToast({ title: "Supply added", description: name, status: "ok" });
  };

  const purchasesBySupply = useMemo(() => {
    const map = new Map<string, SupplyPurchase[]>();
    for (const p of purchases) {
      if (!p.supply_id) continue;
      map.set(p.supply_id, [...(map.get(p.supply_id) ?? []), p]);
    }
    return map;
  }, [purchases]);

  const lastPurchase = (id: string): string | null => {
    const list = purchasesBySupply.get(id);
    if (!list || list.length === 0) return null;
    return list.reduce((max, p) => (p.purchase_date > max ? p.purchase_date : max), list[0].purchase_date);
  };

  const vendorName = (id: string | null) => (id ? vendors.find((v) => v.id === id)?.name ?? "—" : "—");
  const isLow = (s: Supply) => s.reorder_threshold !== null && Number(s.on_hand) <= Number(s.reorder_threshold);
  const value = (s: Supply) => Number(s.on_hand) * Number(s.cost ?? 0);

  const totalValue = useMemo(() => supplies.reduce((sum, s) => sum + value(s), 0), [supplies]);
  const lowCount = useMemo(() => supplies.filter(isLow).length, [supplies]);

  const afterPurchaseChange = () => { void refresh(); void refreshPurchases(); };

  const openPurchase = (supplyId: string | null) => {
    setPurchaseEditing(null);
    setPurchasePreset(supplyId);
    setPurchaseOpen(true);
  };
  const editPurchase = (p: PurchaseEditing) => {
    setHistorySupply(null);
    setPurchaseEditing(p);
    setPurchasePreset(null);
    setPurchaseOpen(true);
  };

  const isEmpty = !isLoading && supplies.length === 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Supplies</h1>
          <p className="text-sm text-text-secondary">Inventory and cost basis for potting media, pots, and shipping.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="brand" onClick={() => openPurchase(null)}>
            <Receipt className="w-4 h-4" /> Log Purchase
          </Button>
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" /> Add Supply
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 mb-6">
        <StatTile label="Inventory value" value={formatMoney(totalValue)} />
        <StatTile label="Items tracked" value={String(supplies.length)} />
        <StatTile label="Low stock" value={String(lowCount)} />
      </div>

      <Card className="flex-1 flex flex-col min-h-0 mb-12 overflow-auto">
        {isLoading && <LoadingTable cols={7} rows={8} />}
        {isEmpty && (
          <EmptyState
            icon={PackageOpen}
            title="No supplies tracked"
            description="Add a supply, then log purchases to build its cost basis."
            action={<Button variant="outline" onClick={() => setAddOpen(true)}>Add Supply</Button>}
          />
        )}
        {!isLoading && !isEmpty && (
          <table className="w-full min-w-max text-sm text-left">
            <thead className="text-[12px] uppercase tracking-wide text-text-secondary sticky top-0 bg-bg-base/95 backdrop-blur-md z-10 border-b border-border-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">Supply</th>
                <th className="px-3 py-2 font-medium text-right">On hand</th>
                <th className="px-3 py-2 font-medium text-right">Unit cost</th>
                <th className="px-3 py-2 font-medium text-right">Inventory value</th>
                <th className="px-3 py-2 font-medium text-right">Reorder at</th>
                <th className="px-3 py-2 font-medium">Last purchase</th>
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {supplies.map((s) => {
                const last = lastPurchase(s.id);
                return (
                  <tr key={s.id} className="border-b border-border-subtle/50 last:border-0 hover:bg-bg-hover/50">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium">{s.name}</span>
                      {isLow(s) && <Badge className="ml-2 text-status-alert border-status-alert/30" variant="outline">Low</Badge>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      <span className="inline-flex items-center gap-2 justify-end">
                        <StatusDot status={isLow(s) ? "alert" : "ok"} />
                        {Number(s.on_hand)}{s.unit ? ` ${s.unit}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{s.cost != null ? formatMoney(s.cost) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(value(s))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{s.reorder_threshold ?? "—"}</td>
                    <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{last ? formatBusinessDate(last) : "—"}</td>
                    <td className="px-3 py-2 text-text-secondary">{vendorName(s.vendor_id)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="outline" onClick={() => openPurchase(s.id)}>Log Purchase</Button>
                        <button onClick={() => setHistorySupply(s)} aria-label="Purchase history" className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-active">
                          <History className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-bg-elevated/95 backdrop-blur-md border-t border-border-strong">
              <tr>
                <td className="px-3 py-2.5 text-text-secondary" colSpan={3}>{supplies.length} supplies</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatMoney(totalValue)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        )}
      </Card>

      {/* Add supply */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New Supply" size="sm">
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
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
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
          <p className="text-xs text-text-tertiary">On-hand and unit cost here are the opening balance; logging purchases updates them as a weighted average.</p>
          <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
            <Button variant="ghost" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit">Save Supply</Button>
          </div>
        </form>
      </Modal>

      <SupplyPurchaseModal
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        supplies={supplies}
        vendors={vendors}
        presetSupplyId={purchasePreset}
        editing={purchaseEditing}
        onSaved={afterPurchaseChange}
      />
      <PurchaseHistoryModal
        open={!!historySupply}
        onClose={() => setHistorySupply(null)}
        supply={historySupply}
        purchases={historySupply ? (purchasesBySupply.get(historySupply.id) ?? []) : []}
        vendors={vendors}
        onEdit={editPurchase}
        onChanged={afterPurchaseChange}
      />
    </div>
  );
}
