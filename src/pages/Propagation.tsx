import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/StatusDot";
import { Plus, MoreHorizontal, Clock, X, ChevronRight } from "lucide-react";
import React, { useState } from "react";
import { EmptyState } from "@/components/ui/StateRenderer";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { CultivarName } from "@/components/ui/CultivarName";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/Input";
import { useEntity } from "@/hooks/useEntity";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

type Batch = Tables<"propagation_batches">;

const STAGES = [
  { id: "mother", title: "Mother Plants" },
  { id: "division", title: "Division & Pullings" },
  { id: "establishment", title: "Establishment" },
  { id: "ready", title: "Ready for Sale" },
] as const;

const STAGE_ORDER = STAGES.map((s) => s.id);

const SEED: Batch[] = [];

export default function Propagation() {
  const { data: batches, add, update, remove, isLoading } = useEntity<Batch>("propagation_batches", SEED, {
    toRow: (b) => ({
      batch_id: b.batch_id,
      cultivar: b.cultivar,
      count: b.count,
      stage: b.stage,
      started: b.started,
      est_ready: b.est_ready,
      notes: b.notes,
    }),
  });
  const { addToast } = useApp();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = batches.find((b) => b.id === selectedId) ?? null;

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ cultivar: "", count: 0, stage: "division" });

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ cultivar: "", count: 0, stage: "division", started: "", est_ready: "", notes: "" });

  const openEdit = () => {
    if (!selected) return;
    setEditForm({
      cultivar: selected.cultivar,
      count: selected.count,
      stage: selected.stage,
      started: selected.started ?? "",
      est_ready: selected.est_ready ?? "",
      notes: selected.notes ?? "",
    });
    setIsEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const cultivar = editForm.cultivar.trim();
    if (!cultivar) return;
    const result = await update(selected.id, {
      cultivar,
      count: Number(editForm.count) || 1,
      stage: editForm.stage,
      started: editForm.started || null,
      est_ready: editForm.est_ready || null,
      notes: editForm.notes.trim() || null,
    } as Partial<Batch>);
    if (result.ok === false) {
      addToast({ title: "Couldn't save batch", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setIsEditOpen(false);
    addToast({ title: "Batch updated", description: selected.batch_id, status: "ok" });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const cultivar = form.cultivar.trim();
    if (!cultivar) return;
    const nextNum = batches.reduce((max, b) => {
      const n = parseInt((b.batch_id ?? "").split("-")[1] ?? "0", 10);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 100);
    const result = await add({
      id: crypto.randomUUID(),
      batch_id: `B-${nextNum + 1}`,
      cultivar,
      count: Number(form.count) || 1,
      stage: form.stage,
      started: new Date().toISOString().slice(0, 10),
      est_ready: null,
      notes: null,
      updated_at: new Date().toISOString(),
    } as Batch);
    if (result.ok === false) {
      addToast({ title: "Couldn't add batch", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setIsOpen(false);
    setForm({ cultivar: "", count: 0, stage: "division" });
    addToast({ title: "Batch created", description: cultivar, status: "ok" });
  };

  const promote = async (b: Batch) => {
    const idx = STAGE_ORDER.indexOf(b.stage as (typeof STAGE_ORDER)[number]);
    if (idx < 0 || idx >= STAGE_ORDER.length - 1) return;
    const next = STAGE_ORDER[idx + 1];
    const result = await update(b.id, { stage: next } as Partial<Batch>);
    if (result.ok === false) {
      addToast({ title: "Couldn't promote", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    addToast({ title: "Promoted", description: `${b.batch_id} → ${STAGES.find((s) => s.id === next)?.title}`, status: "ok" });
  };

  const discard = async (b: Batch) => {
    if (!confirm(`Discard batch ${b.batch_id}?`)) return;
    const result = await remove(b.id);
    if (result.ok === false) {
      addToast({ title: "Couldn't discard", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setSelectedId(null);
    addToast({ title: "Batch discarded", status: "info" });
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className={cn("flex-1 px-4 md:px-8 py-6 flex flex-col transition-all", selected ? "md:pr-[480px] duration-200 ease-out" : "duration-150 ease-in")}>
        <div className="mb-8 flex items-center justify-between shrink-0">
          <h1 className="text-2xl font-semibold">Propagation</h1>
          <Button variant="brand" onClick={() => setIsOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            <span className="hidden md:inline">Add Batch</span>
            <span className="md:hidden">Add</span>
          </Button>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
          {isLoading ? (
            <div className="text-text-secondary text-sm">Loading…</div>
          ) : batches.length === 0 ? (
            <EmptyState
              title="No batches yet"
              description="Track tissue-culture and division progress through stages."
              action={<Button variant="outline" onClick={() => setIsOpen(true)}>Add Batch</Button>}
            />
          ) : (
            <div className="flex h-full gap-6 min-w-max pr-6 pb-24 md:pb-0">
              {STAGES.map((col) => (
                <div key={col.id} className="flex-1 flex flex-col w-[85vw] md:w-[280px] shrink-0 snap-center md:snap-none">
                  <div className="flex items-center justify-between mb-4 px-2">
                    <h3 className="font-medium text-sm text-text-secondary uppercase tracking-wider">{col.title}</h3>
                    <Badge>{batches.filter((b) => b.stage === col.id).length}</Badge>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3 bg-bg-base/50 rounded-xl p-2 border border-border-subtle/30">
                    {batches.filter((b) => b.stage === col.id).map((batch) => (
                      <Card
                        key={batch.id}
                        className={cn(
                          "p-4 cursor-pointer hover:border-border-strong transition-colors",
                          selectedId === batch.id ? "border-accent-brand" : "",
                        )}
                        onClick={() => setSelectedId(batch.id)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="text-xs text-text-secondary bg-bg-active px-2 py-1 rounded font-mono">{batch.batch_id}</div>
                          <button className="text-text-secondary hover:text-text-primary" aria-label="More">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="font-medium mb-2 text-text-primary leading-tight">
                          <CultivarName name={batch.cultivar} />
                        </div>
                        <div className="flex items-center justify-between text-sm mb-4">
                          <span className="text-text-secondary">Yield est.</span>
                          <span className="font-medium tabular-nums">{batch.count}</span>
                        </div>
                        <div className="space-y-2 pt-2 border-t border-border-subtle text-xs">
                          {batch.started && (
                            <div className="flex items-center gap-2 text-text-secondary">
                              <Clock className="w-3.5 h-3.5 text-text-tertiary" />
                              Started {batch.started}
                            </div>
                          )}
                          {batch.est_ready && (
                            <div className="text-text-secondary">Ready {batch.est_ready}</div>
                          )}
                          {batch.notes && (
                            <div className="mt-2 text-status-warn border border-status-warn/20 p-2 rounded bg-[rgba(255,255,255,0.02)] flex items-start gap-2">
                              <StatusDot status="warn" className="mt-2 flex-shrink-0" />
                              <span>{batch.notes}</span>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div
        className={cn(
          "fixed inset-0 md:inset-auto md:top-[56px] md:right-0 md:bottom-0 md:w-[480px] bg-bg-base md:bg-[rgba(255,255,255,0.04)] backdrop-blur-md md:border-l border-border-subtle shadow-2xl transition-transform z-50 md:z-20 flex flex-col",
          selected ? "translate-x-0 duration-200 ease-out" : "translate-x-full duration-150 ease-in",
        )}
      >
        {selected && (
          <>
            <div className="p-4 md:p-6 border-b border-border-subtle flex items-center justify-between bg-bg-elevated md:bg-transparent">
              <div>
                <h2 className="text-xl font-semibold mb-2">Batch {selected.batch_id}</h2>
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <div className="w-2 h-2 rounded-full bg-status-info"></div>
                  <span>{STAGES.find((s) => s.id === selected.stage)?.title}</span>
                </div>
              </div>
              <button onClick={() => setSelectedId(null)} aria-label="Close" className="p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
              <section>
                <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Associations</h3>
                <Link to="/cultivars" className="flex items-center justify-between p-2 rounded-lg border border-border-subtle bg-bg-active hover:bg-bg-hover transition-colors">
                  <div>
                    <div className="text-xs text-text-secondary mb-2">Cultivar</div>
                    <div className="font-medium">
                      <CultivarName name={selected.cultivar} />
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-tertiary" />
                </Link>
              </section>
              <section>
                <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Notes</h3>
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{selected.notes ?? "—"}</p>
              </section>
            </div>
            <div className="p-4 md:p-6 border-t border-border-subtle bg-bg-base/50 flex gap-2 pb-safe">
              <Button variant="outline" className="flex-1" onClick={() => discard(selected)}>Discard</Button>
              <Button variant="outline" className="flex-1" onClick={openEdit}>Edit</Button>
              <Button className="flex-1" onClick={() => promote(selected)} disabled={selected.stage === STAGE_ORDER[STAGE_ORDER.length - 1]}>Promote</Button>
            </div>
          </>
        )}
      </div>

      {isEditOpen && selected && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <h2 className="text-lg font-semibold">Edit Batch {selected.batch_id}</h2>
              <button onClick={() => setIsEditOpen(false)} aria-label="Close" className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEdit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Cultivar *</label>
                <Input required value={editForm.cultivar} onChange={(e) => setEditForm({ ...editForm, cultivar: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Stage</label>
                  <select
                    className="w-full bg-bg-base border border-border-subtle rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-brand"
                    value={editForm.stage}
                    onChange={(e) => setEditForm({ ...editForm, stage: e.target.value })}
                  >
                    {STAGES.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Count</label>
                  <Input type="number" min="1" required value={editForm.count} onChange={(e) => setEditForm({ ...editForm, count: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Started</label>
                  <Input type="date" value={editForm.started} onChange={(e) => setEditForm({ ...editForm, started: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Est. ready</label>
                  <Input type="date" value={editForm.est_ready} onChange={(e) => setEditForm({ ...editForm, est_ready: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-bg-base border border-border-subtle rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-brand resize-y"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button type="submit">Save Changes</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <h2 className="text-lg font-semibold">Add Propagation Batch</h2>
              <button onClick={() => setIsOpen(false)} aria-label="Close" className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-4 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Cultivar *</label>
                <Input required placeholder="P. agnata" value={form.cultivar} onChange={(e) => setForm({ ...form, cultivar: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Stage</label>
                <select
                  className="w-full bg-bg-base border border-border-subtle rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-brand"
                  value={form.stage}
                  onChange={(e) => setForm({ ...form, stage: e.target.value })}
                >
                  {STAGES.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Count</label>
                <Input type="number" min="1" required value={form.count} onChange={(e) => setForm({ ...form, count: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit">Create Batch</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
