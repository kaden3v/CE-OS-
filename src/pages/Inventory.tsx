import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Search, Image as ImageIcon, Plus, X, ArrowLeft, AlertTriangle, QrCode, Camera } from "lucide-react";
import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router";
import { useDataState } from "@/hooks/useDataState";
import { useEntity } from "@/hooks/useEntity";
import { useForm } from "@/hooks/useForm";
import { ErrorState, EmptyState, ZeroResultState } from "@/components/ui/StateRenderer";
import { cn } from "@/lib/utils";
import { CultivarName } from "@/components/ui/CultivarName";
import { useApp } from "@/contexts/AppContext";
import { AddItemModal, type AddItemField } from "@/components/AddItemModal";
import { InventorySchema, type InventoryItem } from "@/lib/schemas";

export type { InventoryItem };

type InventoryAddForm = {
  name: string;
  common: string;
  genus: string;
  juv: number;
  mat: number;
  flower: number;
};

const INVENTORY_ADD_INITIAL: InventoryAddForm = {
  name: "",
  common: "",
  genus: "",
  juv: 0,
  mat: 0,
  flower: 0,
};

const INVENTORY_ADD_FIELDS: AddItemField<InventoryAddForm>[] = [
  { name: "name", label: "Cultivar Name", type: "text", required: true, placeholder: "P. agnata" },
  { name: "common", label: "Common Name", type: "text", placeholder: "Butterwort" },
  { name: "genus", label: "Genus", type: "text", required: true, placeholder: "Pinguicula" },
  { name: "juv", label: "Juv.", type: "number", required: true, width: "third", labelClassName: "text-xs uppercase text-[#1A2E28]/75" },
  { name: "mat", label: "Mat.", type: "number", required: true, width: "third", labelClassName: "text-xs uppercase text-[#1A2E28]/75" },
  { name: "flower", label: "Flw.", type: "number", required: true, width: "third", labelClassName: "text-xs uppercase text-[#1A2E28]/75" },
];

export const seedInventory: InventoryItem[] = [
  { id: "1", name: "Pinguicula 'Pirouette'", common: "Pirouette Butterwort", genus: "Pinguicula", stock: { juv: 45, mat: 12, flower: 4 }, lastUpdated: "2 hours ago" },
  { id: "2", name: "Pinguicula agnata 'El Lobo'", common: "El Lobo", genus: "Pinguicula", stock: { juv: 12, mat: 3, flower: 0 }, lastUpdated: "1 day ago" },
  { id: "3", name: "Pinguicula 'Johanna'", common: "Agnata x Debbertiana", genus: "Pinguicula", stock: { juv: 5, mat: 0, flower: 0 }, lastUpdated: "3 days ago" },
  { id: "4", name: "Drosera capensis 'Red'", common: "Red Cape Sundew", genus: "Drosera", stock: { juv: 120, mat: 54, flower: 10 }, lastUpdated: "4 hours ago" },
  { id: "5", name: "Pinguicula gigantea", common: "Giant Butterwort", genus: "Pinguicula", stock: { juv: 8, mat: 2, flower: 1 }, lastUpdated: "1 week ago" },
  { id: "6", name: "Pinguicula moranensis", common: "Mexican Butterwort", genus: "Pinguicula", stock: { juv: 60, mat: 25, flower: 8 }, lastUpdated: "2 days ago" },
  { id: "7", name: "Pinguicula 'Sethos'", common: "Sethos Butterwort", genus: "Pinguicula", stock: { juv: 30, mat: 15, flower: 5 }, lastUpdated: "5 hours ago" },
];

function TimelineTab() {
  const [compareMode, setCompareMode] = useState(false);

  if (compareMode) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-subtle">
           <span className="text-sm font-medium">Compare Plants</span>
           <button onClick={() => setCompareMode(false)} className="text-xs text-accent-brand">Exit compare</button>
        </div>
        <div className="flex-1 flex flex-col">
           <div className="flex gap-4 mb-4">
             <select className="flex-1 bg-bg-base border border-border-subtle rounded px-2 py-2 text-sm"><option>Dec 12, 2023</option></select>
             <select className="flex-1 bg-bg-base border border-border-subtle rounded px-2 py-2 text-sm"><option>Jan 24, 2024</option></select>
           </div>
           {/* Mock slider view */}
           <div className="relative flex-1 bg-bg-active rounded border border-border-subtle min-h-[200px] flex overflow-hidden">
             <div className="flex-1 border-r border-accent-brand flex items-center justify-center p-4">
               <Camera className="w-8 h-8 text-text-tertiary" />
             </div>
             <div className="flex-1 flex items-center justify-center p-4">
               <Camera className="w-8 h-8 text-text-tertiary" />
             </div>
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-12 bg-accent-brand rounded flex items-center justify-center cursor-ew-resize">
               <div className="w-0.5 h-6 bg-white/50"></div>
             </div>
           </div>
           <div className="mt-4 text-center text-sm font-medium">43 days, 6 photos in between</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
       <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-subtle">
         <span className="text-sm font-medium">Photo Timeline</span>
         <button onClick={() => setCompareMode(true)} className="text-xs text-text-secondary hover:text-text-primary px-2 py-2 border border-border-subtle rounded hover:bg-bg-hover">Compare</button>
       </div>
       
       <div className="flex-1 space-y-6 relative before:absolute before:left-[80px] before:top-0 before:bottom-0 before:w-px before:bg-border-subtle pb-4">
          <div className="flex gap-4 relative z-10">
            <div className="w-[64px] shrink-0 text-right pt-2 text-xs text-text-tertiary">Oct 14</div>
            <div className="w-2.5 h-2.5 rounded-full bg-accent-brand absolute left-[76.5px] top-2.5"></div>
            <div className="flex-1 ml-4 h-[180px] bg-bg-base border border-border-subtle rounded-lg flex items-center justify-center relative hover:border-border-strong transition-colors cursor-pointer group">
              <Camera className="w-6 h-6 text-text-tertiary group-hover:text-text-secondary" strokeWidth={1} />
              <div className="absolute bottom-2 right-2 bg-bg-elevated/80 backdrop-blur text-[10px] px-2 rounded text-text-secondary border border-border-subtle">Oct 14</div>
            </div>
          </div>
          <div className="flex gap-4 relative z-10">
            <div className="w-[64px] shrink-0 text-right pt-2 text-xs text-text-tertiary">Sep 28</div>
            <div className="w-2.5 h-2.5 rounded-full bg-bg-base border-2 border-border-strong absolute left-[76.5px] top-2.5"></div>
            <div className="flex-1 ml-4 h-[180px] bg-bg-base border border-border-subtle rounded-lg flex items-center justify-center relative hover:border-border-strong transition-colors cursor-pointer group">
              <Camera className="w-6 h-6 text-text-tertiary group-hover:text-text-secondary" strokeWidth={1} />
              <div className="absolute bottom-2 right-2 bg-bg-elevated/80 backdrop-blur text-[10px] px-2 rounded text-text-secondary border border-border-subtle">Sep 28</div>
            </div>
          </div>
       </div>
    </div>
  );
}

export default function Inventory() {
  const { items: inventory, add: addInventoryItem } = useEntity<InventoryItem>(
    "inventory",
    InventorySchema,
    seedInventory
  );
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Stock");
  
  const { data, isLoading, isError, isEmpty } = useDataState(inventory);
  
  const filteredData = useMemo(() => {
    if (!lowStockFilter) return data;
    return data.filter(item => (item.stock.juv + item.stock.mat + item.stock.flower) < 10);
  }, [data, lowStockFilter]);

  const selectedItem = useMemo(() => inventory.find(i => i.id === selectedId), [inventory, selectedId]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { addToast } = useApp();

  const addForm = useForm<InventoryAddForm>(
    { ...INVENTORY_ADD_INITIAL },
    {
      name: (v) => (typeof v === "string" && !v.trim() ? "Required" : undefined),
      genus: (v) => (typeof v === "string" && !v.trim() ? "Required" : undefined),
    }
  );

  const { reset: resetAddForm } = addForm;
  useEffect(() => {
    if (isAddModalOpen) {
      resetAddForm({ ...INVENTORY_ADD_INITIAL });
    }
  }, [isAddModalOpen, resetAddForm]);

  const handleAddPlant = (newPlant: InventoryAddForm) => {
    addInventoryItem({
      name: newPlant.name,
      common: newPlant.common || "Unknown",
      genus: newPlant.genus || "Unknown",
      stock: { juv: newPlant.juv, mat: newPlant.mat, flower: newPlant.flower },
      lastUpdated: "Just now",
    });
    setIsAddModalOpen(false);
    addForm.reset({ ...INVENTORY_ADD_INITIAL });
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
                {["Stock", "Timeline"].map(tab => (
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
                  {/* Active Stock */}
                  <section>
                    <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Live Stock</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-4 rounded-lg bg-bg-active border border-border-subtle text-center">
                        <div className="text-2xl font-medium mb-2"><StatusDot status={selectedItem.stock.juv < 5 ? "warn" : "ok"} className="mr-2"/>{selectedItem.stock.juv}</div>
                        <div className="text-xs text-text-secondary">JUVENILE</div>
                      </div>
                      <div className="p-4 rounded-lg bg-bg-active border border-border-subtle text-center">
                        <div className="text-2xl font-medium mb-2"><StatusDot status={selectedItem.stock.mat < 2 ? "warn" : "ok"} className="mr-2"/>{selectedItem.stock.mat}</div>
                        <div className="text-xs text-text-secondary">MATURE</div>
                      </div>
                      <div className="p-4 rounded-lg bg-bg-active border border-border-subtle text-center">
                        <div className="text-2xl font-medium mb-2"><StatusDot status={selectedItem.stock.flower === 0 ? "info" : "ok"} className="mr-2"/>{selectedItem.stock.flower}</div>
                        <div className="text-xs text-text-secondary">FLOWERING</div>
                      </div>
                    </div>
                  </section>

                  {/* Related */}
                  <section>
                    <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Related</h3>
                    <div className="space-y-2">
                      <Link to="/cultivars" className="flex justify-between items-center p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-border-subtle hover:bg-bg-hover transition-colors">
                        <span className="text-sm font-medium">Cultivar Profile</span>
                        <span className="text-xs text-text-secondary">View &rarr;</span>
                      </Link>
                      <Link to="/propagation" className="flex justify-between items-center p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-border-subtle hover:bg-bg-hover transition-colors">
                        <span className="text-sm font-medium">Active Propagation</span>
                        <Badge variant="brand">2 batches</Badge>
                      </Link>
                      <div className="flex justify-between items-center p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-border-subtle hover:bg-bg-hover transition-colors">
                        <span className="text-sm font-medium border-b border-transparent">Mortality Log</span>
                        <span className="text-xs text-status-alert flex items-center gap-2"><AlertTriangle className="w-3 h-3"/> 2 events</span>
                      </div>
                    </div>
                  </section>

                  <section className="pt-4 mt-8 border-t border-border-subtle">
                    <div className="flex items-center justify-between cursor-pointer group">
                      <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">View audit history (12 entries)</span>
                      <span className="text-[10px] uppercase font-medium bg-bg-active text-text-tertiary px-2 py-2 rounded">Log</span>
                    </div>
                  </section>
                </>
              )}

              {activeTab === "Timeline" && (
                <TimelineTab />
              )}
            </div>
            
            <div className="p-4 md:p-6 border-t border-border-subtle bg-bg-base/50 flex gap-2 pb-safe">
              <Button variant="outline" className="flex-1" onClick={() => addToast("Stock edit mode enabled.", "info")}>Update Stock</Button>
            </div>
          </>
        )}
      </div>

      <AddItemModal<InventoryAddForm>
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add to Inventory"
        submitLabel="Save Plant"
        fields={INVENTORY_ADD_FIELDS}
        initialValues={{ ...INVENTORY_ADD_INITIAL }}
        values={addForm.values}
        setField={addForm.setField}
        errors={addForm.errors}
        validate={addForm.validate}
        onSubmit={handleAddPlant}
      />
    </div>
  );
}
