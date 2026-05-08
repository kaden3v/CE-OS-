import React, { useState, useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Plus, X, Search, Heart, Edit, MoreVertical, ExternalLink, ChevronDown } from "lucide-react";
import { Link } from "react-router";
import { useDataState } from "@/hooks/useDataState";
import { LoadingTable, ErrorState, EmptyState } from "@/components/ui/StateRenderer";
import { cn } from "@/lib/utils";
import { CultivarName } from "@/components/ui/CultivarName";
import { StatusDot } from "@/components/ui/StatusDot";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/Input";

const CULTIVARS = [
  { id: 1, name: "Pinguicula 'Pirouette'", common: "Pirouette", genus: "Pinguicula", origin: "Hybrid", acquired: "2023-04-12", active: true, notes: "Fast growing, vigorous.", listed: true },
  { id: 2, name: "P. agnata 'El Lobo'", common: "El Lobo", genus: "Pinguicula", origin: "Mexico", acquired: "2024-01-05", active: true, notes: "Needs dry winter rest.", listed: false },
  { id: 3, name: "Pinguicula 'Johanna'", common: "P. agnata × P. debbertiana", genus: "Pinguicula", origin: "Hybrid", acquired: "2023-11-20", active: true, notes: "", listed: true },
  { id: 4, name: "Pinguicula gigantea", common: "Giant Butterwort", genus: "Pinguicula", origin: "Mexico", acquired: "2022-09-14", active: true, notes: "Sticky on both sides of leaves.", listed: false },
  { id: 5, name: "Pinguicula moranensis", common: "Mexican Butterwort", genus: "Pinguicula", origin: "Mexico", acquired: "2022-05-10", active: true, notes: "", listed: true },
  { id: 6, name: "Pinguicula agnata", common: "Agnata", genus: "Pinguicula", origin: "Mexico", acquired: "2023-02-18", active: true, notes: "", listed: false },
  { id: 7, name: "Pinguicula debbertiana", common: "Debbertiana", genus: "Pinguicula", origin: "Mexico", acquired: "2024-03-01", active: true, notes: "", listed: false },
  { id: 8, name: "Pinguicula 'Tina'", common: "Tina", genus: "Pinguicula", origin: "Hybrid (Zecheri x Agnata)", acquired: "2023-08-30", active: true, notes: "", listed: true },
  { id: 9, name: "Pinguicula 'Sethos'", common: "Sethos", genus: "Pinguicula", origin: "Hybrid (Ehlersiae x Moranensis)", acquired: "2023-07-15", active: true, notes: "", listed: false },
  { id: 10, name: "Pinguicula esseriana", common: "Esseriana", genus: "Pinguicula", origin: "Mexico", acquired: "2023-10-05", active: true, notes: "", listed: false },
  { id: 11, name: "Drosera capensis 'Red'", common: "Red Cape Sundew", genus: "Drosera", origin: "South Africa", acquired: "2022-06-20", active: true, notes: "Weed.", listed: false },
];

const VIEWS = ["All cultivars", "Active", "Mother stock", "Hybrids only"];

function LineageTree({ cultivar }: { cultivar: any }) {
  if (cultivar.id !== 3) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border border-dashed border-border-subtle rounded-xl text-center">
        <div className="w-[140px] h-[64px] bg-bg-active border border-border-strong rounded-xl flex flex-col items-center justify-center">
          <CultivarName name={cultivar.name} className="font-medium  text-sm" />
          <div className="text-[10px] text-text-tertiary">Origin: {cultivar.origin}</div>
        </div>
      </div>
    );
  }

  // Johanna specific mock
  return (
    <div className="flex flex-col items-center pt-4">
      {/* Parents */}
      <div className="flex items-center gap-16 relative">
        <div className="w-[140px] h-[64px] bg-bg-active border border-border-strong rounded-xl flex flex-col items-center justify-center z-10 hover:bg-bg-hover cursor-pointer transition-colors">
          <div className="font-medium  text-sm"><CultivarName name="P. agnata" /></div>
          <div className="text-[10px] text-text-tertiary">2023</div>
        </div>
        <div className="w-[140px] h-[64px] bg-bg-active border border-border-strong rounded-xl flex flex-col items-center justify-center z-10 hover:bg-bg-hover cursor-pointer transition-colors">
          <div className="font-medium  text-sm"><CultivarName name="P. debbertiana" /></div>
          <div className="text-[10px] text-text-tertiary">2024</div>
        </div>
        {/* Connecting lines */}
        <div className="absolute top-[32px] left-[70px] right-[70px] h-px bg-border-strong z-0"></div>
        <div className="absolute top-[32px] left-[170px] w-px h-[32px] bg-border-strong z-0"></div>
      </div>
      
      {/* Target */}
      <div className="relative mt-8">
         <div className="w-[140px] h-[64px] bg-bg-active border-2 border-accent-brand border-l-4 rounded-xl flex flex-col items-center justify-center z-10">
           <CultivarName name={cultivar.name} className="font-medium  text-sm" />
           <div className="text-[10px] text-text-tertiary">2023</div>
         </div>
      </div>
    </div>
  );
}

function GrowthGallery() {
  const images = [
    { id: 1, age: "2 weeks", label: "Juvenile" },
    { id: 2, age: "2 months", label: "Mature" },
    { id: 3, age: "6 months", label: "In-flower" },
  ];
  return (
    <div>
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
        <Badge variant="brand">All stages</Badge>
        <Badge variant="outline">Juvenile</Badge>
        <Badge variant="outline">Mature</Badge>
        <Badge variant="outline">In-flower</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {images.map(img => (
          <div key={img.id} className="relative aspect-square bg-bg-active rounded-lg border border-border-subtle flex flex-col items-center justify-center overflow-hidden">
             <Heart className="w-4 h-4 text-text-tertiary mb-2" />
             <div className="absolute bottom-1 right-1 bg-bg-elevated/80 backdrop-blur text-[10px] px-2 rounded text-text-secondary border border-border-subtle">{img.age}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Cultivars() {
  const [cultivarsData, setCultivarsData] = useState(CULTIVARS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [currentView, setCurrentView] = useState(VIEWS[0]);
  const { data, isLoading, isError, isEmpty } = useDataState(cultivarsData);
  const { addToast } = useApp();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCultivar, setNewCultivar] = useState({ name: "", common: "", genus: "Pinguicula", origin: "" });

  const handleAddCultivar = (e: React.FormEvent) => {
    e.preventDefault();
    const cultivar = {
      id: Math.max(...cultivarsData.map(c => c.id)) + 1,
      name: newCultivar.name,
      common: newCultivar.common,
      genus: newCultivar.genus,
      origin: newCultivar.origin,
      acquired: new Date().toISOString().split('T')[0],
      active: true,
      notes: "",
      listed: false
    };
    setCultivarsData([cultivar, ...cultivarsData]);
    setIsAddModalOpen(false);
    setNewCultivar({ name: "", common: "", genus: "Pinguicula", origin: "" });
    addToast("Cultivar added successfully", "success");
  };

  const selectedCultivar = useMemo(() => cultivarsData.find(c => c.id === selectedId), [cultivarsData, selectedId]);

  const columns = useMemo(() => [
    {
      accessorKey: "name",
      header: "Name",
      cell: (info: any) => <CultivarName name={info.getValue()} className="font-medium  text-text-primary" />,
    },
    {
      accessorKey: "common",
      header: "Common Name",
    },
    {
      accessorKey: "genus",
      header: "Genus",
      cell: (info: any) => <Badge>{info.getValue()}</Badge>,
    },
    {
      accessorKey: "origin",
      header: "Origin",
      cell: (info: any) => <span className="text-text-secondary">{info.getValue()}</span>,
    },
    {
      accessorKey: "acquired",
      header: "First Acquired",
      cell: (info: any) => <span className="text-text-secondary tabular-nums">{info.getValue()}</span>,
    },
    {
      accessorKey: "active",
      header: "Active",
      cell: (info: any) => (
        <Badge variant={info.getValue() ? "brand" : "default"}>
          {info.getValue() ? "Yes" : "No"}
        </Badge>
      ),
    },
  ], []);

  return (
    <div className="flex h-full relative">
      <div className={cn("flex-1 p-4 md:p-8 flex flex-col h-full transition-all", selectedCultivar ? "md:pr-[480px] duration-200 ease-out" : "duration-150 ease-in")}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold mb-2">Cultivars Registry</h1>
            <p className="text-sm text-text-secondary">Manage master records for all cultivated species and hybrids.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/cultivars/breeding"><Button variant="outline">Breeding Tracker</Button></Link>
            <Link to="/cultivars/profit"><Button variant="outline">Profit Analysis</Button></Link>
            <Button variant="brand" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Cultivar
            </Button>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
           <div className="relative group">
              <select 
                className="appearance-none bg-bg-base border border-border-subtle rounded-md pl-2 pr-8 py-2 text-sm font-medium hover:border-border-strong focus:outline-none transition-colors"
                value={currentView}
                onChange={(e) => setCurrentView(e.target.value)}
              >
                {VIEWS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
           </div>
           <Button variant="ghost" size="sm" className="text-text-tertiary" onClick={() => addToast("View preset saved.", "success")}>Save as view</Button>
        </div>

        <Card className="flex-1 overflow-auto flex flex-col">
          {isLoading ? (
             <LoadingTable cols={6} rows={15} />
          ) : isError ? (
             <ErrorState />
          ) : isEmpty ? (
             <EmptyState title="No cultivars yet" description="Add the first one to begin tracking parentage and care." action={<Button variant="brand" onClick={() => setIsAddModalOpen(true)}>Add Cultivar</Button>} />
          ) : (
            <DataTable columns={columns} data={data} onRowClick={(row) => setSelectedId(row.id)} />
          )}
        </Card>
      </div>

      {/* Slide-in Detail Panel */}
      <div 
        className={cn(
          "fixed inset-0 md:inset-auto md:top-[56px] md:right-0 md:bottom-0 w-full md:w-[480px] bg-bg-base md:bg-[rgba(255,255,255,0.04)] backdrop-blur-md md:border-l border-border-subtle shadow-2xl transition-transform z-50 md:z-20 flex flex-col", selectedCultivar ? "translate-x-0 duration-200 ease-out" : "translate-x-full duration-150 ease-in"
        )}
      >
        {selectedCultivar && (
          <>
            <div className="p-4 md:p-6 pb-0 border-b border-border-subtle flex flex-col bg-bg-elevated md:bg-transparent">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CultivarName className="text-xl font-semibold text-xl font-semibold " name={selectedCultivar.name} />
                    {selectedCultivar.listed && (
                       <Badge variant="outline" className="flex items-center gap-2 bg-bg-base">
                          <StatusDot status="info" /> Cross-listed
                       </Badge>
                    )}
                  </div>
                  <div className="text-sm text-text-secondary">{selectedCultivar.common}</div>
                </div>
                <div className="flex items-center gap-2">
                   <button className="p-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors">
                     <Edit className="w-5 h-5" />
                   </button>
                   <button 
                     onClick={() => { setSelectedId(null); setActiveTab("Overview"); }}
                     className="p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors"
                   >
                     <X className="w-5 h-5" />
                   </button>
                </div>
              </div>
              
              <div className="flex gap-6 border-b border-transparent">
                {["Overview", "Lineage", "Growth gallery"].map(tab => (
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

            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              {activeTab === "Overview" && (
                <div className="space-y-8">
                  {/* Image Header Placeholder */}
                  <div className="w-full h-[200px] rounded-xl bg-bg-active border border-border-subtle bg-gradient-to-br from-bg-active to-bg-hover flex items-center justify-center relative overflow-hidden">
                     <Heart className="w-6 h-6 text-text-tertiary absolute top-4 right-4" />
                     <span className="text-text-tertiary font-medium">No Image Uploaded</span>
                  </div>

                  {/* Specs */}
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <div className="text-xs text-text-secondary uppercase tracking-wider mb-2">Genus</div>
                        <div className="font-medium">{selectedCultivar.genus}</div>
                     </div>
                     <div>
                        <div className="text-xs text-text-secondary uppercase tracking-wider mb-2">Origin</div>
                        <div className="font-medium">{selectedCultivar.origin}</div>
                     </div>
                     <div>
                        <div className="text-xs text-text-secondary uppercase tracking-wider mb-2">Acquired</div>
                        <div className="font-medium">{selectedCultivar.acquired}</div>
                     </div>
                  </div>

                  {/* Notes */}
                  <section>
                     <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Notes</h3>
                     {selectedCultivar.notes ? (
                        <p className="text-sm text-text-primary">{selectedCultivar.notes}</p>
                     ) : (
                        <p className="text-sm text-text-tertiary italic">No notes added.</p>
                     )}
                  </section>

                   {/* Associated Links */}
                   <section>
                     <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Associations</h3>
                     <div className="space-y-2">
                        {selectedCultivar.listed && (
                          <div className="flex items-center gap-2 mb-2 p-2 rounded-lg border border-border-subtle bg-bg-active">
                             <div className="flex-1">
                               <div className="text-sm font-medium">Shopify Listing</div>
                               <div className="text-xs text-status-info flex items-center gap-2"><StatusDot status="info" /> Active</div>
                             </div>
                             <ExternalLink className="w-4 h-4 text-text-secondary" />
                          </div>
                        )}
                        <Link to="/inventory" className="flex items-center justify-between p-2 rounded-lg border border-border-subtle bg-bg-active hover:bg-bg-hover transition-colors">
                           <span className="text-sm font-medium">View in Inventory</span>
                           <ExternalLink className="w-4 h-4 text-text-secondary" />
                        </Link>
                        <Link to="/propagation" className="flex items-center justify-between p-2 rounded-lg border border-border-subtle bg-bg-active hover:bg-bg-hover transition-colors">
                           <span className="text-sm font-medium">Propagation Batches</span>
                           <ExternalLink className="w-4 h-4 text-text-secondary" />
                        </Link>
                     </div>
                   </section>
                </div>
              )}

              {activeTab === "Lineage" && (
                <div className="h-full flex flex-col">
                  <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-6">Genealogy Tree</h3>
                  <LineageTree cultivar={selectedCultivar} />
                </div>
              )}

              {activeTab === "Growth gallery" && (
                <div className="h-full flex flex-col">
                  <GrowthGallery />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl flex flex-col">
             <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
              <h2 className="text-lg font-semibold">Add Cultivar</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <form id="add-cultivar-form" onSubmit={handleAddCultivar} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cultivar Name</label>
                  <Input required placeholder="P. agnata 'Red'" value={newCultivar.name} onChange={(e) => setNewCultivar({...newCultivar, name: e.target.value})} className="w-full" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Common Name</label>
                  <Input placeholder="Red Mexican Butterwort" value={newCultivar.common} onChange={(e) => setNewCultivar({...newCultivar, common: e.target.value})} className="w-full" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Genus</label>
                  <Input required placeholder="Pinguicula" value={newCultivar.genus} onChange={(e) => setNewCultivar({...newCultivar, genus: e.target.value})} className="w-full" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Origin / Genetics</label>
                  <Input placeholder="Hybrid" value={newCultivar.origin} onChange={(e) => setNewCultivar({...newCultivar, origin: e.target.value})} className="w-full" />
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-border-subtle bg-bg-base/50 flex justify-end gap-2 shrink-0">
               <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
               <Button variant="brand" type="submit" form="add-cultivar-form">Save Cultivar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
