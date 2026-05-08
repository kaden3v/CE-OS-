import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/StatusDot";
import { Plus, MoreHorizontal, Clock, AlertCircle, X, ChevronRight, FileText, FlaskConical, ScrollText } from "lucide-react";
import React, { useState } from "react";
import { useDataState } from "@/hooks/useDataState";
import { ErrorState, EmptyState } from "@/components/ui/StateRenderer";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { CultivarName } from "@/components/ui/CultivarName";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/Input";

const COLUMNS = [
  { id: "mother", title: "Mother Plants", count: 4 },
  { id: "division", title: "Division & Pullings", count: 12 },
  { id: "establishment", title: "Establishment", count: 8 },
  { id: "ready", title: "Ready for Sale", count: 24 },
];

const BATCHES = [
  { id: "B-101", cultivar: "P. 'Pirouette'", targetId: 1, count: 42, stage: "establishment", started: "3 weeks ago", estReady: "Next week", notes: "" },
  { id: "B-102", cultivar: "P. gigantea", targetId: 5, count: 18, stage: "division", started: "5 days ago", estReady: "In 4 weeks", notes: "Slight browning on edges" },
  { id: "B-103", cultivar: "P. esseriana", targetId: 2, count: 65, stage: "ready", started: "2 months ago", estReady: "Now", notes: "Excellent coloration" },
  { id: "B-104", cultivar: "P. agnata", targetId: 3, count: 5, stage: "mother", started: "1 year ago", estReady: "N/A", notes: "Ready for division" },
  { id: "B-105", cultivar: "P. 'Tina'", targetId: 7, count: 30, stage: "division", started: "1 week ago", estReady: "In 3 weeks", notes: "" },
];

const PROTOCOLS = [
  { id: 1, type: "Media Recipe", title: "1/2 MS Modification", content: "Modified Murashige and Skoog medium containing 50% macronutrients.", ingredients: ["1/2 MS salts", "30g/L Sucrose", "7g/L Agar", "pH 5.7"], lastUpdated: "March 2024" },
  { id: 2, type: "Sterilization", title: "Pinguicula Leaf Pulling Sterilization", content: "Standard protocol for surface sterilization of Pinguicula leaf cuttings before initiation.", ingredients: ["10% Bleach (0.5% NaOCl)", "0.1% Tween 20", "Sterile Water x3"], lastUpdated: "April 2024" },
  { id: 3, type: "Multiplication", title: "High-BA Multiplication Phase", content: "Used for rapid multiplication of recalcitrant species.", ingredients: ["1/2 MS Base", "1.0 mg/L BA", "0.1 mg/L NAA", "pH 5.7"], lastUpdated: "January 2024" }
];

export default function Propagation() {
  const [batchesData, setBatchesData] = useState(BATCHES);
  const { data: batches, isLoading, isError, isEmpty } = useDataState(batchesData);
  const { data: protocols, isLoading: protocolsLoading, isError: protocolsError, isEmpty: protocolsEmpty } = useDataState(PROTOCOLS);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [view, setView] = useState<"Board" | "Protocols">("Board");
  const { addToast } = useApp();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newBatch, setNewBatch] = useState({ cultivar: "", count: 0, stage: "division" });

  const handleAddBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const idNum = Math.max(...batchesData.map(b => parseInt(b.id.split('-')[1]))) + 1 || 106;
    const batch = {
       id: `B-${idNum}`,
       cultivar: newBatch.cultivar || "Unknown",
       targetId: 1,
       count: newBatch.count || 1,
       stage: newBatch.stage,
       started: "Today",
       estReady: "Pending",
       notes: ""
    };
    setBatchesData([batch, ...batchesData]);
    setIsAddModalOpen(false);
    setNewBatch({ cultivar: "", count: 0, stage: "division" });
    addToast("Propagation batch added", "success");
  };

  const selectedBatch = batchesData.find((b) => b.id === selectedBatchId);

  return (
    <div className="flex flex-col h-full relative">
      <div className={cn("flex-1 px-4 md:px-8 py-6 flex flex-col transition-all", selectedBatch && view === "Board" ? "md:pr-[480px] duration-200 ease-out" : "duration-150 ease-in")}>
        <div className="mb-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-semibold">Propagation</h1>
            <div className="hidden md:flex bg-bg-active border border-border-subtle p-2 rounded-lg">
               <button 
                 onClick={() => setView("Board")}
                 className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", view === "Board" ? "bg-bg-elevated shadow-sm text-text-primary" : "text-text-secondary hover:text-text-primary")}
               >
                 Board
               </button>
               <button 
                 onClick={() => setView("Protocols")}
                 className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", view === "Protocols" ? "bg-bg-elevated shadow-sm text-text-primary" : "text-text-secondary hover:text-text-primary")}
               >
                 TC Protocols
               </button>
            </div>
          </div>
          {view === "Board" ? (
            <Button variant="brand" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden md:inline">Add Batch</span>
              <span className="md:hidden">Add</span>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              <ScrollText className="w-4 h-4 mr-2" />
              Upload SOP
            </Button>
          )}
        </div>

        {view === "Board" && (
          <>
            <div className="mb-6 shrink-0">
              <div className="bg-bg-active border border-border-subtle rounded-lg p-2 flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 text-text-secondary shrink-0" />
                <span className="text-text-secondary truncate">Tissue culture stages not enabled in current Kanban view. Enable in Settings.</span>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
              {isLoading ? (
                <div className="flex h-full gap-6 min-w-full md:min-w-[1000px]  w-full p-2">
                  {COLUMNS.map((col) => (
                    <div key={col.id} className="flex-1 flex flex-col w-[85vw] md:w-[280px] shrink-0 SNAP_TARGET">
                      <div className="flex items-center justify-between mb-4 px-2 opacity-50">
                        <h3 className="font-medium text-sm text-text-secondary uppercase tracking-wider">{col.title}</h3>
                        <div className="w-6 h-6 rounded bg-bg-active animate-pulse" />
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-3 bg-bg-base/50 rounded-xl p-2 border border-border-subtle/30">
                        <Card className="h-40 animate-pulse bg-bg-elevated" />
                        <Card className="h-40 animate-pulse bg-bg-elevated" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : isError ? (
                <div className="h-full items-center justify-center flex"><ErrorState title="Couldn't load batches" /></div>
              ) : isEmpty ? (
                <div className="h-full items-center justify-center flex"><EmptyState title="No propagation" /></div>
              ) : (
                <div className="flex h-full gap-6 min-w-max pr-6 pb-24 md:pb-0">
                  {COLUMNS.map((col) => (
                    <div key={col.id} className="flex-1 flex flex-col w-[85vw] md:w-[280px] shrink-0 snap-center md:snap-none">
                      <div className="flex items-center justify-between mb-4 px-2">
                        <h3 className="font-medium text-sm text-text-secondary uppercase tracking-wider">{col.title}</h3>
                        <Badge>{batches.filter(b => b.stage === col.id).length}</Badge>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto space-y-3 bg-bg-base/50 rounded-xl p-2 border border-border-subtle/30">
                        {batches.filter(b => b.stage === col.id).map(batch => (
                          <Card 
                            key={batch.id} 
                            className={cn(
                              "p-4 cursor-pointer hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brand focus-visible:border-transparent transition-colors",
                              selectedBatchId === batch.id ? "border-accent-brand" : ""
                            )}
                            onClick={() => setSelectedBatchId(batch.id)}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedBatchId(batch.id);
                              }
                            }}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="text-xs text-text-secondary bg-bg-active px-2 py-2 rounded font-mono">{batch.id}</div>
                              <button className="text-text-secondary hover:text-text-primary">
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="font-medium  mb-2 text-text-primary leading-tight"><CultivarName name={batch.cultivar} /></div>
                            
                            <div className="flex items-center justify-between text-sm mb-4">
                              <span className="text-text-secondary">Yield Est.</span>
                              <span className="font-medium tabular-nums">{batch.count} Plugs</span>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-border-subtle text-xs">
                              <div className="flex items-center gap-2 text-text-secondary">
                                <Clock className="w-3.5 h-3.5 text-text-tertiary" />
                                Started {batch.started}
                              </div>
                              <div className="flex items-center gap-2 text-text-secondary">
                                <MoreHorizontal className="w-3.5 h-3.5 text-text-tertiary opacity-0" />
                                Ready {batch.estReady}
                              </div>
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
          </>
        )}

        {view === "Protocols" && (
          <div className="flex-1 overflow-auto pb-24 md:pb-0">
            {protocolsLoading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({length: 3}).map((_, i) => (
                  <Card key={i} className="p-6 h-[250px] animate-pulse bg-bg-elevated/50" />
                ))}
              </div>
            )}
            {protocolsError && <ErrorState />}
            {!protocolsLoading && !protocolsError && protocolsEmpty && (
              <EmptyState icon={FlaskConical} title="No protocols" description="Track your tissue culture standard operating procedures here." />
            )}
            {!protocolsLoading && !protocolsError && !protocolsEmpty && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {protocols.map(protocol => (
                  <Card key={protocol.id} className="p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs text-text-secondary uppercase tracking-wider font-medium">{protocol.type}</span>
                        <FlaskConical className="w-4 h-4 text-text-tertiary" />
                      </div>
                      <h3 className="text-lg font-medium mb-2">{protocol.title}</h3>
                      <p className="text-sm text-text-secondary mb-6">{protocol.content}</p>
                      
                      <div className="bg-bg-active p-4 rounded border border-border-subtle mb-6">
                        <h4 className="text-xs text-text-secondary uppercase tracking-wider mb-2">Key Ingredients / Steps</h4>
                        <ul className="list-disc pl-4 text-sm text-text-primary space-y-1">
                            {protocol.ingredients.map(ing => <li key={ing}>{ing}</li>)}
                        </ul>
                      </div>
                    </div>
                    
                    <div className="mt-auto text-xs text-text-tertiary flex items-center justify-between pt-4 border-t border-border-subtle">
                        <span>Last updated</span>
                        <span>{protocol.lastUpdated}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slide-in Detail Panel */}
      <div 
        className={cn(
          "fixed inset-0 md:inset-auto md:top-[56px] md:right-0 md:bottom-0 md:w-[480px] bg-bg-base md:bg-[rgba(255,255,255,0.04)] backdrop-blur-md md:border-l border-border-subtle shadow-2xl transition-transform z-50 md:z-20 flex flex-col", (selectedBatch && view === "Board") ? "translate-x-0 duration-200 ease-out" : "translate-x-full duration-150 ease-in"
        )}
      >
        {selectedBatch && view === "Board" && (
          <>
            <div className="p-4 md:p-6 border-b border-border-subtle flex items-center justify-between bg-bg-elevated md:bg-transparent">
              <div>
                <h2 className="text-xl font-semibold mb-2">Batch {selectedBatch.id}</h2>
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                   <div className="w-2 h-2 rounded-full bg-status-info"></div>
                   <span>{COLUMNS.find(c => c.id === selectedBatch.stage)?.title}</span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedBatchId(null)}
                className="p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
              {/* Cultivar Link */}
              <section>
                <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Associations</h3>
                <div className="space-y-2">
                   <Link to={`/cultivars`} className="flex items-center justify-between p-2 rounded-lg border border-border-subtle bg-bg-active hover:bg-bg-hover transition-colors">
                     <div>
                        <div className="text-xs text-text-secondary mb-2">Cultivar</div>
                        <div className="font-medium "><CultivarName name={selectedBatch.cultivar} /></div>
                     </div>
                     <ChevronRight className="w-4 h-4 text-text-tertiary" />
                   </Link>
                   <Link to={`/inventory`} className="flex items-center justify-between p-2 rounded-lg border border-border-subtle bg-bg-active hover:bg-bg-hover transition-colors">
                     <div>
                        <div className="text-xs text-text-secondary mb-2">Source Material</div>
                        <div className="font-medium">Inventory #{selectedBatch.targetId}</div>
                     </div>
                     <ChevronRight className="w-4 h-4 text-text-tertiary" />
                   </Link>
                </div>
              </section>

              {/* Progress */}
              <section>
                 <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Timeline Tracker</h3>
                 <div className="relative pl-6 space-y-6">
                    <div className="absolute left-2.5 top-2 bottom-2 w-px bg-border-subtle"></div>
                    
                    <div className="relative">
                      <div className="absolute -left-[27px] w-3 h-3 rounded-full bg-status-info ring-4 ring-bg-base/20 mt-2"></div>
                      <div className="font-medium">{COLUMNS.find(c => c.id === selectedBatch.stage)?.title}</div>
                      <div className="text-sm text-text-secondary">Current Stage</div>
                    </div>
                    
                    <div className="relative">
                      <div className="absolute -left-[27px] w-3 h-3 rounded-full bg-border-strong ring-4 ring-bg-base/20 mt-2"></div>
                      <div className="font-medium opacity-50">Started</div>
                      <div className="text-sm text-text-secondary">{selectedBatch.started}</div>
                    </div>
                 </div>
              </section>
            </div>
            
            <div className="p-4 md:p-6 border-t border-border-subtle bg-bg-base/50 flex gap-2 pb-safe">
              <Button variant="outline" className="flex-1" onClick={() => {
                 setBatchesData(prev => prev.filter(b => b.id !== selectedBatch.id));
                 setSelectedBatchId(null);
                 addToast("Batch discarded from propagation.", "info");
              }}>Discard Batch</Button>
              <Button className="flex-1" onClick={() => addToast("Promoted to next stage.", "success")}>Promote</Button>
            </div>
          </>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl flex flex-col">
             <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
              <h2 className="text-lg font-semibold">Add Propagation Batch</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <form id="add-batch-form" onSubmit={handleAddBatch} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cultivar</label>
                  <Input required placeholder="P. agnata" value={newBatch.cultivar} onChange={(e) => setNewBatch({...newBatch, cultivar: e.target.value})} className="w-full" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Stage</label>
                  <select
                     value={newBatch.stage}
                     onChange={(e) => setNewBatch({...newBatch, stage: e.target.value})}
                     className="w-full bg-bg-base border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-brand focus:border-transparent"
                  >
                     <option value="mother">Mother Plants</option>
                     <option value="division">Division & Pullings</option>
                     <option value="establishment">Establishment</option>
                     <option value="ready">Ready for Sale</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Count / Quantity</label>
                  <Input type="number" required min="1" value={newBatch.count} onChange={(e) => setNewBatch({...newBatch, count: parseInt(e.target.value) || 0})} className="w-full" />
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-border-subtle bg-bg-base/50 flex justify-end gap-2 shrink-0">
               <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
               <Button variant="brand" type="submit" form="add-batch-form">Create Batch</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
