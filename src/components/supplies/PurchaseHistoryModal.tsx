import { useState } from "react";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useApp } from "@/contexts/AppContext";
import { formatMoney } from "@/lib/format";
import { formatBusinessDate } from "@/lib/dates";
import { deleteSupplyPurchase } from "@/lib/cogs";
import type { Tables } from "@/lib/database.types";
import type { PurchaseEditing } from "./SupplyPurchaseModal";

type Supply = Tables<"supplies">;
type SupplyPurchase = Tables<"supply_purchases">;
type Vendor = Tables<"vendors">;

interface PurchaseHistoryModalProps {
  open: boolean;
  onClose: () => void;
  supply: Supply | null;
  purchases: SupplyPurchase[];
  vendors: Vendor[];
  onEdit: (p: PurchaseEditing) => void;
  onChanged: () => void;
}

export function PurchaseHistoryModal({ open, onClose, supply, purchases, vendors, onEdit, onChanged }: PurchaseHistoryModalProps) {
  const { addToast } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);

  const vendorName = (id: string | null) => (id ? vendors.find((v) => v.id === id)?.name ?? "—" : "—");

  const handleDelete = async (p: SupplyPurchase) => {
    if (!confirm("Delete this purchase? Stock, unit cost, and the linked expense will all be reversed.")) return;
    setBusyId(p.id);
    try {
      await deleteSupplyPurchase(p.id);
      addToast({ title: "Purchase reversed", status: "info" });
      onChanged();
    } catch (err) {
      addToast({ title: "Couldn't delete", description: err instanceof Error ? err.message : "Try again", status: "alert" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={supply ? `${supply.name} — Purchases` : "Purchases"} size="lg">
      <div className="p-4">
        {purchases.length === 0 ? (
          <p className="text-sm text-text-secondary py-8 text-center">No purchases logged for this supply yet.</p>
        ) : (
          <div className="overflow-auto rounded-lg border border-border-subtle">
            <table className="w-full text-sm text-left">
              <thead className="text-[11px] uppercase tracking-wide text-text-secondary border-b border-border-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium text-right">Unit</th>
                  <th className="px-3 py-2 font-medium">Vendor</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-b border-border-subtle/50 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">{formatBusinessDate(p.purchase_date)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(p.qty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(p.total_cost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                      {Number(p.qty) > 0 ? formatMoney(Number(p.total_cost) / Number(p.qty)) : "—"}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{vendorName(p.vendor_id)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => onEdit({ id: p.id, supply_id: p.supply_id!, qty: Number(p.qty), total_cost: Number(p.total_cost), vendor_id: p.vendor_id, purchase_date: p.purchase_date })}
                          aria-label="Edit purchase"
                          className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-active"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={busyId === p.id}
                          aria-label="Delete purchase"
                          className="p-1.5 rounded text-text-secondary hover:text-status-alert hover:bg-bg-active disabled:opacity-50"
                        >
                          {busyId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
