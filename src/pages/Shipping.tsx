import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/StatusDot";
import { ThermometerSun, Send, Settings, Mail, Box, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDataState } from "@/hooks/useDataState";
import { ErrorState, EmptyState } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";

const PENDING = [
  { id: "ORD-1198", dest: "Phoenix, AZ", zip: "85001", temp: 95, cond: "Sunny", windowOpen: false, rec: "Hold" },
  { id: "ORD-1199", dest: "Seattle, WA", zip: "98101", temp: 65, cond: "Cloudy", windowOpen: true, rec: "Ship" },
  { id: "ORD-1200", dest: "New York, NY", zip: "10001", temp: 72, cond: "Clear", windowOpen: true, rec: "Ship" },
  { id: "ORD-1201", dest: "Miami, FL", zip: "33101", temp: 88, cond: "Humid", windowOpen: false, rec: "Hold" },
  { id: "ORD-1202", dest: "Denver, CO", zip: "80201", temp: 45, cond: "Cold", windowOpen: false, rec: "Hold" },
];

const REGIONS = [
  { name: "Southwest", status: "warn", msg: "Heat Advisory in AZ and NV. Hold fragile shipments.", temp: "90-105" },
  { name: "West", status: "ok", msg: "Clear for shipping.", temp: "60-75" },
  { name: "Central", status: "ok", msg: "Clear for shipping.", temp: "70-85" },
  { name: "Northeast", status: "ok", msg: "Clear for shipping.", temp: "65-80" },
  { name: "Southeast", status: "warn", msg: "High humidity and storms in FL.", temp: "85-95" },
];

export default function Shipping() {
  const [activeTab, setActiveTab] = useState<"pending" | "windows" | "heat">("heat");
  const { data: pendingData, isLoading: pendingLoading, isEmpty: pendingEmpty, isError: pendingError } = useDataState(PENDING);
  const { data: regionData, isLoading: regionLoading, isEmpty: regionEmpty, isError: regionError } = useDataState(REGIONS);
  const { addToast } = useApp();

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-2">Shipping Logistics</h1>
        <p className="text-sm text-text-secondary">Weather-aware dispatch recommendations and pending queue.</p>
      </div>

      <div className="flex items-center gap-2 mb-6 border-b border-border-subtle pb-px">
        <button
          onClick={() => setActiveTab("heat")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px]",
            activeTab === "heat" ? "border-text-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
          )}
        >
          Heat Intelligence
        </button>
        <button
          onClick={() => setActiveTab("pending")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px]",
            activeTab === "pending" ? "border-text-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
          )}
        >
          Pending Hub
        </button>
        <button
          onClick={() => setActiveTab("windows")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px]",
            activeTab === "windows" ? "border-accent-brand text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
          )}
        >
          Regional Windows
        </button>
      </div>

      {activeTab === "heat" && (
        <div className="flex-1 overflow-auto flex flex-col gap-6">
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
              <Card className="lg:col-span-2 p-6 min-h-[400px] flex flex-col relative overflow-hidden group">
                 <h2 className="text-lg font-medium mb-4">10-Day Heat Projection</h2>
                 <div className="flex-1 border border-border-subtle rounded-lg bg-bg-base/50 p-4 relative overflow-hidden flex items-center justify-center">
                    {/* Abstract 'Heat Map' visualization */}
                    <div className="absolute inset-0 opacity-20 pointer-events-none">
                       <div className="absolute top-[20%] left-[10%] w-[40%] h-[50%] bg-blue-500 rounded-full blur-[60px]" />
                       <div className="absolute top-[40%] left-[30%] w-[40%] h-[40%] bg-green-500 rounded-full blur-[60px]" />
                       <div className="absolute bottom-[10%] right-[10%] w-[30%] h-[30%] bg-red-500 rounded-full blur-[60px]" />
                       <div className="absolute top-[10%] left-[70%] w-[20%] h-[30%] bg-yellow-500 rounded-full blur-[60px]" />
                    </div>
                    {/* Zones Overlay */}
                    <div className="relative z-10 w-full max-w-md aspect-[4/3] grid grid-cols-4 grid-rows-3 gap-2 opacity-50 font-mono text-[10px] text-text-tertiary">
                       {[...Array(12)].map((_, i) => (
                           <div key={i} className={`border border-border-subtle rounded flex items-center justify-center ${i == 9 || i == 10 ? 'bg-status-alert/20 border-status-alert/50' : i == 3 || i == 7 ? 'bg-status-warn/20 border-status-warn/50' : ''}`}>
                              Zone {i+1}
                           </div>
                       ))}
                    </div>
                 </div>
              </Card>

              <div className="space-y-6">
                 <Card className="p-4">
                    <div className="flex items-center justify-between mb-4">
                       <h3 className="font-medium">Threshold Settings</h3>
                       <Settings className="w-4 h-4 text-text-tertiary" />
                    </div>
                    <div className="space-y-4">
                       <div>
                          <div className="text-xs text-text-secondary uppercase tracking-wider mb-2 flex justify-between">
                            <span>Hold (High Heat)</span>
                            <span className="text-status-alert font-medium">≥ 85°F</span>
                          </div>
                          <div className="h-2 bg-text-primary/10 rounded overflow-hidden flex">
                            <div className="w-[15%] h-full"></div>
                            <div className="w-[45%] h-full bg-status-info"></div>
                            <div className="w-[20%] h-full bg-status-warn"></div>
                            <div className="w-[20%] h-full bg-status-alert"></div>
                          </div>
                       </div>
                       <div>
                          <div className="text-xs text-text-secondary uppercase tracking-wider mb-2 flex justify-between">
                            <span>Hold (Cold)</span>
                            <span className="text-status-info font-medium">≤ 40°F</span>
                          </div>
                       </div>
                       <Button variant="outline" className="w-full mt-2" onClick={() => addToast("Rules configuration opened.", "info")}>Adjust Rules</Button>
                    </div>
                 </Card>

                 <Card className="p-4">
                    <h3 className="font-medium mb-4">Comms Generator</h3>
                    <p className="text-sm text-text-secondary mb-4">Draft email to customers in affected delay zones based on forecast.</p>
                    <div className="bg-bg-active p-2 rounded border border-border-subtle text-xs text-text-tertiary font-mono mb-4">
                       "Hi [Name], due to expected highs of [Temp] in your area..."
                    </div>
                    <Button className="w-full" onClick={() => {
                        addToast("Drafting emails...", "info");
                        setTimeout(() => addToast("12 email drafts created in your composer.", "success"), 1500);
                    }}><Mail className="w-4 h-4 mr-2" /> Draft to 12 Delayed Orders</Button>
                 </Card>
              </div>
           </div>
        </div>
      )}

      {activeTab === "pending" && (
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-24 md:pb-0">
            {pendingLoading && Array.from({length: 3}).map((_, i) => (
               <Card key={i} className="p-4 h-[200px] animate-pulse bg-bg-elevated/50" />
            ))}
            {pendingError && <div className="col-span-full"><ErrorState /></div>}
            {!pendingLoading && !pendingError && pendingEmpty && (
              <div className="col-span-full">
                <EmptyState icon={Box} title="No shipments pending" description="Orders that need to be shipped will appear here." />
              </div>
            )}
            {!pendingLoading && !pendingError && !pendingEmpty && pendingData.map((shipment) => (
              <Card key={shipment.id} className="p-4">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-lg font-medium">{shipment.dest}</div>
                    <div className="text-sm text-text-secondary">{shipment.id} &middot; {shipment.zip}</div>
                  </div>
                  <div className="flex items-center gap-2 font-medium">
                    <StatusDot status={shipment.rec === "Ship" ? "ok" : "alert"} />
                    {shipment.rec}
                  </div>
                </div>
                
                <div className="bg-bg-base/50 border border-border-subtle rounded-lg p-2 flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ThermometerSun className="w-4 h-4 text-text-secondary" />
                    <span className="font-medium">{shipment.temp}&deg;F</span>
                  </div>
                  <span className="text-sm text-text-secondary">{shipment.cond}</span>
                </div>

                <div className="flex items-center justify-between text-sm pt-4 border-t border-border-subtle">
                  <div>
                    <span className="text-text-secondary block text-xs uppercase tracking-wide">Next Window</span>
                    <div className="flex items-center gap-1.5 mt-1 font-medium">
                      <StatusDot status={shipment.windowOpen ? "ok" : "alert"} />
                      {shipment.windowOpen ? "Open this Monday" : "Closed"}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" disabled={!shipment.windowOpen}>
                    <Send className="w-3 h-3 mr-2" />
                    Dispatch
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
      
      {activeTab === "windows" && (
        <div className="flex-1 overflow-auto pb-24 md:pb-0">
          <div className="space-y-4">
            {regionLoading && Array.from({length: 5}).map((_, i) => (
              <Card key={i} className="h-20 animate-pulse bg-bg-elevated/50" />
            ))}
            {regionError && <ErrorState />}
            {!regionLoading && !regionError && regionEmpty && (
              <EmptyState icon={Map} title="No regions configured" description="Geographic shipping rules and windows will appear here." />
            )}
            {!regionLoading && !regionError && !regionEmpty && regionData.map((region) => (
              <Card key={region.name} className="p-0 overflow-hidden flex">
                <div className="w-12 flex-shrink-0 flex items-center justify-center border-r border-border-subtle bg-bg-base">
                  <StatusDot status={region.status as "ok" | "warn" | "alert" | "info"} />
                </div>
                <div className="p-4 flex-1 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-lg mb-2">{region.name}</h3>
                    <p className="text-sm text-text-secondary">{region.msg}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-medium tabular-nums">{region.temp}&deg;F</div>
                    <div className="text-xs text-text-secondary mt-2">14-day avg highs</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
