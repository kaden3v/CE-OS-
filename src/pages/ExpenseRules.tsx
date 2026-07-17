import { useMemo, useState } from "react";
import { Wand2, Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";
import { useEntity } from "@/hooks/useEntity";
import { useCategoryBook } from "@/contexts/ExpenseCategoriesContext";
import { friendlyDbError } from "@/lib/dbErrors";
import { formatMoney } from "@/lib/format";
import { matchesRule, sortRules } from "@/lib/expenseRules";
import { summarizeWrites } from "@/lib/writeSummary";
import { RuleModal, type ExpenseRule, type RuleFormData } from "@/components/expenses/RuleModal";
import { needsReview, type Expense, type Vendor } from "@/components/expenses/types";

/**
 * Manage auto-categorization rules. The ledger itself is also loaded (read-only
 * here) so the modal can preview how many rows a rule would touch and apply it
 * to the existing review queue on save.
 */
export default function ExpenseRules() {
  const { addToast } = useApp();
  const book = useCategoryBook();

  const { data: rules, add, update, remove, isLoading } = useEntity<ExpenseRule>("expense_rules", [], {
    orderBy: "priority",
    ascending: true,
    toRow: (r) => ({
      active: r.active,
      priority: r.priority,
      match_field: r.match_field,
      match_value: r.match_value,
      amount_min: r.amount_min,
      amount_max: r.amount_max,
      set_category: r.set_category,
      set_vendor_id: r.set_vendor_id,
      mark_reviewed: r.mark_reviewed,
    }),
  });
  const { data: vendors } = useEntity<Vendor>("vendors", [], { toRow: (v) => ({ name: v.name }) });
  const { data: expenses, updateMany: updateManyExpenses } = useEntity<Expense>("expenses", [], {
    orderBy: "occurred_on",
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRule | null>(null);

  const sorted = useMemo(() => sortRules(rules), [rules]);
  const vendorName = (id: string | null) => (id ? vendors.find((v) => v.id === id)?.name ?? "—" : null);

  // Rows a rule (or the modal's draft) would apply to: still needing review.
  const reviewables = useMemo(() => expenses.filter((e) => needsReview(e)), [expenses]);
  const matchingReviewables = (data: RuleFormData): Expense[] =>
    reviewables.filter((e) =>
      matchesRule(
        { id: "draft", ...data, priority: 0 },
        { description: e.description, vendor_name: e.vendor_name, amount: Number(e.amount) },
      ),
    );

  const applyToExisting = async (data: RuleFormData): Promise<void> => {
    const targets = matchingReviewables(data);
    if (targets.length === 0) return;
    const category = book.canonical(data.set_category) ?? data.set_category;
    const patch: Partial<Expense> = {
      category,
      schedule_c_category: book.scheduleCFor(category),
      schedule_f_category: book.scheduleFFor(category),
      needs_review: false,
    };
    if (data.set_vendor_id) patch.vendor_id = data.set_vendor_id;
    const r = await updateManyExpenses(targets.map((e) => e.id), patch);
    if (!r.ok) {
      addToast({ title: "Rule saved, but applying it failed", description: friendlyDbError({ code: r.code } as any), status: "alert" });
      return;
    }
    addToast({ ...summarizeWrites(targets.length, 0, { verbPast: "categorized" }), description: category });
  };

  const handleSubmit = async (data: RuleFormData, applyExisting: boolean): Promise<boolean> => {
    if (editing) {
      const r = await update(editing.id, data as Partial<ExpenseRule>);
      if (!r.ok) {
        addToast({ title: "Couldn't save rule", description: friendlyDbError({ code: r.code } as any), status: "alert" });
        return false;
      }
      addToast({ title: "Rule updated", status: "ok" });
    } else {
      const nextPriority = rules.length ? Math.max(...rules.map((r) => r.priority)) + 10 : 100;
      const r = await add({
        id: crypto.randomUUID(),
        ...data,
        priority: nextPriority,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as ExpenseRule);
      if (r.ok === false) {
        addToast({ title: "Couldn't create rule", description: friendlyDbError({ code: r.code } as any), status: "alert" });
        return false;
      }
      addToast({ title: "Rule created", description: `${data.match_value} → ${data.set_category}`, status: "ok" });
    }
    if (applyExisting) await applyToExisting(data);
    return true;
  };

  const toggleActive = async (rule: ExpenseRule) => {
    const r = await update(rule.id, { active: !rule.active } as Partial<ExpenseRule>);
    if (!r.ok) addToast({ title: "Couldn't update", description: friendlyDbError({ code: r.code } as any), status: "alert" });
  };

  const deleteRule = async (rule: ExpenseRule) => {
    if (!confirm(`Delete the rule for “${rule.match_value}”? Already-categorized expenses keep their categories.`)) return;
    const r = await remove(rule.id);
    if (!r.ok) {
      addToast({ title: "Couldn't delete", description: friendlyDbError({ code: r.code } as any), status: "alert" });
      return;
    }
    addToast({ title: "Rule deleted", status: "info" });
  };

  // Move a rule one slot and renumber (priority = slot * 10) so ordering stays
  // meaningful even when several rules were created with the same priority.
  const move = async (rule: ExpenseRule, dir: -1 | 1) => {
    const idx = sorted.findIndex((r) => r.id === rule.id);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= sorted.length) return;
    const next = [...sorted];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    for (let i = 0; i < next.length; i++) {
      const wanted = (i + 1) * 10;
      if (next[i].priority !== wanted) {
        const r = await update(next[i].id, { priority: wanted } as Partial<ExpenseRule>);
        if (!r.ok) {
          addToast({ title: "Couldn't reorder", description: friendlyDbError({ code: r.code } as any), status: "alert" });
          return;
        }
      }
    }
  };

  const amountRange = (r: ExpenseRule): string | null => {
    const min = r.amount_min == null ? null : Number(r.amount_min);
    const max = r.amount_max == null ? null : Number(r.amount_max);
    if (min == null && max == null) return null;
    if (min != null && max != null) return `${formatMoney(min)}–${formatMoney(max)}`;
    return min != null ? `≥ ${formatMoney(min)}` : `≤ ${formatMoney(max!)}`;
  };

  const fieldLabel = (f: string) => (f === "any" ? "memo or vendor" : f);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-text-secondary" /> Rules
          </h1>
          <p className="text-sm text-text-secondary">
            Auto-categorize expenses as they arrive. Rules run top-down; the first match wins.
          </p>
        </div>
        <Button variant="brand" onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus className="w-4 h-4" /> New Rule
        </Button>
      </div>

      <Card className="flex-1 overflow-auto flex flex-col mb-12">
        {isLoading ? (
          <LoadingTable cols={6} rows={4} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={Wand2}
            title="No rules yet"
            description="A rule files matching expenses automatically — “memo contains AMZN → Packaging”. Imports it matches skip the review queue."
            action={<Button variant="outline" onClick={() => { setEditing(null); setModalOpen(true); }}>New Rule</Button>}
          />
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full min-w-max text-sm text-left">
              <thead className="text-[12px] uppercase tracking-wide text-text-secondary sticky top-0 bg-bg-base/95 backdrop-blur-md z-10 border-b border-border-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium w-20">Order</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Then</th>
                  <th className="px-3 py-2 font-medium">Review</th>
                  <th className="px-3 py-2 font-medium">Active</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.id} className="border-b border-border-subtle/50 last:border-0 hover:bg-bg-hover/50 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => void move(r, -1)}
                          disabled={i === 0}
                          aria-label="Move up"
                          className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-active disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => void move(r, 1)}
                          disabled={i === sorted.length - 1}
                          aria-label="Move down"
                          className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-active disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <span className="ml-1 text-text-tertiary tabular-nums">{i + 1}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-text-secondary">{fieldLabel(r.match_field)} contains</span>{" "}
                      <span className="font-medium">“{r.match_value}”</span>
                      {amountRange(r) && <span className="ml-2 text-xs text-text-tertiary tabular-nums">{amountRange(r)}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Badge>{r.set_category}</Badge>
                      {vendorName(r.set_vendor_id) && (
                        <span className="ml-2 text-xs text-text-secondary">vendor → {vendorName(r.set_vendor_id)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-text-secondary">{r.mark_reviewed ? "Skips queue" : "Queued"}</td>
                    <td className="px-3 py-2">
                      <Toggle checked={r.active} onChange={() => void toggleActive(r)} ariaLabel="Rule active" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => { setEditing(r); setModalOpen(true); }}
                          aria-label="Edit"
                          className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-active"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void deleteRule(r)}
                          aria-label="Delete"
                          className="p-1.5 rounded text-text-secondary hover:text-status-alert hover:bg-bg-active"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RuleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        vendors={vendors}
        editing={editing}
        onSubmit={handleSubmit}
        countMatches={(data) => matchingReviewables(data).length}
      />
    </div>
  );
}
