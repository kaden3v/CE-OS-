import { ArrowLeft, TrendingDown, TrendingUp, Flower2, BarChart2 } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { cn } from "@/lib/utils";
import { CultivarName } from "@/components/ui/CultivarName";
import { useDataState } from "@/hooks/useDataState";
import { LoadingTable, ErrorState, EmptyState } from "@/components/ui/StateRenderer";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { RechartsChart } from "@/components/ui/RechartsChart";

const PROFIT_DATA = [
  { id: 1, name: "P. 'Pirouette'", units: 342, revenue: 6840.00, cost: 855.00, profit: 5985.00, margin: 87.5 },
  { id: 2, name: "P. esseriana", units: 120, revenue: 1800.00, cost: 300.00, profit: 1500.00, margin: 83.3 },
  { id: 3, name: "P. moranensis", units: 85, revenue: 1700.00, cost: 425.00, profit: 1275.00, margin: 75.0 },
  { id: 4, name: "P. gigantea", units: 45, revenue: 1350.00, cost: 540.00, profit: 810.00, margin: 60.0 },
  { id: 5, name: "Drosera capensis", units: 50, revenue: 500.00, cost: 300.00, profit: 200.00, margin: 40.0 },
];

const columns = [
  {
    accessorKey: "name",
    header: "Cultivar",
    cell: (info: any) => <CultivarName name={info.getValue()} className="font-medium  text-text-primary" />,
  },
  {
    accessorKey: "units",
    header: "Units Sold (YTD)",
    cell: (info: any) => <span className="tabular-nums">{info.getValue()}</span>,
  },
  {
    accessorKey: "revenue",
    header: "Revenue",
    cell: (info: any) => <span className="tabular-nums text-text-secondary">${info.getValue().toFixed(2)}</span>,
  },
  {
    accessorKey: "cost",
    header: "Est. Cost",
    cell: (info: any) => <span className="tabular-nums text-text-secondary">${info.getValue().toFixed(2)}</span>,
  },
  {
    accessorKey: "profit",
    header: "Est. Profit",
    cell: (info: any) => <span className="tabular-nums font-medium">${info.getValue().toFixed(2)}</span>,
  },
  {
    accessorKey: "margin",
    header: "Margin %",
    cell: (info: any) => {
      const val = info.getValue() as number;
      const colorClass = val >= 70 ? "text-status-ok" : val >= 50 ? "text-status-warn" : "text-status-alert";
      const Icon = val >= 70 ? TrendingUp : val >= 50 ? TrendingUp : TrendingDown;
      return (
        <span className={cn("inline-flex items-center gap-2 tabular-nums font-medium", colorClass)}>
          {val.toFixed(1)}%
          <Icon className="w-3.5 h-3.5" />
        </span>
      );
    },
  },
];

export default function CultivarProfit() {
  const { data, isLoading, isError, isEmpty } = useDataState(PROFIT_DATA);

  return (
    <div className="flex flex-col h-full p-4 md:p-8 max-w-5xl mx-auto overflow-y-auto">
      <div className="flex items-center mb-8 gap-4 shrink-0">
        <Link to="/cultivars">
          <Button variant="outline" className="w-10 px-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Cultivar Profitability</h1>
          <p className="text-sm text-text-secondary">YTD estimates based on active supplies and labor costs.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 shrink-0">
         <Card className="p-6 md:col-span-3 flex flex-col min-h-[360px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium">Profit & Cost by Cultivar</h2>
              <BarChart2 className="w-5 h-5 text-text-tertiary" />
            </div>
            {isLoading ? (
               <div className="flex-1 flex items-center justify-center">Loading chart...</div>
            ) : isError || isEmpty ? null : (
               <div className="flex-1 min-h-0 relative">
                 <RechartsChart>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                         <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                         <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--color-text-tertiary)', fontSize: 12}} dy={10} angle={-15} textAnchor="end" height={60} />
                         <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--color-text-tertiary)', fontSize: 12}} tickFormatter={(val) => `$${val}`} />
                         <Tooltip 
                           cursor={{fill: 'var(--color-bg-active)'}}
                           contentStyle={{backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-strong)', borderRadius: '8px'}}
                           itemStyle={{fontSize: '14px', fontWeight: 500}}
                           labelStyle={{color: 'var(--color-text-secondary)', marginBottom: '8px'}}
                         />
                         <Legend wrapperStyle={{paddingTop: '20px'}} />
                         <Bar dataKey="profit" name="Net Profit" fill="var(--color-status-ok)" radius={[4, 4, 0, 0]} maxBarSize={50} stackId="a" />
                         <Bar dataKey="cost" name="Est. Cost" fill="var(--color-status-alert)" radius={[4, 4, 0, 0]} maxBarSize={50} stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                 </RechartsChart>
               </div>
            )}
         </Card>
      </div>

      <Card className="flex-1 overflow-auto flex flex-col min-h-[400px]">
        {isLoading && <LoadingTable cols={6} rows={8} />}
        {isError && <ErrorState />}
        {!isLoading && !isError && isEmpty && (
          <EmptyState 
            icon={Flower2} 
            title="No cultivars tracked" 
            description="Start tracking cultivar sales and costs." 
          />
        )}
        {!isLoading && !isError && !isEmpty && <DataTable columns={columns} data={data} onRowClick={() => {}} />}
      </Card>
    </div>
  );
}
