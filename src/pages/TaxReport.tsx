import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Download, BarChart2 } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const MONTHLY_DATA = [
  { name: 'Jan', income: 4200, expense: 1200 },
  { name: 'Feb', income: 3800, expense: 1398 },
  { name: 'Mar', income: 2900, expense: 800 },
  { name: 'Apr', income: 3100, expense: 908 },
  { name: 'May', income: 3890, expense: 1100 },
  { name: 'Jun', income: 4390, expense: 800 },
  { name: 'Jul', income: 5490, expense: 1300 },
  { name: 'Aug', income: 4900, expense: 900 },
  { name: 'Sep', income: 3400, expense: 800 },
  { name: 'Oct', income: 3100, expense: 900 },
  { name: 'Nov', income: 4900, expense: 1800 },
  { name: 'Dec', income: 6800, expense: 2300 },
];

export default function TaxReport() {
  const { addToast } = useApp();

  const handleExport = () => {
    addToast({ title: "Export Started", description: "Your 2026 Tax Report PDF is generating.", status: "info" });
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Tax Report</h1>
          <p className="text-sm text-text-secondary">Year-end summary for 2026.</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          Export PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-medium mb-4 pb-4 border-b border-border-subtle">Income</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary">Shopify Gross Sales</span>
                <span className="tabular-nums">$24,560.00</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary">Etsy Gross Sales</span>
                <span className="tabular-nums">$18,420.50</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border-subtle font-medium">
                <span>Total Gross Income</span>
                <span className="tabular-nums text-status-ok">$42,980.50</span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-medium mb-4 pb-4 border-b border-border-subtle">Expenses & Deductions</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary">Cost of Goods Sold (Plants/Seeds)</span>
                <span className="tabular-nums">$2,140.00</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary">Supplies & Media</span>
                <span className="tabular-nums">$1,850.25</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary">Shipping & Postage</span>
                <span className="tabular-nums">$4,120.00</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary">Home Office / Utilities</span>
                <span className="tabular-nums">$1,200.00</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary">Licenses & Permits</span>
                <span className="tabular-nums">$350.00</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border-subtle font-medium">
                <span>Total Deductible Expenses</span>
                <span className="tabular-nums text-status-alert">$9,660.25</span>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-border-strong relative overflow-hidden bg-bg-active">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-brand/10 to-transparent pointer-events-none"></div>
            <h2 className="text-lg font-medium mb-4 pb-4 border-b border-border-subtle text-accent-brand relative z-10">Summary</h2>
            <div className="space-y-3 relative z-10">
              <div className="flex justify-between items-center font-medium text-lg text-text-primary">
                <span>Net Profit</span>
                <span className="tabular-nums">$33,320.25</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-2">
                <span className="text-text-secondary">Estimated Quarterly Tax (30%)</span>
                <span className="tabular-nums font-medium text-status-alert">$9,996.07</span>
              </div>
            </div>
          </Card>
        </div>

        <Card className="lg:col-span-2 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-border-subtle">
             <h2 className="text-lg font-medium">Monthly Cash Flow</h2>
             <BarChart2 className="w-5 h-5 text-text-tertiary" />
          </div>
          <div className="flex-1 w-full min-h-[400px] relative">
             <div className="absolute inset-0">
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={MONTHLY_DATA} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                       <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                       <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--color-text-tertiary)', fontSize: 12}} dy={10} />
                       <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--color-text-tertiary)', fontSize: 12}} tickFormatter={(val) => `$${val}`} />
                       <Tooltip 
                         cursor={{fill: 'var(--color-bg-active)'}}
                         contentStyle={{backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-strong)', borderRadius: '8px'}}
                         itemStyle={{fontSize: '14px', fontWeight: 500}}
                         labelStyle={{color: 'var(--color-text-secondary)', marginBottom: '8px'}}
                       />
                       <Legend wrapperStyle={{paddingTop: '20px'}} />
                       <Bar dataKey="income" name="Gross Income" fill="var(--color-status-ok)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                       <Bar dataKey="expense" name="Expenses" fill="var(--color-status-alert)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                 </ResponsiveContainer>
             </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
