import { useEffect, useMemo, useState } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RechartsChart } from "@/components/ui/RechartsChart";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { formatMoney } from "@/lib/format";
import { businessMonthShort, toBusinessISODate } from "@/lib/dates";
import { fetchCashflow, downloadCsv } from "@/lib/financeReports";

const n = (v: unknown) => Number(v ?? 0);
const yTick = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);

export function CashFlowReport() {
  const { activeOrgId } = useAuth();
  const { addToast } = useApp();
  const [rows, setRows] = useState<{ month: string; money_in: number; money_out: number; net: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    setLoading(true);
    fetchCashflow(activeOrgId)
      .then((r) => { if (!cancelled) { setRows(r ?? []); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeOrgId]);

  const chartData = useMemo(() => rows.map((r) => ({ month: businessMonthShort(r.month), in: n(r.money_in), out: n(r.money_out), net: n(r.net) })), [rows]);

  const exportCsv = () => {
    const data = rows.map((r) => [toBusinessISODate(r.month).slice(0, 7), n(r.money_in).toFixed(2), n(r.money_out).toFixed(2), n(r.net).toFixed(2)]);
    downloadCsv("cash-flow.csv", [["Month", "Money in", "Money out", "Net"], ...data]);
    addToast({ title: "CSV exported", description: "cash-flow.csv", status: "ok" });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium">Cash Flow · trailing 12 months</h2>
        <Button variant="outline" onClick={exportCsv} disabled={loading}><Download className="w-4 h-4" /> Export CSV</Button>
      </div>

      <Card className="p-6 mb-6">
        <div className="h-72">
          <RechartsChart>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
                <XAxis dataKey="month" stroke="var(--color-text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-text-secondary)" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={yTick} />
                <Tooltip cursor={{ fill: "var(--color-bg-hover)", opacity: 0.4 }} formatter={(v: number, name: string) => [formatMoney(Number(v)), name]} />
                <Bar dataKey="in" name="Money in" fill="var(--color-accent-brand)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="out" name="Money out" fill="var(--color-status-alert)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Line type="monotone" dataKey="net" name="Net" stroke="var(--color-text-primary)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </RechartsChart>
        </div>
      </Card>

      <Card className="overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-[11px] uppercase tracking-wide text-text-secondary border-b border-border-subtle">
            <tr>
              <th className="px-4 py-2 font-medium">Month</th>
              <th className="px-4 py-2 font-medium text-right">Money in</th>
              <th className="px-4 py-2 font-medium text-right">Money out</th>
              <th className="px-4 py-2 font-medium text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-b border-border-subtle/50 last:border-0">
                <td className="px-4 py-2">{businessMonthShort(r.month)} {toBusinessISODate(r.month).slice(0, 4)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-status-ok">{formatMoney(r.money_in)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-status-alert">{formatMoney(r.money_out)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{formatMoney(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
