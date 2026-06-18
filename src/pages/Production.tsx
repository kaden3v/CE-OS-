import { useEffect, useMemo, useState, FormEvent } from "react";
import { useLocation } from "react-router";
import { Factory, Plus, X, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { CultivarName } from "@/components/ui/CultivarName";
import { useEntity } from "@/hooks/useEntity";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { formatBusinessDate, todayISO, isoYear, currentYear } from "@/lib/dates";
import { logProductionRun, deleteProductionRun } from "@/lib/cogs";
import type { Tables } from "@/lib/database.types";

type Run = Tables<"production_runs">;
type RunSupply = Tables<"production_run_supplies">;
type Supply = Tables<"supplies">;
type Cultivar = Tables<"cultivars">;

type DraftSupply = { supply_id: string; qty_used: number };
type LaborType = "owner" | "hired";

export default function Production() {
  const { activeOrgId } = useAuth();
  const { data: runs, isLoading, refresh: refreshRuns } = useEntity<Run>("production_runs", [], { orderBy: "run_on" });
  const { data: runSupplies, refresh: refreshRunSupplies } = useEntity<RunSupply>("production_run_supplies", [], { orderBy: "created_at" });
  const { data: supplies, refresh: refreshSupplies } = useEntity<Supply>("supplies", []);
  const { data: cultivars } = useEntity<Cultivar>("cultivars", [], { toRow: (c) => ({ name: c.name }) });
  const { addToast } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // Opened from a Finances Overview quick action.
  useEffect(() => {
    if ((location.state as { openNew?: boolean } | null)?.openNew) setIsOpen(true);
  }, [location.state]);

  const [form, setForm] = useState({ description: "", cultivar_id: "", quantity: 1, labor_hours: 0, labor_rate: 0, labor_type: "owner" as LaborType });
  const [draftSupplies, setDraftSupplies] = useState<DraftSupply[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const materialsByRun = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of runSupplies) {
      map.set(s.run_id, (map.get(s.run_id) ?? 0) + Number(s.qty) * Number(s.unit_cost_snapshot));
    }
    return map;
  }, [runSupplies]);

  const runCost = (run: Run) => {
    const materials = materialsByRun.get(run.id) ?? 0;
    const labor = Number(run.labor_hours) * Number(run.labor_rate);
    const total = materials + labor;
    const perUnit = Number(run.quantity) > 0 ? total / Number(run.quantity) : 0;
    return { materials, labor, total, perUnit };
  };

  const addSupplyLine = () => setDraftSupplies((prev) => [...prev, { supply_id: "", qty_used: 1 }]);
  const updateSupplyLine = (i: number, patch: Partial<DraftSupply>) =>
    setDraftSupplies((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeSupplyLine = (i: number) => setDraftSupplies((prev) => prev.filter((_, idx) => idx !== i));

  const draftMaterialsCost = draftSupplies.reduce((s, l) => {
    const sup = supplies.find((x) => x.id === l.supply_id);
    return s + (sup ? Number(sup.cost ?? 0) * l.qty_used : 0);
  }, 0);
  const draftLaborCost = (Number(form.labor_hours) || 0) * (Number(form.labor_rate) || 0);

  const resetForm = () => {
    setForm({ description: "", cultivar_id: "", quantity: 1, labor_hours: 0, labor_rate: 0, labor_type: "owner" });
    setDraftSupplies([]);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeOrgId) return;
    const lines = draftSupplies.filter((l) => l.supply_id && l.qty_used > 0).map((l) => ({ supply_id: l.supply_id, qty: l.qty_used }));
    setIsSaving(true);
    try {
      await logProductionRun({
        orgId: activeOrgId,
        cultivarId: form.cultivar_id || null,
        description: form.description.trim() || null,
        quantity: Math.max(0, Number(form.quantity) || 0),
        laborHours: Number(form.labor_hours) || 0,
        laborRate: Number(form.labor_rate) || 0,
        laborType: form.labor_type,
        runOn: todayISO(),
        supplies: lines,
      });
      await Promise.all([refreshRuns(), refreshRunSupplies(), refreshSupplies()]);
      setIsOpen(false);
      resetForm();
      addToast({ title: "Production run logged", description: `${lines.length} suppl${lines.length === 1 ? "y" : "ies"} consumed`, status: "ok" });
    } catch (err) {
      addToast({ title: "Couldn't save run", description: err instanceof Error ? err.message : "Try again", status: "alert" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (run: Run) => {
    if (!confirm("Delete this run? Consumed stock will be restored to each supply.")) return;
    try {
      await deleteProductionRun(run.id);
      await Promise.all([refreshRuns(), refreshRunSupplies(), refreshSupplies()]);
      addToast({ title: "Run deleted", description: "Supply stock restored.", status: "info" });
    } catch (err) {
      addToast({ title: "Couldn't delete run", description: err instanceof Error ? err.message : "Try again", status: "alert" });
    }
  };

  const cultivarName = (id: string | null) => (id ? cultivars.find((c) => c.id === id)?.name ?? "—" : "—");

  // YTD stats
  const ytd = useMemo(() => {
    const yr = currentYear();
    const yearRuns = runs.filter((r) => isoYear(r.run_on) === yr);
    const units = yearRuns.reduce((s, r) => s + Number(r.quantity), 0);
    const cost = yearRuns.reduce((s, r) => s + runCost(r).total, 0);
    return { count: yearRuns.length, units, avgPerUnit: units > 0 ? cost / units : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, materialsByRun]);

  const columns = useMemo(
    () => [
      { accessorKey: "run_on", header: "Date", cell: (info: any) => <span className="text-text-secondary whitespace-nowrap">{formatBusinessDate(info.getValue())}</span> },
      { accessorKey: "description", header: "Run", cell: (info: any) => <span className="font-medium">{info.getValue() ?? "—"}</span> },
      { accessorKey: "cultivar_id", header: "Cultivar", cell: (info: any) => <CultivarName name={cultivarName(info.getValue())} className="text-text-secondary" /> },
      { accessorKey: "quantity", header: "Units", cell: (info: any) => <span className="tabular-nums">{info.getValue()}</span> },
      { id: "materials", header: "Materials", cell: (info: any) => <span className="tabular-nums text-text-secondary">{formatMoney(runCost(info.row.original).materials)}</span> },
      { id: "labor", header: "Labor", cell: (info: any) => <span className="tabular-nums text-text-secondary">{formatMoney(runCost(info.row.original).labor)} {info.row.original.labor_type === "hired" ? <span className="text-[10px] uppercase text-status-info ml-1">hired</span> : null}</span> },
      { id: "total", header: "Run cost", cell: (info: any) => <span className="tabular-nums font-medium">{formatMoney(runCost(info.row.original).total)}</span> },
      { id: "perUnit", header: "Per unit", cell: (info: any) => <span className="tabular-nums">{formatMoney(runCost(info.row.original).perUnit)}</span> },
      {
        id: "actions",
        header: "",
        cell: (info: any) => (
          <button onClick={() => handleDelete(info.row.original)} aria-label="Delete run" className="p-1.5 rounded text-text-secondary hover:text-status-alert hover:bg-bg-active">
            <Trash2 className="w-4 h-4" />
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cultivars, materialsByRun],
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2">
            <Factory className="w-6 h-6 text-text-secondary" /> Production
          </h1>
          <p className="text-sm text-text-secondary">Log potting-up runs — supplies consumed and labor become real per-unit cost.</p>
        </div>
        <Button variant="brand" onClick={() => setIsOpen(true)}>
          <Plus className="w-4 h-4" /> Log Run
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 md:gap-6 mb-6">
        <StatTile label="Runs YTD" value={String(ytd.count)} />
        <StatTile label="Units produced YTD" value={ytd.units.toLocaleString()} />
        <StatTile label="Avg cost / unit" value={formatMoney(ytd.avgPerUnit)} />
      </div>

      <Card className="flex-1 overflow-auto flex flex-col mb-12">
        {isLoading ? (
          <LoadingTable cols={9} rows={8} />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={Factory}
            title="No production runs yet"
            description="Log a potting-up session to start tracking cost of goods."
            action={<Button variant="outline" onClick={() => setIsOpen(true)}>Log Run</Button>}
          />
        ) : (
          <DataTable columns={columns} data={runs} />
        )}
      </Card>

      {isOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setIsOpen(false)}>
          <Card role="dialog" aria-modal="true" aria-labelledby="production-run-title" onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-2xl bg-bg-elevated border-border-strong shadow-2xl flex flex-col max-h-[90dvh] sm:max-h-[85dvh] rounded-t-2xl sm:rounded-xl">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
              <h2 id="production-run-title" className="text-lg font-semibold">Log Production Run</h2>
              <button onClick={() => setIsOpen(false)} aria-label="Close" className="text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Description</label>
                <Input placeholder="Potted up 40 D. capensis into 3.5-inch pots" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Cultivar</label>
                  <select className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong" value={form.cultivar_id} onChange={(e) => setForm({ ...form, cultivar_id: e.target.value })}>
                    <option value="">— None —</option>
                    {cultivars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Units produced</label>
                  <Input type="number" min="0" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Labor hours</label>
                  <Input type="number" step="0.25" min="0" value={form.labor_hours} onChange={(e) => setForm({ ...form, labor_hours: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Labor rate ($/hr)</label>
                  <Input type="number" step="0.01" min="0" value={form.labor_rate} onChange={(e) => setForm({ ...form, labor_rate: Number(e.target.value) || 0 })} />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Labor type</label>
                <div className="inline-flex rounded-lg border border-border-subtle bg-bg-base p-0.5 text-sm">
                  {(["owner", "hired"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setForm({ ...form, labor_type: t })}
                      className={cn("px-3 py-1.5 rounded-md capitalize transition-colors", form.labor_type === t ? "bg-bg-active text-text-primary" : "text-text-secondary hover:text-text-primary")}>
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-tertiary mt-2">
                  Owner labor is tracked for true-cost pricing but is generally not deductible for a sole proprietor. Only hired labor flows into Schedule C COGS.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs uppercase tracking-wide text-text-secondary">Supplies consumed</label>
                  <Button type="button" size="sm" variant="ghost" onClick={addSupplyLine} disabled={supplies.length === 0}>
                    <Plus className="w-3 h-3 mr-1" /> Add supply
                  </Button>
                </div>
                {supplies.length === 0 && (
                  <p className="text-xs text-text-tertiary italic">No supplies tracked yet — add them under Finances → Supplies to capture material costs.</p>
                )}
                <div className="space-y-2">
                  {draftSupplies.map((line, i) => {
                    const sup = supplies.find((x) => x.id === line.supply_id);
                    return (
                      <div key={i} className="grid grid-cols-[2fr_80px_90px_32px] gap-2 items-center">
                        <select className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong" value={line.supply_id} onChange={(e) => updateSupplyLine(i, { supply_id: e.target.value })}>
                          <option value="">— Pick supply —</option>
                          {supplies.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} · {Number(s.on_hand)}{s.unit ? ` ${s.unit}` : ""} @ {formatMoney(s.cost ?? 0)}</option>
                          ))}
                        </select>
                        <Input type="number" step="0.01" min="0" placeholder="Qty" value={line.qty_used} onChange={(e) => updateSupplyLine(i, { qty_used: Number(e.target.value) || 0 })} />
                        <span className="text-xs text-text-secondary tabular-nums text-right">{formatMoney(sup ? Number(sup.cost ?? 0) * line.qty_used : 0)}</span>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeSupplyLine(i)} aria-label="Remove supply line"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-right text-sm text-text-secondary space-y-1 pt-2">
                <div>Materials: <span className="tabular-nums text-text-primary">{formatMoney(draftMaterialsCost)}</span></div>
                <div>Labor: <span className="tabular-nums text-text-primary">{formatMoney(draftLaborCost)}</span></div>
                <div className="font-medium">Run cost: <span className="tabular-nums text-text-primary">{formatMoney(draftMaterialsCost + draftLaborCost)}</span></div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Log Run"}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
