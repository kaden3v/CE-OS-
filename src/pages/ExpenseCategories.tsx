import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Plus, Pencil, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useApp } from "@/contexts/AppContext";
import { useExpenseCategories } from "@/contexts/ExpenseCategoriesContext";
import { SCHEDULE_C_CATEGORIES, type ScheduleCCategory } from "@/lib/scheduleC";
import {
  SCHEDULE_F_CATEGORIES,
  SCHEDULE_F_FALLBACK,
  mapToScheduleF,
  type ScheduleFCategory,
  type TaxSchedule,
} from "@/lib/scheduleF";
import { mapToScheduleC } from "@/lib/scheduleC";

const selectCls =
  "w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong";
const labelCls = "block text-xs uppercase tracking-wide text-text-secondary mb-2";

interface EditState {
  original: string | null; // null = adding
  name: string;
  scheduleF: ScheduleFCategory;
  scheduleC: ScheduleCCategory;
}

export default function ExpenseCategories() {
  const { addToast } = useApp();
  const { book, isLoading, available, isCustom, taxSchedule, setTaxSchedule, addCategory, updateCategory, removeCategory, countUsage } =
    useExpenseCategories();

  const [edit, setEdit] = useState<EditState | null>(null);
  const [del, setDel] = useState<{ name: string; count: number | null; reassignTo: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapBusy, setSwapBusy] = useState(false);

  const openAdd = () =>
    setEdit({ original: null, name: "", scheduleF: SCHEDULE_F_FALLBACK, scheduleC: mapToScheduleC(null).scheduleC });
  const openEdit = (name: string) => {
    const cat = book.list.find((c) => c.name === name);
    setEdit({
      original: name,
      name,
      scheduleF: cat?.scheduleF ?? mapToScheduleF(name).scheduleF,
      scheduleC: cat?.scheduleC ?? mapToScheduleC(name).scheduleC,
    });
  };

  const swapSchedule = async (next: TaxSchedule) => {
    if (next === taxSchedule || swapBusy) return;
    setSwapBusy(true);
    const r = await setTaxSchedule(next);
    setSwapBusy(false);
    if (!r.ok) {
      addToast({ title: "Couldn't switch schedule", description: r.error, status: "alert" });
      return;
    }
    addToast({ title: `Reporting on Schedule ${next}`, description: next === "F" ? "Farm (Form 1040 Schedule F)" : "Business (Form 1040 Schedule C)", status: "ok" });
  };

  const saveEdit = async () => {
    if (!edit) return;
    setBusy(true);
    const lines = { name: edit.name, scheduleF: edit.scheduleF, scheduleC: edit.scheduleC };
    const r = edit.original ? await updateCategory(edit.original, lines) : await addCategory(lines);
    setBusy(false);
    if (!r.ok) {
      addToast({ title: "Couldn't save category", description: r.error, status: "alert" });
      return;
    }
    addToast({ title: edit.original ? "Category updated" : "Category added", description: edit.name.trim(), status: "ok" });
    setEdit(null);
  };

  const openDelete = async (name: string) => {
    setDel({ name, count: null, reassignTo: "" });
    const count = await countUsage(name);
    setDel((d) => (d && d.name === name ? { ...d, count } : d));
  };

  const confirmDelete = async () => {
    if (!del) return;
    setBusy(true);
    const r = await removeCategory(del.name, del.reassignTo || null);
    setBusy(false);
    if (!r.ok) {
      addToast({ title: "Couldn't delete category", description: r.error, status: "alert" });
      return;
    }
    addToast({ title: "Category deleted", description: del.name, status: "info" });
    setDel(null);
  };

  const groups = book.groupsFor(taxSchedule);
  const lineOf = (name: string) =>
    taxSchedule === "F" ? book.scheduleFFor(name) : book.scheduleCFor(name);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <Link to="/finances/manage" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-4">
        <ArrowLeft className="w-4 h-4" /> Manage
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Categories</h1>
          <p className="text-sm text-text-secondary">
            Expense categories and the Schedule {taxSchedule} line each one maps to.
            {isCustom ? " Customized for your business." : " Currently the built-in defaults."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Tax schedule" className="flex rounded-lg border border-border-subtle overflow-hidden">
            {(["F", "C"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void swapSchedule(s)}
                disabled={swapBusy}
                aria-pressed={taxSchedule === s}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  taxSchedule === s ? "bg-accent-brand-dim text-accent-brand" : "text-text-secondary hover:text-text-primary hover:bg-bg-active"
                }`}
              >
                Schedule {s}
              </button>
            ))}
          </div>
          <Button variant="brand" onClick={openAdd} disabled={!available}>
            <Plus className="w-4 h-4" /> Add category
          </Button>
        </div>
      </div>

      {!available && !isLoading && (
        <Card className="p-4 mb-6 border-status-warn/40 bg-status-warn/10">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-status-warn shrink-0 mt-0.5" />
            <span>
              Editing categories needs a one-time database setup that hasn't been applied yet. You're seeing the built-in
              defaults below (read-only). Once the migration is applied, you'll be able to add, rename, and remove them.
            </span>
          </div>
        </Card>
      )}

      {isLoading ? (
        <Card className="p-8 text-center text-text-secondary text-sm">Loading…</Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.line}>
              <div className="text-xs uppercase tracking-wide text-text-secondary mb-2">{g.line}</div>
              <Card className="divide-y divide-border-subtle/60">
                {g.categories.map((name) => (
                  <div key={name} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex-1 font-medium">{name}</span>
                    <Badge variant="outline" className="text-text-tertiary border-border-subtle">{lineOf(name)}</Badge>
                    {available && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(name)} aria-label={`Edit ${name}`} className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-active">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => void openDelete(name)} aria-label={`Delete ${name}`} className="p-1.5 rounded text-text-secondary hover:text-status-alert hover:bg-bg-active">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.original ? "Edit category" : "Add category"}>
        {edit && (
          <div className="p-4 space-y-4">
            <div>
              <label className={labelCls}>Name</label>
              <Input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Greenhouse heating" />
            </div>
            <div>
              <label className={labelCls}>Schedule F line</label>
              <select className={selectCls} value={edit.scheduleF} onChange={(e) => setEdit({ ...edit, scheduleF: e.target.value as ScheduleFCategory })}>
                {SCHEDULE_F_CATEGORIES.map((sf) => (
                  <option key={sf} value={sf}>{sf}</option>
                ))}
              </select>
              <p className="text-xs text-text-tertiary mt-1.5">Which tax line this category totals into on Schedule F (farm).</p>
            </div>
            <div>
              <label className={labelCls}>Schedule C line</label>
              <select className={selectCls} value={edit.scheduleC} onChange={(e) => setEdit({ ...edit, scheduleC: e.target.value as ScheduleCCategory })}>
                {SCHEDULE_C_CATEGORIES.map((sc) => (
                  <option key={sc} value={sc}>{sc}</option>
                ))}
              </select>
              <p className="text-xs text-text-tertiary mt-1.5">Used if you ever swap the report to Schedule C.</p>
            </div>
            <div className="pt-2 flex justify-end gap-3 border-t border-border-subtle">
              <Button variant="ghost" type="button" onClick={() => setEdit(null)}>Cancel</Button>
              <Button type="button" disabled={busy || !edit.name.trim()} onClick={saveEdit}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {edit.original ? "Save changes" : "Add category"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete */}
      <Modal open={!!del} onClose={() => setDel(null)} title="Delete category">
        {del && (
          <div className="p-4 space-y-4">
            <p className="text-sm">
              Delete <span className="font-medium">{del.name}</span>?
            </p>
            <p className="text-sm text-text-secondary">
              {del.count === null
                ? "Checking how many expenses use it…"
                : del.count === 0
                  ? "No expenses use this category."
                  : `${del.count} expense${del.count === 1 ? "" : "s"} use this category. Choose where to move them:`}
            </p>
            {del.count !== null && del.count > 0 && (
              <select className={selectCls} value={del.reassignTo} onChange={(e) => setDel({ ...del, reassignTo: e.target.value })}>
                <option value="">Leave uncategorized (needs review)</option>
                {book.names.filter((n) => n.toLowerCase() !== del.name.toLowerCase()).map((n) => (
                  <option key={n} value={n}>Move to “{n}”</option>
                ))}
              </select>
            )}
            <div className="pt-2 flex justify-end gap-3 border-t border-border-subtle">
              <Button variant="ghost" type="button" onClick={() => setDel(null)}>Cancel</Button>
              <Button variant="outline" type="button" className="text-status-alert" disabled={busy || del.count === null} onClick={confirmDelete}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
