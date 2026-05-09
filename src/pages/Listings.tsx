import React, { useState, useMemo, useCallback } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/StatusDot";
import { Copy, Plus, RefreshCw, X, Store, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { CultivarName } from "@/components/ui/CultivarName";
import { useDataState } from "@/hooks/useDataState";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/Input";
import { seedListings } from "@/lib/mockData";
import { LoadingTable, ErrorState, EmptyState, StateRenderer, resolveDataViewState } from "@/components/ui/StateRenderer";

type ListingRow = (typeof seedListings)[number];

export default function Listings() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [channelTab, setChannelTab] = useState<"shopify" | "etsy">("shopify");
  const [listingsData, setListingsData] = useState<ListingRow[]>(() => [...seedListings]);
  const { data, isLoading, isError, isEmpty } = useDataState<ListingRow>(listingsData);
  const { addToast } = useApp();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newListing, setNewListing] = useState({ cultivar: "", sku: "", price: 0 });

  const handleAddListing = (e: React.FormEvent) => {
    e.preventDefault();
    const idNum = Math.max(...listingsData.map(l => parseInt(l.id.substring(4)))) + 1 || 5;
    const listing = {
       id: `LST-${idNum.toString().padStart(3, '0')}`,
       cultivar: newListing.cultivar || "Unknown",
       sku: newListing.sku || "UNKNOWN-001",
       price: newListing.price || 0,
       shopify: "draft",
       etsy: "draft",
       stock: 0
    };
    setListingsData([listing, ...listingsData]);
    setIsAddModalOpen(false);
    setNewListing({ cultivar: "", sku: "", price: 0 });
    addToast("New draft listing created", "success");
  };

  const selectedListing = useMemo(() => data.find((l) => l.id === selectedId), [data, selectedId]);

  const renderStatusBadge = useCallback((status: string) => {
    switch (status) {
      case "active": return <div className="flex items-center gap-2"><StatusDot status="ok" /> Active</div>;
      case "syncing": return <div className="flex items-center gap-2"><StatusDot status="info" className="animate-pulse" /> Syncing</div>;
      case "sold_out": return <div className="flex items-center gap-2"><StatusDot status="warn" /> Sold Out</div>;
      case "draft": return <div className="flex items-center gap-2"><StatusDot status="alert" /> Draft</div>;
      default: return null;
    }
  }, []);

  const columns = useMemo((): DataTableColumn<ListingRow>[] => [
    { key: "cultivar", header: "Cultivar", render: (row) => <CultivarName name={row.cultivar} className="font-medium " /> },
    { key: "sku", header: "SKU", render: (row) => <span className="font-mono text-xs text-text-secondary">{row.sku}</span> },
    { key: "price", header: "Price", render: (row) => `$${row.price.toFixed(2)}` },
    { key: "stock", header: "Inventory" },
    { key: "shopify", header: "Shopify", render: (row) => renderStatusBadge(row.shopify) },
    { key: "etsy", header: "Etsy", render: (row) => renderStatusBadge(row.etsy) },
  ], [renderStatusBadge]);

  return (
    <div className="flex h-full relative p-4 md:p-8">
      <div className={cn("flex-1 flex flex-col h-full transition-all", selectedListing ? "md:pr-[480px] duration-200 ease-out" : "duration-150 ease-in")}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold mb-2">Listings</h1>
            <p className="text-sm text-text-secondary">Unified inventory availability across Shopify and Etsy.</p>
          </div>
          <div className="flex items-center gap-2">
             <Button variant="outline" onClick={() => addToast("Forcing sync across all channels...", "info")}><RefreshCw className="w-4 h-4 mr-2" /> Force Sync</Button>
             <Button variant="brand" onClick={() => setIsAddModalOpen(true)}>
               <Plus className="w-4 h-4 mr-2" />
               New Listing
             </Button>
          </div>
        </div>

        <Card className="flex-1 overflow-auto flex flex-col">
          <StateRenderer
            state={resolveDataViewState(isLoading, isError, isEmpty)}
            data={data}
            loadingFallback={<LoadingTable cols={6} rows={10} />}
            errorFallback={<ErrorState />}
            emptyFallback={<EmptyState title="No listings" description="Create a listing to sync inventory to channels." />}
          >
            {(rows) => (
              <DataTable columns={columns} data={rows} onRowClick={(row) => setSelectedId(row.id)} />
            )}
          </StateRenderer>
        </Card>
      </div>

      {/* Slide-in Detail Panel */}
      <div 
        className={cn(
          "fixed inset-0 md:inset-auto md:top-[56px] md:right-0 md:bottom-0 w-full md:w-[480px] bg-bg-base md:bg-[rgba(255,255,255,0.04)] backdrop-blur-md md:border-l border-border-subtle shadow-2xl transition-transform z-50 md:z-20 flex flex-col", selectedListing ? "translate-x-0 duration-200 ease-out" : "translate-x-full duration-150 ease-in"
        )}
      >
        {selectedListing && (
          <>
            <div className="p-4 md:p-6 pb-0 border-b border-border-subtle flex flex-col bg-bg-elevated md:bg-transparent shrink-0">
               <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold  mb-2"><CultivarName name={selectedListing.cultivar} /></h2>
                    <div className="text-sm text-text-secondary font-mono">{selectedListing.sku}</div>
                  </div>
                  <button 
                    onClick={() => setSelectedId(null)}
                    className="p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
               </div>

               <div className="flex gap-6 border-b border-transparent">
                  {[
                    { id: "shopify", label: "Shopify", icon: ShoppingBag, status: selectedListing.shopify }, 
                    { id: "etsy", label: "Etsy", icon: Store, status: selectedListing.etsy }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setChannelTab(tab.id as "shopify" | "etsy")}
                      className={cn(
                        "pb-2 text-sm font-medium transition-colors relative flex items-center gap-2",
                        channelTab === tab.id ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
                      )}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                      <StatusDot status={tab.status === "active" ? "ok" : tab.status === "syncing" ? "info" : tab.status === "sold_out" ? "warn" : "alert"} />
                      {channelTab === tab.id && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-text-primary"></div>
                      )}
                    </button>
                  ))}
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6">
               <div className="flex items-center justify-between mb-6">
                 <h3 className="text-sm font-medium">Channel Editor</h3>
                 <Button variant="outline" size="sm" onClick={() => addToast("Template applied to editor.", "success")}><Copy className="w-3 h-3 mr-2" /> Generate from Template</Button>
               </div>

               <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Title</label>
                    <input type="text" defaultValue={`${selectedListing.cultivar} - Live Carnivorous Plant`} className="w-full bg-bg-base border border-border-subtle rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-border-strong" />
                  </div>
                  <div className="flex gap-4">
                     <div className="flex-1">
                        <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Price</label>
                        <input type="number" defaultValue={selectedListing.price} className="w-full bg-bg-base border border-border-subtle rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-border-strong" />
                     </div>
                     <div className="flex-1">
                        <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Inventory Qty</label>
                        <input type="number" defaultValue={selectedListing.stock} disabled className="w-full bg-bg-active border border-transparent text-text-tertiary rounded-lg px-2 py-2 text-sm" />
                     </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Description / Care Guide</label>
                    <textarea rows={8} className="w-full bg-bg-base border border-border-subtle rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-border-strong resize-none" defaultValue={`Shipped bare root. 

Care requirements:
- Light: Bright, indirect light
- Water: Keep constantly moist with distilled water
- Soil: 50/50 peat moss and perlite
- Dormancy: None required for tropicals`} />
                  </div>
               </div>
            </div>

            <div className="p-4 md:p-6 border-t border-border-subtle bg-bg-base/50 flex gap-2 pb-safe shrink-0">
               <Button className="flex-1" onClick={() => {
                   addToast(`Pushing updates to ${channelTab === "shopify" ? "Shopify" : "Etsy"}...`, "info");
                   setTimeout(() => {
                      setListingsData(prev => prev.map(l => l.id === selectedListing.id ? { ...l, [channelTab]: "active" } : l));
                      addToast(`Changes published to ${channelTab === "shopify" ? "Shopify" : "Etsy"}.`, "success");
                   }, 1500)
               }}><RefreshCw className="w-4 h-4 mr-2" /> Push to {channelTab === "shopify" ? "Shopify" : "Etsy"}</Button>
            </div>
          </>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl flex flex-col">
             <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
              <h2 className="text-lg font-semibold">New Listing</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <form id="add-listing-form" onSubmit={handleAddListing} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cultivar / Title</label>
                  <Input required placeholder="P. Esseriana" value={newListing.cultivar} onChange={(e) => setNewListing({...newListing, cultivar: e.target.value})} className="w-full" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">SKU</label>
                  <Input required placeholder="PING-ESS-01" value={newListing.sku} onChange={(e) => setNewListing({...newListing, sku: e.target.value})} className="w-full" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Price</label>
                  <Input type="number" step="0.01" min="0" required value={newListing.price || ""} onChange={(e) => setNewListing({...newListing, price: parseFloat(e.target.value) || 0})} className="w-full" />
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-border-subtle bg-bg-base/50 flex justify-end gap-2 shrink-0">
               <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
               <Button variant="brand" type="submit" form="add-listing-form">Create Draft</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
