import { ArrowUp, ArrowDown, Paperclip, Pencil, Trash2, Lock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { formatBusinessDate } from "@/lib/dates";
import { isManaged, needsReview, type Expense, type Vendor } from "./types";

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
  onStartEdit: (id: string) => void;
  onDelete: (e: Expense) => void;
  onOpenReceipt: (path: string) => void;
  onAttachReceipt: (e: Expense) => void;
  /** Suggested category per uncategorized row id (history-derived). */
  suggestions?: Map<string, string>;
  onApplySuggestion?: (id: string, category: string) => void;
  /** Row ids whose suggestion is currently being written (disables the chip). */
  pendingSuggestionIds?: Set<string>;
  total: number;
}

/** Short chip label per non-manual expense source (auto-created rows). */
const SOURCE_BADGE: Record<string, string> = {
  etsy: "Etsy",
  subscription: "Auto",
  supply_purchase: "Supply",
  mileage: "Mileage",
};

/**
 * How a managed (non-manual) row is labelled where its edit/delete controls
 * would otherwise sit — plus where to go to change it instead.
 */
const MANAGED_META: Record<string, { label: string; hint: string }> = {
  etsy: { label: "Synced", hint: "Synced from Etsy — managed automatically" },
  subscription: { label: "Recurring", hint: "Posted by a recurring subscription — manage it in Subscriptions" },
  supply_purchase: { label: "Supplies", hint: "Created by a supply purchase — manage it in Supplies" },
  mileage: { label: "Mileage", hint: "Logged from a mileage trip — manage it in Mileage" },
};
const managedMeta = (src: string) =>
  MANAGED_META[src] ?? { label: "Managed", hint: "Managed automatically — edit it at its source" };

const cellCls = "px-3 py-2 whitespace-nowrap";

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

export function ExpenseTable({
  rows, vendors, selected, allSelected, onToggleRow, onToggleAll,
  sort, onSort, onStartEdit, onDelete, onOpenReceipt, onAttachReceipt, suggestions, onApplySuggestion, pendingSuggestionIds, total,
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
            rows.map((e) => {
              const managed = isManaged(e);
              const suggestion = suggestions?.get(e.id);
              return (
                <tr key={e.id} className={cn("border-b border-border-subtle/50 last:border-0 hover:bg-bg-hover/50 transition-colors", selected.has(e.id) && "bg-bg-active/40")}>
                  <td className="px-3 py-2 w-8">
                    {managed ? (
                      <span className="inline-flex" title="Managed row — edit it at its source">
                        <Lock className="w-3.5 h-3.5 text-text-tertiary/60 align-middle" />
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={selected.has(e.id)}
                        onChange={() => onToggleRow(e.id)}
                        className="w-4 h-4 align-middle accent-[var(--color-accent-brand)]"
                      />
                    )}
                  </td>
                  <td className={cn(cellCls, "text-text-secondary")}>{formatBusinessDate(e.occurred_on)}</td>
                  <td className={cellCls}>
                    {needsReview(e) ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Badge variant="outline" className="text-status-warn border-status-warn/40">Needs review</Badge>
                        {suggestion && onApplySuggestion && (
                          <button
                            onClick={() => onApplySuggestion(e.id, suggestion)}
                            disabled={pendingSuggestionIds?.has(e.id)}
                            aria-label={`Apply suggested category ${suggestion}`}
                            title={`Apply suggested category: ${suggestion}`}
                            className="inline-flex items-center gap-1 text-xs text-accent-brand hover:underline disabled:opacity-50 disabled:no-underline"
                          >
                            <Sparkles className="w-3 h-3" aria-hidden="true" /> {suggestion}
                          </button>
                        )}
                      </span>
                    ) : (
                      <Badge>{e.category}</Badge>
                    )}
                    {e.source && SOURCE_BADGE[e.source] && (
                      <Badge variant="outline" className="ml-2 text-text-tertiary border-border-subtle">{SOURCE_BADGE[e.source]}</Badge>
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
                    {managed ? (
                      <span className="flex items-center gap-1 justify-end text-xs text-text-tertiary" title={managedMeta(e.source).hint}>
                        <Lock className="w-3.5 h-3.5" /> {managedMeta(e.source).label}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => onStartEdit(e.id)} aria-label="Edit" className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-active"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => onDelete(e)} aria-label="Delete" className="p-1.5 rounded text-text-secondary hover:text-status-alert hover:bg-bg-active"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })
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
