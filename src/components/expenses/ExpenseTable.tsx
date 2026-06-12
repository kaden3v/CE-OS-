import { useState } from "react";
import { ArrowUp, ArrowDown, Paperclip, Pencil, Trash2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { formatBusinessDate } from "@/lib/dates";
import { mapToScheduleC } from "@/lib/scheduleC";
import { CategorySelect } from "./CategorySelect";
import { PAYMENT_METHODS, needsReview, type Expense, type ExpenseFormData, type Vendor } from "./types";

export type SortKey = "occurred_on" | "category" | "vendor" | "amount";
export interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

interface ExpenseTableProps {
  rows: Expense[];
  vendors: Vendor[];
  selected: Set<string>;
  allSelected: boolean;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  sort: SortState;
  onSort: (k: SortKey) => void;
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, data: ExpenseFormData) => Promise<void>;
  onDelete: (e: Expense) => void;
  onOpenReceipt: (path: string) => void;
  onAttachReceipt: (e: Expense) => void;
  total: number;
}

const cellCls = "px-3 py-2 whitespace-nowrap";
const editInputCls = "w-full bg-bg-base border border-border-subtle rounded px-2 py-1 text-sm focus:outline-none focus:border-border-strong";

function SortHeader({
  label, k, sort, onSort, align = "left",
}: { label: string; k: SortKey; sort: SortState; onSort: (k: SortKey) => void; align?: "left" | "right" }) {
  const active = sort.key === k;
  return (
    <th className={cn("px-3 py-2 font-medium select-none", align === "right" && "text-right")}>
      <button
        onClick={() => onSort(k)}
        className={cn("inline-flex items-center gap-1 hover:text-text-primary transition-colors", active && "text-text-primary")}
      >
        {label}
        {active && (sort.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );
}

function EditableRow({
  expense, vendors, onSave, onCancel,
}: { expense: Expense; vendors: Vendor[]; onSave: (data: ExpenseFormData) => Promise<void>; onCancel: () => void }) {
  const [amount, setAmount] = useState(String(expense.amount ?? ""));
  const [date, setDate] = useState(expense.occurred_on);
  const [category, setCategory] = useState(expense.category ?? "");
  const [vendorId, setVendorId] = useState(expense.vendor_id ?? "");
  const [payment, setPayment] = useState(expense.payment_method ?? "");
  const [memo, setMemo] = useState(expense.description ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    const cat = category.trim() || null;
    setSaving(true);
    await onSave({
      amount: amt,
      occurred_on: date,
      category: cat,
      schedule_c_category: cat ? mapToScheduleC(cat).scheduleC : null,
      payment_method: payment || null,
      vendor_id: vendorId || null,
      deductible: expense.deductible ?? true,
      description: memo.trim() || null,
    });
    setSaving(false);
  };

  return (
    <tr className="border-b border-border-subtle/50 bg-bg-hover/40">
      <td className={cellCls} />
      <td className={cellCls}><input type="date" className={editInputCls} value={date} onChange={(e) => setDate(e.target.value)} /></td>
      <td className={cellCls}><CategorySelect value={category} onChange={setCategory} className="!py-1 !px-2" /></td>
      <td className={cellCls}>
        <select className={editInputCls} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">— None —</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </td>
      <td className={cellCls}>
        <select className={editInputCls} value={payment} onChange={(e) => setPayment(e.target.value)}>
          <option value="">—</option>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </td>
      <td className={cellCls}><input className={editInputCls} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Memo" /></td>
      <td className={cn(cellCls, "text-right")}>
        <input type="number" step="0.01" min="0" className={cn(editInputCls, "text-right w-24")} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </td>
      <td className={cellCls} />
      <td className={cellCls}>
        <div className="flex items-center gap-1 justify-end">
          <button onClick={save} disabled={saving} aria-label="Save" className="p-1.5 rounded text-status-ok hover:bg-bg-active disabled:opacity-50"><Check className="w-4 h-4" /></button>
          <button onClick={onCancel} aria-label="Cancel" className="p-1.5 rounded text-text-secondary hover:bg-bg-active"><X className="w-4 h-4" /></button>
        </div>
      </td>
    </tr>
  );
}

export function ExpenseTable({
  rows, vendors, selected, allSelected, onToggleRow, onToggleAll,
  sort, onSort, editingId, onStartEdit, onCancelEdit, onSaveEdit,
  onDelete, onOpenReceipt, onAttachReceipt, total,
}: ExpenseTableProps) {
  // Prefer the live vendor; fall back to the denormalized name kept when a
  // vendor is deleted (vendor_id is then null but vendor_name survives).
  const vendorLabel = (e: Expense) => {
    if (e.vendor_id) {
      const v = vendors.find((x) => x.id === e.vendor_id);
      if (v) return v.name;
    }
    return e.vendor_name ?? "—";
  };

  return (
    <div className="overflow-auto [-webkit-overflow-scrolling:touch] flex-1">
      <table className="w-full min-w-max text-sm text-left">
        <thead className="text-[12px] uppercase tracking-wide text-text-secondary sticky top-0 bg-bg-base/95 backdrop-blur-md z-10 border-b border-border-subtle">
          <tr>
            <th className="px-3 py-2 w-8">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                onChange={onToggleAll}
                className="w-4 h-4 align-middle accent-[var(--color-accent-brand)]"
              />
            </th>
            <SortHeader label="Date" k="occurred_on" sort={sort} onSort={onSort} />
            <SortHeader label="Category" k="category" sort={sort} onSort={onSort} />
            <SortHeader label="Vendor" k="vendor" sort={sort} onSort={onSort} />
            <th className="px-3 py-2 font-medium">Payment</th>
            <th className="px-3 py-2 font-medium">Memo</th>
            <SortHeader label="Amount" k="amount" sort={sort} onSort={onSort} align="right" />
            <th className="px-3 py-2 font-medium text-center">Receipt</th>
            <th className="px-3 py-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-transparent">
          {rows.length === 0 ? (
            <tr><td colSpan={9} className="h-24 text-center text-text-secondary">No expenses match these filters.</td></tr>
          ) : (
            rows.map((e) =>
              editingId === e.id ? (
                <EditableRow
                  key={e.id}
                  expense={e}
                  vendors={vendors}
                  onSave={(data) => onSaveEdit(e.id, data)}
                  onCancel={onCancelEdit}
                />
              ) : (
                <tr key={e.id} className={cn("border-b border-border-subtle/50 last:border-0 hover:bg-bg-hover/50 transition-colors", selected.has(e.id) && "bg-bg-active/40")}>
                  <td className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select row"
                      checked={selected.has(e.id)}
                      onChange={() => onToggleRow(e.id)}
                      className="w-4 h-4 align-middle accent-[var(--color-accent-brand)]"
                    />
                  </td>
                  <td className={cn(cellCls, "text-text-secondary")}>{formatBusinessDate(e.occurred_on)}</td>
                  <td className={cellCls}>
                    {e.category ? (
                      <Badge>{e.category}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-status-warn border-status-warn/40">Needs review</Badge>
                    )}
                    {e.deductible === false && <span className="ml-2 text-[10px] uppercase tracking-wide text-text-tertiary">Non-ded.</span>}
                  </td>
                  <td className={cn(cellCls, "font-medium")}>{vendorLabel(e)}</td>
                  <td className={cn(cellCls, "text-text-secondary")}>{e.payment_method ?? "—"}</td>
                  <td className={cn(cellCls, "text-text-secondary max-w-[16rem] truncate")}>{e.description ?? "—"}</td>
                  <td className={cn(cellCls, "text-right font-medium tabular-nums")}>{formatMoney(e.amount)}</td>
                  <td className="px-3 py-2 text-center">
                    {e.receipt_url ? (
                      <button onClick={() => onOpenReceipt(e.receipt_url!)} aria-label="View receipt" className="text-status-ok hover:text-text-primary"><Paperclip className="w-4 h-4 inline" /></button>
                    ) : (
                      <button onClick={() => onAttachReceipt(e)} aria-label="Attach receipt" className="text-text-tertiary hover:text-text-secondary"><Paperclip className="w-4 h-4 inline opacity-50" /></button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => onStartEdit(e.id)} aria-label="Edit" className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-active"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => onDelete(e)} aria-label="Delete" className="p-1.5 rounded text-text-secondary hover:text-status-alert hover:bg-bg-active"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ),
            )
          )}
        </tbody>
        <tfoot className="sticky bottom-0 bg-bg-elevated/95 backdrop-blur-md border-t border-border-strong">
          <tr className="text-sm">
            <td colSpan={6} className="px-3 py-2.5 text-text-secondary">
              {rows.length} {rows.length === 1 ? "entry" : "entries"}
            </td>
            <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatMoney(total)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
