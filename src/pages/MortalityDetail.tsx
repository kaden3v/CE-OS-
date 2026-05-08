import { ArrowLeft, Skull, AlertCircle, FileSearch } from "lucide-react";
import { CultivarName } from "@/components/ui/CultivarName";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { useDataState } from "@/hooks/useDataState";
import { LoadingTable, ErrorState, EmptyState } from "@/components/ui/StateRenderer";

export default function MortalityDetail() {
  const { id } = useParams();

  const mockMortality = [
    { date: "2024-03-01", stage: "Juvenile", count: 12, reason: "Damping off", notes: "Tray 4 showed fungal growth" },
    { date: "2024-01-15", stage: "Mature", count: 2, reason: "Crown rot", notes: "Overwatered during winter" },
  ];

  const { data, isLoading, isError, isEmpty } = useDataState(mockMortality);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <Link to="/inventory">
          <Button variant="outline" className="w-10 px-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Skull className="w-5 h-5 text-text-tertiary" />
            Mortality Log
          </h1>
          <p className="text-sm text-text-secondary">Item ID: {id} • Tracking losses for inventory accuracy</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
         <Card className="p-4 flex items-start gap-4">
            <div className="p-2 bg-status-alert/10 text-status-alert rounded-lg">
               <AlertCircle className="w-5 h-5" />
            </div>
            <div>
               <div className="text-sm text-text-secondary mb-2">Total Loss (YTD)</div>
               <div className="text-2xl font-medium">14</div>
            </div>
         </Card>
         <Card className="p-4 flex items-start gap-4">
            <div className="p-2 bg-bg-active text-text-secondary rounded-lg">
               <Skull className="w-5 h-5" />
            </div>
            <div>
               <div className="text-sm text-text-secondary mb-2">Common Cause</div>
               <div className="text-lg font-medium">Fungal</div>
            </div>
         </Card>
      </div>

      <h2 className="text-lg font-medium mb-4">Event History</h2>
      <Card className="flex-1 overflow-auto flex flex-col min-h-[300px]">
        {isLoading && <LoadingTable cols={5} rows={4} />}
        {isError && <ErrorState />}
        {!isLoading && !isError && isEmpty && (
          <EmptyState 
            icon={FileSearch} 
            title="No events logged" 
            description="Mortality tracking events will appear here." 
          />
        )}
        {!isLoading && !isError && !isEmpty && (
          <DataTable
            columns={[
              { accessorKey: "date", header: "Date" },
              { accessorKey: "stage", header: "Stage" },
              { accessorKey: "count", header: "Count", cell: (info: any) => <span className="font-medium text-status-alert">-{info.getValue()}</span> },
              { accessorKey: "reason", header: "Reason" },
              { accessorKey: "notes", header: "Notes", cell: (info: any) => <span className="text-text-secondary">{info.getValue()}</span> },
            ]}
            data={data}
          />
        )}
      </Card>
    </div>
  );
}
