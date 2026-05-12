import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Search, Image as ImageIcon, Plus, X, ArrowLeft, QrCode, Pencil, Trash2, Save, Minus } from "lucide-react";
import React, { useState, useMemo } from "react";
import { Link } from "react-router";
import { useDataState } from "@/hooks/useDataState";
import { ErrorState, EmptyState, ZeroResultState } from "@/components/ui/StateRenderer";
import { cn } from "@/lib/utils";
import { CultivarName } from "@/components/ui/CultivarName";
import { PhotoUploader } from "@/components/PhotoUploader";
import { useApp } from "@/contexts/AppContext";
import { friendlyDbError } from "@/lib/dbErrors";

import type { Tables } from "@/lib/database.types";
import { useEntity as useEntityRaw } from "@/hooks/useEntity";

type InventoryRow = Tables<"inventory">;
type CultivarRow = Tables<"cultivars">;

type InventoryItem = {
  id: string | number;
  name: string;
  common: string;
  genus: string;
  cultivar_id: string | null;
  stock: { juv: number; mat: number; flower: number };
  lastUpdated: string;
};

const INVENTORY: InventoryItem[] = [];

const fromRow = (r: InventoryRow): InventoryItem => ({
  id: r.id,
  name: r.name,
  common: r.common ?? "Unknown",
  genus: r.genus ?? "Unknown",
  cultivar_id: r.cultivar_id,
  stock: { juv: r.stock_juv, mat: r.stock_mat, flower: r.stock_flower },
  lastUpdated: r.updated_at,
});

// Partial-safe mapper: only includes fields actually present in the input.
// `update()` may pass a partial patch (e.g. just {common} or just {stock});
// we don't want to overwrite columns the caller didn't touch, and we don't
// want to crash on `it.stock.juv` when stock is absent.
const toRow = (it: Partial<InventoryItem>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  if ("name" in it) row.name = it.name;
  if ("common" in it) row.common = it.common;
  if ("genus" in it) row.genus = it.genus;
  if ("cultivar_id" in it) row.cultivar_id = it.cultivar_id;
  if (it.stock) {
    row.stock_juv = it.stock.juv;
    row.stock_mat = it.stock.mat;
    row.stock_flower = it.stock.flower;
  }
  return row;
};


export default function Inventory() {
  const { data: inventory, add: addInventoryItem, update: updateInventoryItem, remove: removeInventoryItem } = useEntityRaw<InventoryItem, InventoryRow>(
    "inventory",
    INVENTORY,
    { toRow, fromRow },
  );
  const { data: cultivars } = useEntityRaw<CultivarRow>("cultivars", [], {
    toRow: (c) => ({ name: c.name }),
  });
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [activeTab, setActiveTab] = useState("Stock");
  
  const { data, isLoading, isError, isEmpty } = useDataState(inventory);
  
  const filteredData = useMemo(() => {
    if (!lowStockFilter) return data;
    return data.filter(item => (item.stock.juv + item.stock.mat + item.stock.flower) < 10);
  }, [data, lowStockFilter]);

  const selectedItem = useMemo(() => inventory.find(i => i.id === selectedId), [inventory, selectedId]);

  // Modal logic
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newPlant, setNewPlant] = useState({ name: "", common: "", genus: "", cultivar_id: "", juv: 0, mat: 0, flower: 0 });
  const { addToast } = useApp();

  // Edit Details modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFields, setEditFields] = useState({ name: "", common: "", genus: "", cultivar_id: "" });
  const openEdit = (item: InventoryItem) => {
    setEditFields({
      name: item.name,
      common: item.common,
      genus: item.genus,
      cultivar_id: item.cultivar_id ?? "",
    });
    setIsEditModalOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    const linked = editFields.cultivar_id ? cultivars.find((c) => c.id === editFields.cultivar_id) : null;
    const patch: Partial<InventoryItem> = {
      name: linked?.name ?? editFields.name.trim(),
      common: editFields.common.trim() || linked?.common || "Unknown",
      genus: linked?.genus ?? editFields.genus.trim() ?? "Unknown",
      cultivar_id: editFields.cultivar_id || null,
    };
    const result = await updateInventoryItem(selectedItem.id, patch);
    if (result.ok === false) {
      addToast({ title: "Save failed", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setIsEditModalOpen(false);
    addToast({ title: "Plant details updated", status: "ok" });
  };

  // Inline stock editor
  const [stockDraft, setStockDraft] = useState<{ juv: number; mat: number; flower: number } | null>(null);
  const [savingStock, setSavingStock] = useState(false);

  const startEditingStock = () => {
    if (!selectedItem) return;
    setStockDraft({ ...selectedItem.stock });
  };

  const cancelStockEdit = () => setStockDraft(null);

  const saveStock = async () => {
    if (!selectedItem || !stockDraft) return;
    setSavingStock(true);
    const result = await updateInventoryItem(selectedItem.id, { stock: stockDraft });
    setSavingStock(false);
    if (result.ok === false) {
      addToast({ title: "Couldn't save stock", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setStockDraft(null);
    addToast({ title: "Stock updated", description: selectedItem.name, status: "ok" });
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    if (!confirm(`Delete "${selectedItem.name}" from inventory? This also removes its photos. This cannot be undone.`)) return;
    const result = await removeInventoryItem(selectedItem.id);
    if (result.ok === false) {
      addToast({ title: "Delete failed", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setSelectedId(null);
    setActiveTab("Stock");
    addToast({ title: "Plant removed", status: "info" });
  };

  const handleAddPlant = async (e: React.FormEvent) => {
    e.preventDefault();
    // If a cultivar was picked, snapshot its name/genus into the inventory row
    const linkedCultivar = newPlant.cultivar_id ? cultivars.find((c) => c.id === newPlant.cultivar_id) : null;
    const plant: InventoryItem = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now(),
      name: linkedCultivar?.name ?? newPlant.name,
      common: newPlant.common || linkedCultivar?.common || "Unknown",
      genus: linkedCultivar?.genus ?? newPlant.genus ?? "Unknown",
      cultivar_id: newPlant.cultivar_id || null,
      stock: { juv: newPlant.juv, mat: newPlant.mat, flower: newPlant.flower },
      lastUpdated: "Just now",
    };
    await addInventoryItem(plant);
    setIsAddModalOpen(false);
    setNewPlant({ name: "", common: "", genus: "", cultivar_id: "", juv: 0, mat: 0, flower: 0 });
    addToast("Plant added to inventory", "success");
  };

  return (
    <div className="flex h-full relative">
      <div className={cn("flex-1 p-4 md:p-8 flex flex-col transition-all", selectedItem ? "md:pr-[480px] duration-200 ease-out" : "duration-150 ease-in")}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl font-semibold mb-2">Inventory</h1>
            <p className="text-sm text-text-secondary">Manage plant stock levels across all stages.</p>
          </div>
          
          <div className="flex items-center gap-2">
            <Link to="/inventory/qr-codes"><Button variant="outline"><QrCode className="w-4 h-4 mr-2" /> QR Codes</Button></Link>
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <Input placeholder="Search inventory..." className="pl-8 w-full" />
            </div>
            <Button 
              variant={lowStockFilter ? "brand" : "outline"} 
              onClick={() => setLowStockFilter(!lowStockFilter)}
            >
              Low Stock
            </Button>
            <Button variant="default" className="hidden md:flex gap-2" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="w-4 h-4" /> Add
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto -mx-4 px-4 md:mx-0 md:px-0">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 9 }).map((_, i) => (
                <Card key={i} className="p-4 animate-pulse">
                  <div className="h-16 w-16 bg-bg-elevated rounded mb-6" />
                  <div className="h-5 bg-bg-elevated rounded w-3/4 mb-2" />
                  <div className="h-4 bg-bg-elevated rounded w-1/2 mb-6" />
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="h-12 bg-bg-elevated rounded" />
                    <div className="h-12 bg-bg-elevated rounded" />
                    <div className="h-12 bg-bg-elevated rounded" />
                  </div>
                  <div className="h-4 bg-bg-elevated rounded w-1/3 mt-4" />
                </Card>
              ))}
            </div>
          ) : isError ? (
            <ErrorState />
          ) : isEmpty ? (
            <EmptyState title="Inventory is empty" description="Add a plant to begin." action={<Button variant="outline" onClick={() => setIsAddModalOpen(true)}>Add Plant</Button>} />
          ) : filteredData.length === 0 ? (
            <ZeroResultState onClearOption={() => setLowStockFilter(false)} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-24 md:pb-0">
              {filteredData.map((item) => {
                const totalStock = item.stock.juv + item.stock.mat + item.stock.flower;
                const isLowStock = totalStock < 10;
                return (
                  <Card key={item.id} className="p-4 flex flex-col hover:border-border-strong transition-colors cursor-pointer group" onClick={() => setSelectedId(item.id)}>
                    <div className="flex items-start gap-4 mb-6">
                      <div className="w-16 h-16 rounded bg-bg-active border border-border-subtle flex flex-col items-center justify-center text-text-tertiary shrink-0">
                        <ImageIcon className="w-6 h-6 mb-2 opacity-50" />
                      </div>
                      <div>
                        <h3 className="font-medium  text-lg leading-tight mb-2 group-hover:text-accent-brand transition-colors"><CultivarName name={item.name} /></h3>
                        <p className="text-xs text-text-secondary uppercase tracking-wide">{item.common}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 p-2 bg-bg-base/50 rounded-lg border border-border-subtle mb-4">
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-text-secondary mb-2">JUVENILE</span>
                        <div className="flex items-center gap-2 font-medium tabular-nums">
                          <StatusDot status={item.stock.juv < 5 ? "warn" : "ok"} />
                          {item.stock.juv}
                        </div>
                      </div>
                      <div className="flex flex-col items-center border-l border-r border-border-subtle">
                        <span className="text-xs text-text-secondary mb-2">MATURE</span>
                        <div className="flex items-center gap-2 font-medium tabular-nums">
                          <StatusDot status={item.stock.mat < 2 ? "warn" : "ok"} />
                          {item.stock.mat}
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-text-secondary mb-2">FLOWERING</span>
                        <div className="flex items-center gap-2 font-medium tabular-nums">
                          <StatusDot status={item.stock.flower === 0 ? "info" : "ok"} />
                          {item.stock.flower}
                        </div>
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between text-xs text-text-secondary pt-2 border-t border-border-subtle">
                      <div className="flex items-center gap-2">
                        <span>Updated {item.lastUpdated}</span>
                      </div>
                      {isLowStock && <Badge variant="default" className="text-status-alert border-status-alert/20">Low Stock</Badge>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* FAB for Mobile */}
      <div className="md:hidden fixed bottom-20 right-4 z-30">
        <button 
           onClick={() => setIsAddModalOpen(true)}
           className="w-14 h-14 rounded-2xl bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-border-subtle flex items-center justify-center shadow-2xl text-text-secondary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brand">
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* Detail Panel / Screen */}
      <div 
        className={cn(
          "fixed inset-0 md:inset-auto md:top-[56px] md:right-0 md:bottom-0 md:w-[480px] bg-bg-base md:bg-[rgba(255,255,255,0.04)] backdrop-blur-md md:border-l border-border-subtle shadow-2xl transition-transform z-50 md:z-20 flex flex-col", selectedItem ? "translate-x-0 duration-200 ease-out" : "translate-x-full duration-150 ease-in"
        )}
      >
        {selectedItem && (
          <>
            <div className="p-4 md:p-6 pb-0 border-b border-border-subtle flex flex-col bg-bg-elevated md:bg-transparent">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {setSelectedId(null); setActiveTab("Stock");}}
                    className="md:hidden p-2 -ml-2 text-text-secondary hover:text-text-primary rounded-lg"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h2 className="text-xl font-semibold "><CultivarName name={selectedItem.name} /></h2>
                    <div className="text-sm text-text-secondary">{selectedItem.common}</div>
                  </div>
                </div>
                <button 
                  onClick={() => {setSelectedId(null); setActiveTab("Stock");}}
                  className="hidden md:flex p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex gap-6 border-b border-transparent">
                {["Stock", "Photos"].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "pb-2 text-sm font-medium transition-colors relative",
                      activeTab === tab ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {tab}
                    {activeTab === tab && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-text-primary"></div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
              {activeTab === "Stock" && (
                <>
                  {/* Stock — inline-editable */}
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs uppercase tracking-wide text-text-secondary">Live Stock</h3>
                      {!stockDraft ? (
                        <button onClick={startEditingStock} className="text-xs text-accent-brand hover:underline">Edit</button>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={cancelStockEdit} className="text-xs text-text-secondary hover:text-text-primary">Cancel</button>
                          <button onClick={saveStock} disabled={savingStock} className="text-xs text-accent-brand hover:underline disabled:opacity-50">
                            {savingStock ? "Saving…" : "Save"}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(["juv", "mat", "flower"] as const).map((stage) => {
                        const labels = { juv: "JUVENILE", mat: "MATURE", flower: "FLOWERING" };
                        const v = stockDraft ? stockDraft[stage] : selectedItem.stock[stage];
                        const dotStatus = stage === "flower"
                          ? (v === 0 ? "info" : "ok")
                          : stage === "juv"
                            ? (v < 5 ? "warn" : "ok")
                            : (v < 2 ? "warn" : "ok");
                        return (
                          <div key={stage} className="p-4 rounded-lg bg-bg-active border border-border-subtle text-center">
                            {stockDraft ? (
                              <div className="flex items-center justify-center gap-1 mb-2">
                                <button
                                  onClick={() => setStockDraft((prev) => prev ? { ...prev, [stage]: Math.max(0, prev[stage] - 1) } : prev)}
                                  className="w-7 h-7 rounded-md bg-bg-elevated hover:bg-bg-hover text-text-secondary flex items-center justify-center transition-colors"
                                  aria-label={`Decrease ${labels[stage]}`}
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  value={stockDraft[stage]}
                                  onChange={(e) => {
                                    const v = Math.max(0, parseInt(e.target.value) || 0);
                                    setStockDraft((prev) => prev ? { ...prev, [stage]: v } : prev);
                                  }}
                                  className="w-16 text-center text-2xl font-medium tabular-nums bg-bg-elevated border border-border-subtle rounded-md focus:outline-none focus:border-accent-brand"
                                />
                                <button
                                  onClick={() => setStockDraft((prev) => prev ? { ...prev, [stage]: prev[stage] + 1 } : prev)}
                                  className="w-7 h-7 rounded-md bg-bg-elevated hover:bg-bg-hover text-text-secondary flex items-center justify-center transition-colors"
                                  aria-label={`Increase ${labels[stage]}`}
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="text-2xl font-medium mb-2 flex items-center justify-center gap-2 tabular-nums">
                                <StatusDot status={dotStatus as any} />
                                {v}
                              </div>
                            )}
                            <div className="text-xs text-text-secondary">{labels[stage]}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 text-xs text-text-tertiary">
                      Last updated {new Date(selectedItem.lastUpdated).toLocaleString()}
                    </div>
                  </section>

                  {/* Related */}
                  <section>
                    <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Related</h3>
                    <div className="space-y-2">
                      <Link to="/cultivars" className="flex justify-between items-center p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-border-subtle hover:bg-bg-hover transition-colors">
                        <span className="text-sm font-medium">Cultivar Registry</span>
                        <span className="text-xs text-text-secondary">View &rarr;</span>
                      </Link>
                      <Link to="/propagation" className="flex justify-between items-center p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-border-subtle hover:bg-bg-hover transition-colors">
                        <span className="text-sm font-medium">Propagation Batches</span>
                        <span className="text-xs text-text-secondary">View &rarr;</span>
                      </Link>
                    </div>
                  </section>
                </>
              )}

              {activeTab === "Photos" && selectedItem && (
                <PhotoUploader inventoryId={String(selectedItem.id)} />
              )}
            </div>
            
            <div className="p-4 md:p-6 border-t border-border-subtle bg-bg-base/50 flex gap-2 pb-safe">
              <Button variant="outline" className="flex-1" onClick={() => openEdit(selectedItem)}>
                <Pencil className="w-4 h-4 mr-1" />
                Edit details
              </Button>
              <Button
                variant="outline"
                onClick={handleDelete}
                className="text-status-alert border-status-alert/20 hover:bg-status-alert/10"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl flex flex-col">
             <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
              <h2 className="text-lg font-semibold">Add to Inventory</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <form id="add-plant-form" onSubmit={handleAddPlant} className="space-y-4">
                {cultivars.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Link to Cultivar (recommended)</label>
                    <select
                      value={newPlant.cultivar_id}
                      onChange={(e) => setNewPlant({ ...newPlant, cultivar_id: e.target.value })}
                      className="w-full bg-bg-base border border-border-subtle rounded-md px-3 py-2 text-sm focus:outline-none focus:border-border-strong"
                    >
                      <option value="">— Custom (fill below) —</option>
                      {cultivars.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cultivar Name {newPlant.cultivar_id && <span className="text-text-tertiary">(from registry)</span>}</label>
                  <Input
                    required={!newPlant.cultivar_id}
                    placeholder="P. agnata"
                    value={newPlant.name}
                    disabled={!!newPlant.cultivar_id}
                    onChange={(e) => setNewPlant({ ...newPlant, name: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Common Name</label>
                  <Input placeholder="Butterwort" value={newPlant.common} onChange={(e) => setNewPlant({ ...newPlant, common: e.target.value })} className="w-full" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Genus</label>
                  <Input
                    required={!newPlant.cultivar_id}
                    placeholder="Pinguicula"
                    value={newPlant.genus}
                    disabled={!!newPlant.cultivar_id}
                    onChange={(e) => setNewPlant({ ...newPlant, genus: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2">
                   <div className="space-y-2">
                     <label className="text-xs text-text-secondary uppercase">Juv.</label>
                     <Input type="number" min="0" required value={newPlant.juv} onChange={(e) => setNewPlant({...newPlant, juv: parseInt(e.target.value) || 0})} className="w-full" />
                   </div>
                   <div className="space-y-2">
                     <label className="text-xs text-text-secondary uppercase">Mat.</label>
                     <Input type="number" min="0" required value={newPlant.mat} onChange={(e) => setNewPlant({...newPlant, mat: parseInt(e.target.value) || 0})} className="w-full" />
                   </div>
                   <div className="space-y-2">
                     <label className="text-xs text-text-secondary uppercase">Flw.</label>
                     <Input type="number" min="0" required value={newPlant.flower} onChange={(e) => setNewPlant({...newPlant, flower: parseInt(e.target.value) || 0})} className="w-full" />
                   </div>
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-border-subtle bg-bg-base/50 flex justify-end gap-2 shrink-0">
               <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
               <Button variant="brand" type="submit" form="add-plant-form">Save Plant</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Edit Details Modal */}
      {isEditModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
              <h2 className="text-lg font-semibold">Edit details</h2>
              <button onClick={() => setIsEditModalOpen(false)} aria-label="Close" className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form id="edit-plant-form" onSubmit={handleEditSave} className="p-4 space-y-4">
              {cultivars.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Linked cultivar</label>
                  <select
                    value={editFields.cultivar_id}
                    onChange={(e) => setEditFields({ ...editFields, cultivar_id: e.target.value })}
                    className="w-full bg-bg-base border border-border-subtle rounded-md px-3 py-2 text-sm focus:outline-none focus:border-border-strong"
                  >
                    <option value="">— Custom (fill below) —</option>
                    {cultivars.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-text-tertiary">Linking syncs name + genus from the registry.</p>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Cultivar Name {editFields.cultivar_id && <span className="text-text-tertiary">(from registry)</span>}
                </label>
                <Input
                  required={!editFields.cultivar_id}
                  placeholder="P. agnata"
                  value={editFields.name}
                  disabled={!!editFields.cultivar_id}
                  onChange={(e) => setEditFields({ ...editFields, name: e.target.value })}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Common name</label>
                <Input
                  placeholder="Butterwort"
                  value={editFields.common}
                  onChange={(e) => setEditFields({ ...editFields, common: e.target.value })}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Genus</label>
                <Input
                  required={!editFields.cultivar_id}
                  placeholder="Pinguicula"
                  value={editFields.genus}
                  disabled={!!editFields.cultivar_id}
                  onChange={(e) => setEditFields({ ...editFields, genus: e.target.value })}
                  className="w-full"
                />
              </div>
            </form>
            <div className="p-4 border-t border-border-subtle bg-bg-base/50 flex justify-end gap-2 shrink-0">
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
              <Button variant="brand" type="submit" form="edit-plant-form">
                <Save className="w-4 h-4 mr-1" />
                Save changes
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
