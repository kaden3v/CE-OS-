import { useMemo, useState, FormEvent } from "react";
import { Factory, Plus, X, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { CultivarName } from "@/components/ui/CultivarName";
import { useEntity } from "@/hooks/useEntity";
import { useApp } from "@/contexts/AppContext";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

type Run = Tables<"production_runs">;
type RunItem = Tables<"production_run_items">;
type Supply = Tables<"supplies">;
type Cultivar = Tables<"cultivars">;

type DraftSupply = { supply_id: string; qty_used: number };

export default function Production() {
  const { data: runs, add: addRun, isLoading } = useEntity<Run>("production_runs", [], {
    orderBy: "created_at",
    toRow: (r) => ({
      cultivar_id: r.cultivar_id,
      batch_id: r.batch_id,
      description: r.description,
      quantity: r.quantity,
      labor_hours: r.labor_hours,
      labor_rate: r.labor_rate,
      run_on: r.run_on,
    }),
  });
  const { data: runItems, add: addRunItem } = useEntity<RunItem>("production_run_items", [], {
    orderBy: "created_at",
    toRow: (i) => ({
      run_id: i.run_id,
      supply_id: i.supply_id,
      name_snapshot: i.name_snapshot,
      qty_used: i.qty_used,
      unit_cost: i.unit_cost,
    }),
  });
  const { data: supplies, update: updateSupply } = useEntity<Supply>("supplies", []);
  const { data: cultivars } = useEntity<Cultivar>("cultivars", [], { toRow: (c) => ({ name: c.name }) });
  const { addToast } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    description: "",
    cultivar_id: "",
    quantity: 1,
    labor_hours: 0,
    labor_rate: 0,
  });
  const [draftSupplies, setDraftSupplies] = useState<DraftSupply[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const itemsByRun = useMemo(() => {
    const map = new Map<string, RunItem[]>();
    runItems.forEach((i) => map.set(i.run_id, [...(map.get(i.run_id) ?? []), i]));
    return map;
  }, [runItems]);

  const runCost = (run: Run): { materials: number; labor: number; total: number } => {
    const materials = (itemsByRun.get(run.id) ?? []).reduce((s, i) => s + Number(i.qty_used) * Number(i.unit_cost), 0);
    const labor = Number(run.labor_hours) * Number(run.labor_rate);
    return { materials, labor, total: materials + labor };
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

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const lines = draftSupplies.filter((l) => l.supply_id && l.qty_used > 0);
    setIsSaving(true);

    const runResult = await addRun({
      id: crypto.randomUUID(),
      cultivar_id: form.cultivar_id || null,
      batch_id: null,
      description: form.description.trim() || null,
      quantity: Math.max(0, Number(form.quantity) || 0),
      labor_hours: Number(form.labor_hours) || 0,
      labor_rate: Number(form.labor_rate) || 0,
      run_on: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
      user_id: "",
      org_id: null,
    } as Run);
    if (runResult.ok === false) {
      setIsSaving(false);
      addToast({ title: "Couldn't save run", description: friendlyDbError({ code: runResult.code } as any), status: "alert" });
      return;
    }

    // Record each consumed supply with its cost snapshot, then decrement stock.
    for (const line of lines) {
      const sup = supplies.find((x) => x.id === line.supply_id);
      if (!sup) continue;
      await addRunItem({
        id: crypto.randomUUID(),
        run_id: runResult.row.id,
        supply_id: sup.id,
        name_snapshot: sup.name,
        qty_used: line.qty_used,
        unit_cost: Number(sup.cost ?? 0),
        created_at: new Date().toISOString(),
        user_id: "",
        org_id: null,
      } as RunItem);
      await updateSupply(sup.id, { on_hand: Math.max(0, Number(sup.on_hand) - line.qty_used) } as Partial<Supply>);
    }

    setIsSaving(false);
    setIsOpen(false);
    setForm({ description: "", cultivar_id: "", quantity: 1, labor_hours: 0, labor_rate: 0 });
    setDraftSupplies([]);
    addToast({ title: "Production run logged", description: `${lines.length} suppl${lines.length === 1 ? "y" : "ies"} consumed`, status: "ok" });
  };

  const cultivarName = (id: string | null) => (id ? cultivars.find((c) => c.id === id)?.name ?? "—" : "—");

  const columns = useMemo(
    () => [
      { accessorKey: "run_on", header: "Date", cell: (info: any) => <span className="text-text-secondary">{info.getValue()}</span> },
      { accessorKey: "description", header: "Run", cell: (info: any) => <span className="font-medium">{info.getValue() ?? "—"}</span> },
      { accessorKey: "cultivar_id", header: "Cultivar", cell: (info: any) => <CultivarName name={cultivarName(info.getValue())} className="text-text-secondary" /> },
      { accessorKey: "quantity", header: "Units", cell: (info: any) => <span className="tabular-nums">{info.getValue()}</span> },
      {
        id: "materials",
        header: "Materials",
        cell: (info: any) => <span className="tabular-nums text-text-secondary">${runCost(info.row.original).materials.toFixed(2)}</span>,
      },
      {
        id: "labor",
        header: "Labor",
        cell: (info: any) => <span className="tabular-nums text-text-secondary">${runCost(info.row.original).labor.toFixed(2)}</span>,
      },
      {
        id: "total",
        header: "Total cost",
        cell: (info: any) => <span className="tabular-nums font-medium">${runCost(info.row.original).total.toFixed(2)}</span>,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cultivars, itemsByRun],
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-2 flex items-center gap-2">
            <Factory className="w-6 h-6 text-text-secondary" /> Production
          </h1>
          <p className="text-sm text-text-secondary">
            Log potting-up runs: what was made, which supplies it consumed, and the labor — the basis for real COGS.
          </p>
        </div>
        <Button variant="brand" onClick={() => setIsOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Log Run
        </Button>
      </div>

      <Card className="flex-1 overflow-auto flex flex-col">
        {isLoading ? (
          <LoadingTable cols={7} rows={8} />
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
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl bg-bg-elevated border-border-strong shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <h2 className="text-lg font-semibold">Log Production Run</h2>
              <button onClick={() => setIsOpen(false)} aria-label="Close" className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Description</label>
                <Input placeholder="Potted up 40 D. capensis into 3.5-inch pots" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Cultivar</label>
                  <select
                    className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong"
                    value={form.cultivar_id}
                    onChange={(e) => setForm({ ...form, cultivar_id: e.target.value })}
                  >
                    <option value="">— None —</option>
                    {cultivars.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
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
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs uppercase tracking-wide text-text-secondary">Supplies consumed</label>
                  <Button type="button" size="sm" variant="ghost" onClick={addSupplyLine} disabled={supplies.length === 0}>
                    <Plus className="w-3 h-3 mr-1" />
                    Add supply
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
                        <select
                          className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong"
                          value={line.supply_id}
                          onChange={(e) => updateSupplyLine(i, { supply_id: e.target.value })}
                        >
                          <option value="">— Pick supply —</option>
                          {supplies.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} ({s.on_hand}{s.unit ? ` ${s.unit}` : ""} on hand)</option>
                          ))}
                        </select>
                        <Input type="number" step="0.01" min="0" placeholder="Qty" value={line.qty_used} onChange={(e) => updateSupplyLine(i, { qty_used: Number(e.target.value) || 0 })} />
                        <span className="text-xs text-text-secondary tabular-nums text-right">
                          ${sup ? (Number(sup.cost ?? 0) * line.qty_used).toFixed(2) : "0.00"}
                        </span>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeSupplyLine(i)} aria-label="Remove supply line">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-right text-sm text-text-secondary space-y-1 pt-2">
                <div>Materials: <span className="tabular-nums text-text-primary">${draftMaterialsCost.toFixed(2)}</span></div>
                <div>Labor: <span className="tabular-nums text-text-primary">${draftLaborCost.toFixed(2)}</span></div>
                <div className="font-medium">Run cost: <span className="tabular-nums text-text-primary">${(draftMaterialsCost + draftLaborCost).toFixed(2)}</span></div>
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
