import { useEffect, useMemo, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { useApp } from "@/contexts/AppContext";
import { CategorySelect } from "./CategorySelect";
import type { Vendor } from "./types";
import type { Tables } from "@/lib/database.types";

export type ExpenseRule = Tables<"expense_rules">;

/** The editable shape of a rule (matcher + actions). */
export interface RuleFormData {
  match_field: "memo" | "vendor" | "any";
  match_value: string;
  amount_min: number | null;
  amount_max: number | null;
  set_category: string;
  set_vendor_id: string | null;
  mark_reviewed: boolean;
  active: boolean;
}

interface RuleModalProps {
  open: boolean;
  onClose: () => void;
  vendors: Vendor[];
  editing: ExpenseRule | null;
  /** Prefill for "create rule from this expense" (create mode only). */
  initial?: Partial<RuleFormData> | null;
  /**
   * Save the rule; `applyExisting` asks the caller to also apply it to the
   * ledger rows it matches that still need review. Return false to keep open.
   */
  onSubmit: (data: RuleFormData, applyExisting: boolean) => Promise<boolean>;
  /** How many loaded ledger rows needing review the current form matches. */
  countMatches?: (data: RuleFormData) => number;
}

const emptyForm = (): RuleFormData => ({
  match_field: "any",
  match_value: "",
  amount_min: null,
  amount_max: null,
  set_category: "",
  set_vendor_id: null,
  mark_reviewed: true,
  active: true,
});

const labelCls = "block text-xs uppercase tracking-wide text-text-secondary mb-2";
const selectCls =
  "w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong";

const MATCH_FIELDS: { value: RuleFormData["match_field"]; label: string }[] = [
  { value: "any", label: "Memo or vendor" },
  { value: "memo", label: "Memo" },
  { value: "vendor", label: "Vendor" },
];

export function RuleModal({ open, onClose, vendors, editing, initial, onSubmit, countMatches }: RuleModalProps) {
  const { addToast } = useApp();
  const [form, setForm] = useState<RuleFormData>(emptyForm());
  const [applyExisting, setApplyExisting] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            match_field: (editing.match_field as RuleFormData["match_field"]) ?? "any",
            match_value: editing.match_value,
            amount_min: editing.amount_min == null ? null : Number(editing.amount_min),
            amount_max: editing.amount_max == null ? null : Number(editing.amount_max),
            set_category: editing.set_category,
            set_vendor_id: editing.set_vendor_id,
            mark_reviewed: editing.mark_reviewed,
            active: editing.active,
          }
        : { ...emptyForm(), ...initial },
    );
    setApplyExisting(true);
  }, [open, editing, initial]);

  const matchCount = useMemo(() => {
    if (!countMatches || !form.match_value.trim() || !form.set_category.trim()) return 0;
    return countMatches(form);
  }, [countMatches, form]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.match_value.trim()) {
      addToast({ title: "Match text required", description: "What should this rule look for?", status: "warn" });
      return;
    }
    if (!form.set_category.trim()) {
      addToast({ title: "Category required", description: "Pick the category the rule applies.", status: "warn" });
      return;
    }
    if (form.amount_min != null && form.amount_max != null && form.amount_min > form.amount_max) {
      addToast({ title: "Check the amount range", description: "Min is greater than max.", status: "warn" });
      return;
    }
    setSaving(true);
    const ok = await onSubmit(form, applyExisting && matchCount > 0);
    setSaving(false);
    if (ok) onClose();
  };

  const numField = (v: number | null): string => (v == null ? "" : String(v));
  const parseNum = (raw: string): number | null => {
    if (!raw.trim()) return null;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Rule" : "New Rule"} size="lg">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-accent-brand/30 bg-accent-brand/10 px-3 py-2 text-xs text-text-secondary">
          <Wand2 className="w-3.5 h-3.5 text-accent-brand shrink-0 mt-0.5" />
          Rules auto-categorize expenses as they arrive — CSV imports, receipt scans, and manual entry.
        </div>

        <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-4">
          <div>
            <label className={labelCls}>When</label>
            <select
              className={selectCls}
              value={form.match_field}
              onChange={(e) => setForm({ ...form, match_field: e.target.value as RuleFormData["match_field"] })}
            >
              {MATCH_FIELDS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Contains *</label>
            <Input
              autoFocus={!editing}
              required
              placeholder="e.g. AMZN, Home Depot, postage"
              value={form.match_value}
              onChange={(e) => setForm({ ...form, match_value: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Amount at least</label>
            <Input
              type="number" step="0.01" min="0" placeholder="Any"
              value={numField(form.amount_min)}
              onChange={(e) => setForm({ ...form, amount_min: parseNum(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelCls}>Amount at most</label>
            <Input
              type="number" step="0.01" min="0" placeholder="Any"
              value={numField(form.amount_max)}
              onChange={(e) => setForm({ ...form, amount_max: parseNum(e.target.value) })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Set category *</label>
            <CategorySelect value={form.set_category} onChange={(c) => setForm({ ...form, set_category: c })} blankLabel="— Pick —" />
          </div>
          <div>
            <label className={labelCls}>Set vendor</label>
            <select
              className={selectCls}
              value={form.set_vendor_id ?? ""}
              onChange={(e) => setForm({ ...form, set_vendor_id: e.target.value || null })}
            >
              <option value="">— Leave as-is —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5">
          <div>
            <div className="text-sm text-text-primary">Skip the review queue</div>
            <div className="text-xs text-text-tertiary">Imports this rule matches are trusted and marked reviewed.</div>
          </div>
          <Toggle checked={form.mark_reviewed} onChange={(v) => setForm({ ...form, mark_reviewed: v })} ariaLabel="Skip review queue" />
        </div>

        {editing && (
          <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5">
            <div className="text-sm text-text-primary">Active</div>
            <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} ariaLabel="Rule active" />
          </div>
        )}

        {matchCount > 0 && (
          <label className="flex items-center gap-2.5 rounded-lg border border-accent-brand/30 bg-accent-brand/5 px-3 py-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={applyExisting}
              onChange={(e) => setApplyExisting(e.target.checked)}
              className="w-4 h-4 accent-[var(--color-accent-brand)]"
            />
            <span>
              Also categorize <span className="font-medium">{matchCount}</span> existing{" "}
              {matchCount === 1 ? "expense" : "expenses"} needing review
            </span>
          </label>
        )}

        <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Saving…" : editing ? "Save changes" : "Create rule"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
