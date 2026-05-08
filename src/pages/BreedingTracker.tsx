import React, { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Plus, Calendar as CalendarIcon, Info, Sprout, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { cn } from "@/lib/utils";
import { CultivarName } from "@/components/ui/CultivarName";
import { useDataState } from "@/hooks/useDataState";
import { ErrorState, EmptyState } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/Input";

const CROSSES = [
  { id: 1, parentA: "P. agnata", parentB: "P. debbertiana", status: "germinated", date: "2023-09-10", elapsed: 140, notes: "Good germination rate" },
  { id: 2, parentA: "P. moranensis", parentB: "P. ehlersiae", status: "seed set", date: "2024-02-15", elapsed: 45, notes: "Pod swelling visible" },
  { id: 3, parentA: "P. gigantea", parentB: "P. moctezumae", status: "pollinated", date: "2024-03-20", elapsed: 12, notes: "" },
  { id: 4, parentA: "P. 'Pirouette'", parentB: "P. 'Pirouette'", status: "failed", date: "2023-11-05", elapsed: 0, notes: "Selfing failed, flower dropped" },
];

const CALENDAR_DAYS = Array.from({ length: 60 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return d;
});

export default function BreedingTracker() {
  const [activeTab, setActiveTab] = useState("Active Crosses");
  const [crossesData, setCrossesData] = useState(CROSSES);
  const { data, isLoading, isError, isEmpty } = useDataState(crossesData);
  const { addToast } = useApp();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCross, setNewCross] = useState({ parentA: "", parentB: "" });

  const handleAddCross = (e: React.FormEvent) => {
    e.preventDefault();
    const cross = {
       id: Math.max(...crossesData.map(c => c.id)) + 1,
       parentA: newCross.parentA,
       parentB: newCross.parentB,
       status: "pollinated",
       date: "Today",
       elapsed: 0,
       notes: ""
    };
    setCrossesData([cross, ...crossesData]);
    setIsAddModalOpen(false);
    setNewCross({ parentA: "", parentB: "" });
    addToast("Breeding cross added successfully", "success");
  };

  return (
    <div className="flex flex-col h-full p-4 md:p-8 max-w-7xl mx-auto overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link to="/cultivars">
            <Button variant="outline" className="w-10 px-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">Breeding Tracker</h1>
            <p className="text-sm text-text-secondary">Manage pollination, seed set, and new hybrid crosses.</p>
          </div>
        </div>
        <Button variant="brand" onClick={() => setIsAddModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Cross
        </Button>
      </div>

      <div className="flex gap-6 border-b border-border-subtle mb-6">
        {["Active Crosses", "Pollination Calendar"].map(tab => (
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
              <div className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-text-primary"></div>
            )}
          </button>
        ))}
      </div>

      {activeTab === "Active Crosses" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {isLoading && Array.from({length: 4}).map((_, i) => (
             <Card key={i} className="p-4 h-[200px] animate-pulse bg-bg-elevated/50" />
           ))}
           {isError && <div className="col-span-full"><ErrorState /></div>}
           {!isLoading && !isError && isEmpty && (
              <div className="col-span-full">
                 <EmptyState icon={Sprout} title="No active crosses" description="Manage pollination, seed set, and new hybrid crosses." action={<Button variant="outline" className="mt-2 text-sm" onClick={() => setIsAddModalOpen(true)}>Add Cross</Button>} />
              </div>
           )}
           {!isLoading && !isError && !isEmpty && data.map(cross => (
             <Card key={cross.id} className="p-4 flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="font-medium  text-lg leading-tight">
                    <CultivarName name={cross.parentA} /> <span className="mx-2 text-text-tertiary  text-sm">×</span> <CultivarName name={cross.parentB} />
                  </div>
                  <Badge variant="outline" className="bg-bg-base shrink-0 capitalize">
                    {cross.status}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                     <div className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Date</div>
                     <div className="text-sm">{cross.date}</div>
                  </div>
                  <div>
                     <div className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Elapsed</div>
                     <div className="text-sm">{cross.elapsed} days</div>
                  </div>
                </div>

                <div className="flex-1">
                   {cross.notes && <p className="text-sm text-text-secondary">{cross.notes}</p>}
                </div>

                {cross.status === "germinated" && (
                  <div className="mt-4 pt-4 border-t border-border-subtle">
                     <Button variant="outline" className="w-full" onClick={() => addToast("Cultivated promotion workflow started", "info")}>Promote to cultivar</Button>
                  </div>
                )}
             </Card>
           ))}
        </div>
      )}

      {activeTab === "Pollination Calendar" && (
        <Card className="p-6">
           <div className="flex items-center gap-2 mb-6 text-sm text-text-secondary">
             <CalendarIcon className="w-4 h-4" />
             <span>60-day forward-looking window for pollination tasks and seed-set checks.</span>
           </div>
           
           <div className="grid grid-cols-7 gap-2">
             {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
               <div key={day} className="text-xs text-text-tertiary font-medium uppercase tracking-wider p-2 text-center">
                 {day}
               </div>
             ))}
             {/* Offset for start, demo starts wherever */}
             {Array.from({ length: CALENDAR_DAYS[0].getDay() }).map((_, i) => (
               <div key={`empty-${i}`} className="p-2 border border-transparent"></div>
             ))}
             {CALENDAR_DAYS.map((date, i) => {
               // Mock some active days
               const hasTask = i === 3 || i === 12 || i === 14 || i === 28;
               return (
                 <div key={i} className="aspect-square p-2 border border-border-subtle rounded-lg bg-bg-active flex flex-col justify-between hover:bg-bg-hover cursor-pointer transition-colors relative">
                   <div className="text-sm text-text-secondary">{date.getDate()}</div>
                   {hasTask && (
                     <div className="absolute bottom-2 right-2 flex gap-2">
                        <StatusDot status="info" />
                     </div>
                   )}
                 </div>
               );
             })}
           </div>
        </Card>
      )}
    </div>
  );
}
