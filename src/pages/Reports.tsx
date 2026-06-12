import { useSearchParams } from "react-router";
import { FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { PnlReport } from "@/components/reports/PnlReport";
import { CashFlowReport } from "@/components/reports/CashFlowReport";
import { QuarterlyReport } from "@/components/reports/QuarterlyReport";
import { TaxReportContent } from "@/components/reports/TaxReportContent";

const TABS = [
  { key: "pnl", label: "P&L" },
  { key: "cash-flow", label: "Cash Flow" },
  { key: "quarterly", label: "Quarterly Estimates" },
  { key: "tax", label: "Tax Report" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "pnl";
  const setTab = (t: TabKey) => setParams({ tab: t }, { replace: true });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2"><FileSpreadsheet className="w-6 h-6 text-text-secondary" /> Reports</h1>
        <p className="text-sm text-text-secondary">Profit &amp; loss, cash flow, quarterly estimates, and your tax summary.</p>
      </div>

      <div className="flex items-center gap-1 border-b border-border-subtle mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
              tab === t.key ? "border-accent-brand text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pnl" && <PnlReport />}
      {tab === "cash-flow" && <CashFlowReport />}
      {tab === "quarterly" && <QuarterlyReport />}
      {tab === "tax" && <TaxReportContent />}
    </div>
  );
}
