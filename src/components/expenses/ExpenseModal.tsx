import { useEffect, useRef, useState } from "react";
import { Paperclip, Plus, X, Loader2, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { useApp } from "@/contexts/AppContext";
import { mapToScheduleC } from "@/lib/scheduleC";
import { todayISO } from "@/lib/dates";
import { RECEIPT_ACCEPT, isAcceptedReceipt, receiptTooLarge } from "@/lib/receipts";
import { CategorySelect } from "./CategorySelect";
import { PAYMENT_METHODS, type Expense, type ExpenseFormData, type Vendor } from "./types";

interface ExpenseModalProps {
  open: boolean;
  onClose: () => void;
  vendors: Vendor[];
  editing: Expense | null;
  onSubmit: (data: ExpenseFormData, receipt: { file: File | null; remove: boolean }) => Promise<boolean>;
  onCreateVendor: (name: string) => Promise<Vendor | null>;
}

const emptyForm = () => ({
  amount: "",
  occurred_on: todayISO(),
  category: "",
  payment_method: "Card",
  vendor_id: "",
  deductible: true,
  description: "",
});

const labelCls = "block text-xs uppercase tracking-wide text-text-secondary mb-2";
const selectCls =
  "w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong";

export function ExpenseModal({ open, onClose, vendors, editing, onSubmit, onCreateVendor }: ExpenseModalProps) {
  const { addToast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState(emptyForm());
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [creatingVendor, setCreatingVendor] = useState(false);
  const [newVendor, setNewVendor] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            amount: String(editing.amount ?? ""),
            occurred_on: editing.occurred_on,
            category: editing.category ?? "",
            payment_method: editing.payment_method ?? "Card",
            vendor_id: editing.vendor_id ?? "",
            deductible: editing.deductible ?? true,
            description: editing.description ?? "",
          }
        : emptyForm(),
    );
    setReceiptFile(null);
    setRemoveReceipt(false);
    setCreatingVendor(false);
    setNewVendor("");
  }, [open, editing]);

  const pickFile = (file: File) => {
    if (!isAcceptedReceipt(file)) {
      addToast({ title: "Unsupported file", description: "Use an image (PNG/JPEG/WebP/HEIC) or PDF.", status: "warn" });
      return;
    }
    if (receiptTooLarge(file)) {
      addToast({ title: "File too large", description: "Max 10 MB.", status: "warn" });
      return;
    }
    setReceiptFile(file);
    setRemoveReceipt(false);
  };

  const addVendor = async () => {
    const name = newVendor.trim();
    if (!name) return;
    const created = await onCreateVendor(name);
    if (created) {
      setForm((f) => ({ ...f, vendor_id: created.id }));
      setCreatingVendor(false);
      setNewVendor("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      addToast({ title: "Amount required", description: "Enter a positive number.", status: "warn" });
      return;
    }
    const category = form.category.trim() || null;
    const data: ExpenseFormData = {
      amount,
      occurred_on: form.occurred_on,
      category,
      schedule_c_category: category ? mapToScheduleC(category).scheduleC : null,
      payment_method: form.payment_method || null,
      vendor_id: form.vendor_id || null,
      deductible: form.deductible,
      description: form.description.trim() || null,
    };
    setSaving(true);
    const ok = await onSubmit(data, { file: receiptFile, remove: removeReceipt });
    setSaving(false);
    if (ok) onClose();
  };

  const hasExistingReceipt = !!editing?.receipt_url && !removeReceipt && !receiptFile;

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Expense" : "Log Expense"} size="lg">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Amount *</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <Input type="date" value={form.occurred_on} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Category</label>
          <CategorySelect value={form.category} onChange={(c) => setForm({ ...form, category: c })} blankLabel="Uncategorized" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Payment method</label>
            <select className={selectCls} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Vendor</label>
            {creatingVendor ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  placeholder="New vendor name"
                  value={newVendor}
                  onChange={(e) => setNewVendor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addVendor();
                    }
                  }}
                />
                <button type="button" onClick={addVendor} aria-label="Save vendor" className="p-2 rounded-lg border border-border-strong hover:bg-bg-hover text-status-ok">
                  <Check className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => { setCreatingVendor(false); setNewVendor(""); }} aria-label="Cancel" className="p-2 rounded-lg border border-border-subtle hover:bg-bg-hover text-text-secondary">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select className={selectCls} value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}>
                  <option value="">— None —</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setCreatingVendor(true)} aria-label="New vendor" className="shrink-0 p-2 rounded-lg border border-border-strong hover:bg-bg-hover text-text-secondary">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className={labelCls}>Memo</label>
          <Input placeholder="Optional" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5">
          <div>
            <div className="text-sm text-text-primary">Tax deductible</div>
            <div className="text-xs text-text-tertiary">Counts toward your Schedule C totals.</div>
          </div>
          <Toggle checked={form.deductible} onChange={(v) => setForm({ ...form, deductible: v })} ariaLabel="Tax deductible" />
        </div>

        {/* Receipt */}
        <div>
          <label className={labelCls}>Receipt</label>
          <input
            ref={fileRef}
            type="file"
            accept={RECEIPT_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickFile(f);
              e.target.value = "";
            }}
          />
          {receiptFile ? (
            <div className="flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm">
              <Paperclip className="w-4 h-4 text-text-secondary shrink-0" />
              <span className="truncate flex-1">{receiptFile.name}</span>
              <button type="button" onClick={() => setReceiptFile(null)} className="text-text-tertiary hover:text-status-alert" aria-label="Remove file">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : hasExistingReceipt ? (
            <div className="flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm">
              <Paperclip className="w-4 h-4 text-status-ok shrink-0" />
              <span className="truncate flex-1">Receipt attached</span>
              <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-text-secondary hover:text-text-primary">Replace</button>
              <button type="button" onClick={() => setRemoveReceipt(true)} className="text-xs text-text-tertiary hover:text-status-alert">Remove</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-3 text-sm text-text-secondary hover:bg-bg-hover transition-colors"
            >
              <Paperclip className="w-4 h-4" />
              Attach image or PDF
            </button>
          )}
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Saving…" : editing ? "Save changes" : "Save expense"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
