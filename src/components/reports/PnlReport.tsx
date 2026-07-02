import { useEffect, useMemo, useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingTable } from "@/components/ui/StateRenderer";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useTaxSchedule } from "@/contexts/ExpenseCategoriesContext";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { currentYear } from "@/lib/dates";
import { fetchPnl, downloadCsv, MONTH_LABELS, type Pnl, type FinanceWindow } from "@/lib/financeReports";

const n = (v: unknown) => Number(v ?? 0);

interface Row { label: string; months: number[]; total: number; bold?: boolean; indent?: boolean }

export function PnlReport() {
  const { activeOrgId } = useAuth();
  const { addToast } = useApp();
  const { taxSchedule } = useTaxSchedule();
  const [year, setYear] = useState(currentYear());
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    setLoading(true);
    fetchPnl(activeOrgId, year)
      .then((p) => { if (!cancelled) { setPnl(p); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeOrgId, year]);

  const years = useMemo(() => { const y = currentYear(); return [y, y - 1, y - 2]; }, []);

  // Cash basis: supplies are deducted when purchased (Operating Expenses →
  // Supplies), so production COGS is NOT a Net Profit deduction here — it's a
  // managerial per-unit-costing metric shown separately below.
  const rows = useMemo<Row[]>(() => {
    if (!pnl) return [];
    const mv = (sel: (w: FinanceWindow) => number) => pnl.months.map(sel);
    const t = pnl.total;
    const out: Row[] = [
      { label: "Net Revenue", months: mv((w) => n(w.net_revenue)), total: n(t.net_revenue), bold: true },
      { label: "Shipping collected", months: mv((w) => n(w.shipping_collected)), total: n(t.shipping_collected) },
      { label: "Operating Expenses", months: mv((w) => n(w.expenses)), total: n(t.expenses) },
    ];
    // Expense detail follows the org's active tax schedule (F is the default;
    // schedule_f is absent until its migration lands, so fall back to C).
    const breakdown = (taxSchedule === "F" ? pnl.schedule_f : pnl.schedule_c) ?? pnl.schedule_c;
    for (const sc of breakdown) out.push({ label: sc.category, months: sc.months.map(n), total: n(sc.total), indent: true });
    out.push({ label: "Mileage deduction", months: mv((w) => n(w.mileage)), total: n(t.mileage), indent: true });
    out.push({ label: "Net Profit", months: mv((w) => n(w.net_profit)), total: n(t.net_profit), bold: true });
    return out;
  }, [pnl, taxSchedule]);

  const exportCsv = () => {
    if (!pnl) return;
    const header = ["Line", ...MONTH_LABELS, "Total"];
    const data = rows.map((r) => [r.label, ...r.months.map((m) => m.toFixed(2)), r.total.toFixed(2)]);
    downloadCsv(`pnl-${year}.csv`, [header, ...data]);
    addToast({ title: "CSV exported", description: `pnl-${year}.csv`, status: "ok" });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="relative">
          <select className="appearance-none bg-bg-base border border-border-subtle rounded-md pl-3 pr-8 py-2 text-sm font-medium hover:border-border-strong focus:outline-none" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!pnl}><Download className="w-4 h-4" /> Export CSV</Button>
      </div>

      <Card className="overflow-auto">
        {loading ? (
          <LoadingTable cols={14} rows={9} />
        ) : (
          <table className="w-full min-w-max text-sm text-left">
            <thead className="text-[11px] uppercase tracking-wide text-text-secondary border-b border-border-subtle sticky top-0 bg-bg-base/95 backdrop-blur-md">
              <tr>
                <th className="px-3 py-2 font-medium sticky left-0 bg-bg-base/95 backdrop-blur-md">Line</th>
                {MONTH_LABELS.map((m) => <th key={m} className="px-3 py-2 font-medium text-right">{m}</th>)}
                <th className="px-3 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={cn("border-b border-border-subtle/40 last:border-0", r.bold && "bg-bg-elevated/40")}>
                  <td className={cn("px-3 py-1.5 whitespace-nowrap sticky left-0 bg-bg-base/95 backdrop-blur-md", r.bold ? "font-semibold" : r.indent ? "pl-6 text-text-secondary" : "font-medium")}>{r.label}</td>
                  {r.months.map((m, j) => <td key={j} className={cn("px-3 py-1.5 text-right tabular-nums", r.bold ? "font-medium" : "text-text-secondary")}>{m ? formatMoney(m) : "—"}</td>)}
                  <td className={cn("px-3 py-1.5 text-right tabular-nums", r.bold ? "font-semibold" : "")}>{formatMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {pnl && (n(pnl.total.cogs_materials) > 0 || n(pnl.total.cogs_labor) > 0) && (
        <p className="text-xs text-text-tertiary mt-3">
          Production cost of goods (managerial, not a Net Profit deduction on cash basis — supplies are deducted above as purchases):
          materials <span className="tabular-nums text-text-secondary">{formatMoney(n(pnl.total.cogs_materials))}</span>,
          hired labor <span className="tabular-nums text-text-secondary">{formatMoney(n(pnl.total.cogs_labor))}</span>. See Production for per-unit cost.
        </p>
      )}
    </div>
  );
}
