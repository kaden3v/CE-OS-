import { ArrowLeft, Download, FileText, Calendar, BarChart3, TrendingUp, CheckCircle2 } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useApp } from "@/contexts/AppContext";

export default function YearEndSnapshot() {
  const { addToast } = useApp();

  const handleDownloadPDF = () => {
    addToast({ title: "Downloading PDF", description: "Your 2023 snapshot is generating.", status: "info" });
  };

  const handleExportCSV = () => {
    addToast({ title: "Exporting CSV", description: "CSV export started.", status: "info" });
  };

  return (
    <div className="flex flex-col h-full p-4 md:p-8 max-w-5xl mx-auto overflow-y-auto">
      <div className="mb-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/finances/tax-report">
            <Button variant="outline" className="w-10 px-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">2023 Year-End Snapshot</h1>
            <p className="text-sm text-text-secondary">Historical preservation of tax-year data. Read-only.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleDownloadPDF}>
            <Download className="w-4 h-4 mr-2" />
            <span className="hidden md:inline">Download PDF</span>
            <span className="md:hidden">PDF</span>
          </Button>
          <Button variant="brand" onClick={handleExportCSV}>
            <FileText className="w-4 h-4 mr-2" />
            <span className="hidden md:inline">Export CSV</span>
            <span className="md:hidden">CSV</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mb-8">
        <Card className="p-4">
           <div className="flex items-center gap-2 text-text-secondary mb-2">
             <Calendar className="w-4 h-4" />
             <span className="text-xs uppercase tracking-wider font-medium">Fiscal Year</span>
           </div>
           <div className="text-2xl font-semibold">2023</div>
           <div className="text-sm text-text-tertiary mt-2">Jan 1 - Dec 31, 2023</div>
        </Card>
        <Card className="p-4">
           <div className="flex items-center justify-between text-text-secondary mb-2">
             <span className="text-xs uppercase tracking-wider font-medium">Total Revenue</span>
           </div>
           <div className="text-2xl font-semibold">$14,502.50</div>
           <div className="text-sm text-ok flex items-center gap-2 mt-2">
             <TrendingUp className="w-3.5 h-3.5" />
             <span>+24.5% YoY</span>
           </div>
        </Card>
        <Card className="p-4">
           <div className="flex items-center justify-between text-text-secondary mb-2">
             <span className="text-xs uppercase tracking-wider font-medium">Total Expenses</span>
           </div>
           <div className="text-2xl font-semibold">$5,240.10</div>
           <div className="text-sm text-status-warn flex items-center gap-2 mt-2">
             <TrendingUp className="w-3.5 h-3.5" />
             <span>+12.0% YoY</span>
           </div>
        </Card>
        <Card className="p-4 bg-bg-active border-border-strong relative overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-br from-accent-brand/10 to-transparent pointer-events-none"></div>
           <div className="flex items-center justify-between text-text-secondary mb-2 relative z-10">
             <span className="text-xs uppercase tracking-wider font-medium text-text-primary">Net Profit</span>
           </div>
           <div className="text-2xl font-semibold text-accent-brand relative z-10">$9,262.40</div>
           <div className="text-sm text-text-tertiary mt-2 relative z-10">63.8% Margin</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-safe">
         <Card className="flex flex-col">
            <div className="p-4 border-b border-border-subtle flex items-center justify-between">
              <h3 className="font-medium text-lg">Category Breakdown</h3>
              <BarChart3 className="w-5 h-5 text-text-tertiary" />
            </div>
            <div className="p-4 flex-1 flex flex-col justify-center">
              <div className="space-y-6">
                 <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                       <span className="font-medium">Plants & Seeds</span>
                       <span className="text-text-secondary">$2,100.00</span>
                    </div>
                    <div className="w-full bg-bg-active h-2 rounded-full overflow-hidden">
                       <div className="bg-accent-brand h-full" style={{ width: '40%' }}></div>
                    </div>
                 </div>
                 <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                       <span className="font-medium">Shipping Materials</span>
                       <span className="text-text-secondary">$1,850.50</span>
                    </div>
                    <div className="w-full bg-bg-active h-2 rounded-full overflow-hidden">
                       <div className="bg-accent-brand h-full opacity-80" style={{ width: '35%' }}></div>
                    </div>
                 </div>
                 <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                       <span className="font-medium">Software & Fees</span>
                       <span className="text-text-secondary">$890.00</span>
                    </div>
                    <div className="w-full bg-bg-active h-2 rounded-full overflow-hidden">
                       <div className="bg-accent-brand h-full opacity-60" style={{ width: '15%' }}></div>
                    </div>
                 </div>
                 <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                       <span className="font-medium">Other</span>
                       <span className="text-text-secondary">$399.60</span>
                    </div>
                    <div className="w-full bg-bg-active h-2 rounded-full overflow-hidden">
                       <div className="bg-accent-brand h-full opacity-40" style={{ width: '10%' }}></div>
                    </div>
                 </div>
              </div>
            </div>
         </Card>

         <Card className="flex flex-col">
            <div className="p-4 border-b border-border-subtle">
              <h3 className="font-medium text-lg">Notes & Adjustments</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="p-4 rounded-lg bg-bg-active border border-border-subtle">
                 <div className="text-sm font-medium mb-2">Inventory Valuation Method</div>
                 <p className="text-sm text-text-secondary">Switched from FIFO to LIFO for 2023. This resulted in a $450 adjustment to ending inventory value.</p>
              </div>
              <div className="p-4 rounded-lg bg-bg-active border border-border-subtle">
                 <div className="text-sm font-medium mb-2">Etsy 1099-K Dispute</div>
                 <p className="text-sm text-text-secondary">Etsy originally reported $15,000 gross. Adjusted down by $497.50 for refunded orders not deducted in their initial report.</p>
              </div>
              <div className="p-4 rounded-lg bg-status-info/10 border border-border-subtle">
                 <div className="text-sm font-medium mb-2 text-status-info flex items-center gap-2">
                   <CheckCircle2 className="w-4 h-4" />
                   CPA Reviewed
                 </div>
                 <p className="text-sm text-text-secondary">These numbers were finalized and filed by Miller Accounting on Feb 15, 2024.</p>
              </div>
            </div>
         </Card>
      </div>
    </div>
  );
}
