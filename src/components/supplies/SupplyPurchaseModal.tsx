import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useApp } from "@/contexts/AppContext";
import { todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { logSupplyPurchase, updateSupplyPurchase } from "@/lib/cogs";
import type { Tables } from "@/lib/database.types";

type Supply = Tables<"supplies">;
type Vendor = Tables<"vendors">;

export interface PurchaseEditing {
  id: string;
  supply_id: string;
  qty: number;
  total_cost: number;
  vendor_id: string | null;
  purchase_date: string;
}

interface SupplyPurchaseModalProps {
  open: boolean;
  onClose: () => void;
  supplies: Supply[];
  vendors: Vendor[];
  presetSupplyId?: string | null;
  editing?: PurchaseEditing | null;
  onSaved: () => void;
}

const labelCls = "block text-xs uppercase tracking-wide text-text-secondary mb-2";
const selectCls =
  "w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong";

export function SupplyPurchaseModal({ open, onClose, supplies, vendors, presetSupplyId, editing, onSaved }: SupplyPurchaseModalProps) {
  const { addToast } = useApp();
  const [supplyId, setSupplyId] = useState("");
  const [qty, setQty] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setSupplyId(editing.supply_id);
      setQty(String(editing.qty));
      setTotalCost(String(editing.total_cost));
      setVendorId(editing.vendor_id ?? "");
      setDate(editing.purchase_date);
    } else {
      setSupplyId(presetSupplyId ?? "");
      setQty("");
      setTotalCost("");
      const sup = supplies.find((s) => s.id === presetSupplyId);
      setVendorId(sup?.vendor_id ?? "");
      setDate(todayISO());
    }
  }, [open, editing, presetSupplyId, supplies]);

  const qtyN = Number(qty);
  const costN = Number(totalCost);
  const unit = qtyN > 0 && Number.isFinite(costN) ? costN / qtyN : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplyId) { addToast({ title: "Pick a supply", status: "warn" }); return; }
    if (!(qtyN > 0)) { addToast({ title: "Quantity required", description: "Enter a positive quantity.", status: "warn" }); return; }
    if (!(costN >= 0) || !Number.isFinite(costN)) { addToast({ title: "Total cost required", status: "warn" }); return; }

    const input = { supplyId, qty: qtyN, totalCost: costN, vendorId: vendorId || null, purchaseDate: date };
    setSaving(true);
    try {
      if (editing) await updateSupplyPurchase(editing.id, input);
      else await logSupplyPurchase(input);
      addToast({ title: editing ? "Purchase updated" : "Purchase logged", description: `${qtyN} @ ${formatMoney(costN)}`, status: "ok" });
      onSaved();
      onClose();
    } catch (err) {
      addToast({ title: "Couldn't save purchase", description: err instanceof Error ? err.message : "Try again", status: "alert" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Purchase" : "Log Purchase"} size="md">
      <form onSubmit={submit} className="p-4 space-y-4">
        <div>
          <label className={labelCls}>Supply</label>
          <select className={selectCls} value={supplyId} disabled={!!editing || !!presetSupplyId} onChange={(e) => setSupplyId(e.target.value)}>
            <option value="">— Pick supply —</option>
            {supplies.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.unit ? ` (${s.unit})` : ""}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Quantity</label>
            <Input type="number" step="0.01" min="0" required placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Total cost $</label>
            <Input type="number" step="0.01" min="0" required placeholder="0.00" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Vendor</label>
            <select className={selectCls} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">— None —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="text-right text-sm text-text-secondary">
          Unit cost: <span className="tabular-nums text-text-primary">{formatMoney(unit)}</span>
        </div>
        <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Saving…" : editing ? "Save changes" : "Log Purchase"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
