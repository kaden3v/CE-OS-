import { useEffect, useMemo, useState } from "react";
import { Download, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { formatMoney } from "@/lib/format";
import { currentYear } from "@/lib/dates";
import { fetchPnl, downloadCsv, type Pnl } from "@/lib/financeReports";
import { quarterlyEstimate } from "@/lib/finance";

const n = (v: unknown) => Number(v ?? 0);

export function QuarterlyReport() {
  const { activeOrgId } = useAuth();
  const { addToast } = useApp();
  const year = currentYear();
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [incomeRate, setIncomeRate] = useState("12");

  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    fetchPnl(activeOrgId, year).then((p) => { if (!cancelled) setPnl(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeOrgId, year]);

  const quarters = useMemo(() => {
    const np = pnl ? pnl.months.map((w) => n(w.net_profit)) : Array(12).fill(0);
    const cum = (through: number) => np.slice(0, through).reduce((s, x) => s + x, 0);
    return [
      { label: "Q1", period: "Jan – Mar", due: `Apr 15, ${year}`, toDate: cum(3) },
      { label: "Q2", period: "Apr – May", due: `Jun 15, ${year}`, toDate: cum(5) },
      { label: "Q3", period: "Jun – Aug", due: `Sep 15, ${year}`, toDate: cum(8) },
      { label: "Q4", period: "Sep – Dec", due: `Jan 15, ${year + 1}`, toDate: cum(12) },
    ];
  }, [pnl, year]);

  const annualNp = pnl ? Math.max(0, n(pnl.total.net_profit)) : 0;
  const { seTax, incomeTax, total: totalTax, perQuarter } = quarterlyEstimate(annualNp, Number(incomeRate) || 0);

  const exportCsv = () => {
    const rows = [
      ["Estimate only — confirm with a tax professional"],
      ["Annual net profit", annualNp.toFixed(2)],
      ["SE tax (15.3% of 92.35%)", seTax.toFixed(2)],
      [`Income tax (${incomeRate}%)`, incomeTax.toFixed(2)],
      ["Total estimated tax", totalTax.toFixed(2)],
      [],
      ["Quarter", "Period", "Due", "Net profit to date", "Suggested payment"],
      ...quarters.map((q) => [q.label, q.period, q.due, q.toDate.toFixed(2), perQuarter.toFixed(2)]),
    ];
    downloadCsv(`quarterly-estimates-${year}.csv`, rows);
    addToast({ title: "CSV exported", description: `quarterly-estimates-${year}.csv`, status: "ok" });
  };

  return (
    <div>
      <div className="flex items-start gap-2 rounded-lg border border-status-warn/40 bg-status-warn/10 px-3 py-2.5 mb-6 text-sm">
        <AlertTriangle className="w-4 h-4 text-status-warn shrink-0 mt-0.5" />
        <span className="text-text-primary"><span className="font-medium">Estimate only.</span> Confirm amounts with a tax professional.</span>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium">Quarterly estimated tax · {year}</h2>
        <Button variant="outline" onClick={exportCsv} disabled={!pnl}><Download className="w-4 h-4" /> Export CSV</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-4">
        <StatTile label="Annual net profit" value={formatMoney(annualNp)} />
        <StatTile label="SE tax (15.3%)" value={formatMoney(seTax)} />
        <StatTile label={`Income tax (${incomeRate || 0}%)`} value={formatMoney(incomeTax)} />
        <StatTile label="Total estimated tax" value={formatMoney(totalTax)} />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm text-text-secondary">Income tax rate</label>
        <div className="relative w-24">
          <Input type="number" min="0" max="100" value={incomeRate} onChange={(e) => setIncomeRate(e.target.value)} className="pr-7" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">%</span>
        </div>
        <span className="text-xs text-text-tertiary">Your marginal federal + state estimate.</span>
      </div>

      <Card className="overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-[11px] uppercase tracking-wide text-text-secondary border-b border-border-subtle">
            <tr>
              <th className="px-4 py-2 font-medium">Quarter</th>
              <th className="px-4 py-2 font-medium">Period</th>
              <th className="px-4 py-2 font-medium">Due</th>
              <th className="px-4 py-2 font-medium text-right">Net profit to date</th>
              <th className="px-4 py-2 font-medium text-right">Suggested payment</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map((q) => (
              <tr key={q.label} className="border-b border-border-subtle/50 last:border-0">
                <td className="px-4 py-2 font-medium">{q.label}</td>
                <td className="px-4 py-2 text-text-secondary">{q.period}</td>
                <td className="px-4 py-2 text-text-secondary">{q.due}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatMoney(q.toDate)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{formatMoney(perQuarter)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
