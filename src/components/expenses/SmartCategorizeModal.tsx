import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/format";
import { formatBusinessDate } from "@/lib/dates";
import { CategorySelect } from "./CategorySelect";
import type { CategorySuggestion } from "@/lib/expenseCategorization";
import type { Expense, Vendor } from "./types";

export interface SuggestionItem {
  expense: Expense;
  suggestion: CategorySuggestion;
}

interface SmartCategorizeModalProps {
  open: boolean;
  onClose: () => void;
  items: SuggestionItem[];
  vendors: Vendor[];
  onApply: (selections: { id: string; category: string }[]) => Promise<void>;
}

interface RowChoice {
  checked: boolean;
  category: string;
}

/**
 * Review-and-apply for history-derived category suggestions. Every row is
 * pre-checked with its suggested category; the user can untick or override
 * before applying. Only the ticked rows with a category are written.
 */
export function SmartCategorizeModal({ open, onClose, items, vendors, onApply }: SmartCategorizeModalProps) {
  // Freeze the row set when the modal opens. A teammate's edit or a realtime
  // refresh changes the `items` prop identity, which must NOT reset the user's
  // in-progress ticks/overrides mid-review — so we snapshot once and work off it.
  const [rows, setRows] = useState<SuggestionItem[]>([]);
  const [choices, setChoices] = useState<Record<string, RowChoice>>({});
  const [applying, setApplying] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!open) return;
    const snapshot = itemsRef.current;
    setRows(snapshot);
    const init: Record<string, RowChoice> = {};
    for (const it of snapshot) init[it.expense.id] = { checked: true, category: it.suggestion.category };
    setChoices(init);
  }, [open]);

  const setChoice = (id: string, patch: Partial<RowChoice>) =>
    setChoices((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const selected = rows.filter((it) => choices[it.expense.id]?.checked && choices[it.expense.id]?.category);
  const allChecked = rows.length > 0 && rows.every((it) => choices[it.expense.id]?.checked);

  const toggleAll = () =>
    setChoices((prev) => {
      const next = { ...prev };
      for (const it of rows) next[it.expense.id] = { ...next[it.expense.id], checked: !allChecked };
      return next;
    });

  const vendorLabel = (e: Expense) => {
    if (e.vendor_id) {
      const v = vendors.find((x) => x.id === e.vendor_id);
      if (v) return v.name;
    }
    return e.vendor_name ?? e.description ?? "—";
  };

  const apply = async () => {
    const selections = selected.map((it) => ({ id: it.expense.id, category: choices[it.expense.id].category }));
    if (selections.length === 0) return;
    setApplying(true);
    try {
      await onApply(selections);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Smart categorize" size="xl">
      <div className="p-4 space-y-4">
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Sparkles className="w-4 h-4 text-accent-brand" />
          Suggested from how you've categorized similar expenses before. Review and apply.
        </p>

        <div className="max-h-[50vh] overflow-auto rounded-lg border border-border-subtle">
          <table className="w-full text-sm text-left">
            <thead className="text-[11px] uppercase tracking-wide text-text-secondary sticky top-0 bg-bg-elevated border-b border-border-subtle">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" aria-label="Select all" checked={allChecked} onChange={toggleAll} className="w-4 h-4 align-middle accent-[var(--color-accent-brand)]" />
                </th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Vendor / memo</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => {
                const e = it.expense;
                const c = choices[e.id] ?? { checked: true, category: it.suggestion.category };
                return (
                  <tr key={e.id} className="border-b border-border-subtle/50 last:border-0">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${vendorLabel(e)}`}
                        checked={c.checked}
                        onChange={() => setChoice(e.id, { checked: !c.checked })}
                        className="w-4 h-4 align-middle accent-[var(--color-accent-brand)]"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatBusinessDate(e.occurred_on)}</td>
                    <td className="px-3 py-2 max-w-[14rem] truncate">{vendorLabel(e)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatMoney(e.amount)}</td>
                    <td className="px-3 py-2 w-44">
                      <CategorySelect value={c.category} onChange={(cat) => setChoice(e.id, { category: cat })} className="!py-1 !px-2" />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-text-tertiary">
                      {it.suggestion.basis === "vendor" ? "same vendor" : "same memo"} · {it.suggestion.support}×
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
          <span className="text-sm text-text-secondary">{selected.length} of {rows.length} selected</span>
          <div className="flex gap-3">
            <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="brand" type="button" disabled={applying || selected.length === 0} onClick={apply}>
              {applying && <Loader2 className="w-4 h-4 animate-spin" />}
              {applying ? "Applying…" : `Apply ${selected.length}`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
