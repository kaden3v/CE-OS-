import React, { useState, useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Plus, X, ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { cn } from "@/lib/utils";
import { CultivarName } from "@/components/ui/CultivarName";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/Input";
import { useEntity } from "@/hooks/useEntity";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

type Cultivar = Tables<"cultivars">;

const SEED: Cultivar[] = [];

export default function Cultivars() {
  const { data: cultivars, add, isLoading } = useEntity<Cultivar>("cultivars", SEED, {
    toRow: (c) => ({
      name: c.name,
      common: c.common,
      genus: c.genus,
      origin: c.origin,
    }),
  });
  const { addToast } = useApp();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => cultivars.find((c) => c.id === selectedId) ?? null, [cultivars, selectedId]);

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ name: "", common: "", genus: "Pinguicula", origin: "" });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const result = await add({
      id: crypto.randomUUID(),
      name,
      common: form.common.trim() || null,
      genus: form.genus.trim() || null,
      origin: form.origin.trim() || null,
      updated_at: new Date().toISOString(),
    } as Cultivar);
    if (result.ok === false) {
      addToast({ title: "Couldn't add cultivar", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setIsOpen(false);
    setForm({ name: "", common: "", genus: "Pinguicula", origin: "" });
    addToast({ title: "Cultivar added", description: name, status: "ok" });
  };

  const columns = useMemo(
    () => [
      { accessorKey: "name", header: "Name", cell: (info: any) => <CultivarName name={info.getValue()} className="font-medium" /> },
      { accessorKey: "common", header: "Common", cell: (info: any) => <span className="text-text-secondary">{info.getValue() ?? "—"}</span> },
      { accessorKey: "genus", header: "Genus", cell: (info: any) => (info.getValue() ? <Badge>{info.getValue()}</Badge> : null) },
      { accessorKey: "origin", header: "Origin", cell: (info: any) => <span className="text-text-secondary">{info.getValue() ?? "—"}</span> },
    ],
    [],
  );

  const isEmpty = !isLoading && cultivars.length === 0;

  return (
    <div className="flex h-full relative">
      <div className={cn("flex-1 p-4 md:p-8 flex flex-col h-full transition-all", selected ? "md:pr-[480px] duration-200 ease-out" : "duration-150 ease-in")}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold mb-2">Cultivars Registry</h1>
            <p className="text-sm text-text-secondary">Master records for every cultivar — link inventory and listings to one of these.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/cultivars/profit"><Button variant="outline">Profit Analysis</Button></Link>
            <Button variant="brand" onClick={() => setIsOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Cultivar
            </Button>
          </div>
        </div>

        <Card className="flex-1 overflow-auto flex flex-col">
          {isLoading ? (
            <LoadingTable cols={4} rows={10} />
          ) : isEmpty ? (
            <EmptyState
              title="No cultivars yet"
              description="Add the first one to begin tracking parentage and care."
              action={<Button variant="brand" onClick={() => setIsOpen(true)}>Add Cultivar</Button>}
            />
          ) : (
            <DataTable columns={columns} data={cultivars} onRowClick={(row) => setSelectedId(row.id)} />
          )}
        </Card>
      </div>

      <div
        className={cn(
          "fixed inset-0 md:inset-auto md:top-[56px] md:right-0 md:bottom-0 w-full md:w-[480px] bg-bg-base md:bg-[rgba(255,255,255,0.04)] backdrop-blur-md md:border-l border-border-subtle shadow-2xl transition-transform z-50 md:z-20 flex flex-col",
          selected ? "translate-x-0 duration-200 ease-out" : "translate-x-full duration-150 ease-in",
        )}
      >
        {selected && (
          <>
            <div className="p-4 md:p-6 border-b border-border-subtle flex items-center justify-between bg-bg-elevated md:bg-transparent">
              <div>
                <CultivarName className="text-xl font-semibold" name={selected.name} />
                <div className="text-sm text-text-secondary">{selected.common ?? "—"}</div>
              </div>
              <button onClick={() => setSelectedId(null)} aria-label="Close" className="p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
              <section>
                <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-text-secondary mb-1">Genus</div>
                    <div className="font-medium">{selected.genus ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-text-secondary mb-1">Origin</div>
                    <div className="font-medium">{selected.origin ?? "—"}</div>
                  </div>
                </div>
              </section>
              <section>
                <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Associations</h3>
                <div className="space-y-2">
                  <Link to="/inventory" className="flex items-center justify-between p-2 rounded-lg border border-border-subtle bg-bg-active hover:bg-bg-hover transition-colors">
                    <span className="text-sm font-medium">View in Inventory</span>
                    <ExternalLink className="w-4 h-4 text-text-secondary" />
                  </Link>
                  <Link to="/propagation" className="flex items-center justify-between p-2 rounded-lg border border-border-subtle bg-bg-active hover:bg-bg-hover transition-colors">
                    <span className="text-sm font-medium">Propagation Batches</span>
                    <ExternalLink className="w-4 h-4 text-text-secondary" />
                  </Link>
                  <Link to="/listings" className="flex items-center justify-between p-2 rounded-lg border border-border-subtle bg-bg-active hover:bg-bg-hover transition-colors">
                    <span className="text-sm font-medium">Channel Listings</span>
                    <ExternalLink className="w-4 h-4 text-text-secondary" />
                  </Link>
                </div>
              </section>
            </div>
          </>
        )}
      </div>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title="Add Cultivar" size="sm">
            <form onSubmit={handleAdd} className="p-4 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Name *</label>
                <Input required placeholder="P. agnata 'Red'" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Common</label>
                <Input placeholder="Red Mexican Butterwort" value={form.common} onChange={(e) => setForm({ ...form, common: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Genus</label>
                  <Input placeholder="Pinguicula" value={form.genus} onChange={(e) => setForm({ ...form, genus: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Origin</label>
                  <Input placeholder="Mexico / Hybrid" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit">Save Cultivar</Button>
              </div>
            </form>
      </Modal>
    </div>
  );
}
