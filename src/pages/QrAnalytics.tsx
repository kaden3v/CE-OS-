import { ArrowLeft, Download, FileSearch } from "lucide-react";
import { CultivarName } from "@/components/ui/CultivarName";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/StatTile";
import { DataTable } from "@/components/ui/DataTable";
import { StatusDot } from "@/components/ui/StatusDot";
import { RechartsChart } from "@/components/ui/RechartsChart";
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { useDataState } from "@/hooks/useDataState";
import { LoadingTable, ErrorState, EmptyState } from "@/components/ui/StateRenderer";

const SCAN_DATA = [
  { name: 'Week 1', scans: 120 },
  { name: 'Week 2', scans: 145 },
  { name: 'Week 3', scans: 130 },
  { name: 'Week 4', scans: 180 },
];

const RECENT_SCANS = [
  { id: 1, timestamp: "Today, 10:45 AM", cultivar: "P. 'Pirouette'", size: "Starter", installed: true },
  { id: 2, timestamp: "Today, 09:12 AM", cultivar: "P. agnata 'El Lobo'", size: "Mature", installed: false },
  { id: 3, timestamp: "Yesterday, 4:30 PM", cultivar: "P. 'Johanna'", size: "Intermediate", installed: true },
  { id: 4, timestamp: "Yesterday, 2:15 PM", cultivar: "P. gigantea", size: "Starter", installed: true },
];

const columns = [
  { accessorKey: "timestamp", header: "Time" },
  { accessorKey: "cultivar", header: "Cultivar", cell: (info: any) => <CultivarName name={info.getValue()} className="" /> },
  { accessorKey: "size", header: "Size" },
  { accessorKey: "installed", header: "Install Event", cell: (info: any) => (
      <div className="flex items-center gap-2 font-medium">
        {info.getValue() ? <><StatusDot status="info" /> Yes</> : <><StatusDot status="warn" /> No</>}
      </div>
  ) },
];

export default function QrAnalytics() {
  const { data, isLoading, isError, isEmpty } = useDataState(RECENT_SCANS);

  return (
    <div className="flex flex-col h-full p-4 md:p-8 max-w-7xl mx-auto overflow-y-auto">
      <div className="flex items-center mb-8 gap-4">
        <Link to="/inventory/qr-codes">
          <Button variant="outline" className="w-10 px-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">QR Analytics</h1>
          <p className="text-sm text-text-secondary">Scan activity and conversion metrics for outgoing codes.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mb-8">
         <StatTile label="Total Scans (Month)" value="575" trend={{ value: "14%", direction: "up" }} />
         <StatTile label="New Installs" value="48" trend={{ value: "5%", direction: "up" }} />
         <StatTile label="Conversion Rate" value="8.3%" trend={{ value: "1.2%", direction: "down" }} />
         <StatTile label="Top Cultivar" value="P. 'Pirouette'" />
      </div>

      <div className="h-[250px] w-full bg-bg-active/30 border border-border-subtle rounded-xl p-6 mb-8 flex flex-col">
         <h3 className="text-xs uppercase tracking-wider text-text-secondary font-medium mb-4">Scans over time</h3>
         <div className="flex-1">
            <RechartsChart>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={SCAN_DATA} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorScans" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent-brand)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-accent-brand)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="scans" stroke="var(--color-accent-brand)" fillOpacity={1} fill="url(#colorScans)" />
                </AreaChart>
              </ResponsiveContainer>
            </RechartsChart>
         </div>
      </div>

      <h3 className="text-xs uppercase tracking-wider text-text-secondary font-medium mb-4">Recent Scans</h3>
      {isLoading && <LoadingTable cols={4} rows={4} />}
      {isError && <ErrorState />}
      {!isLoading && !isError && isEmpty && (
        <EmptyState 
          icon={FileSearch} 
          title="No scans yet" 
          description="Recent scan activity will appear here." 
        />
      )}
      {!isLoading && !isError && !isEmpty && <DataTable columns={columns} data={data} />}
    </div>
  );
}
