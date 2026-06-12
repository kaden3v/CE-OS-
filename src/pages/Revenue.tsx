import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Info, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { RechartsChart } from "@/components/ui/RechartsChart";
import { EmptyState } from "@/components/ui/StateRenderer";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { formatMoney } from "@/lib/format";
import { businessMonthShort } from "@/lib/dates";
import {
  fetchKpis, fetchRevenueByChannel, fetchRevenueTrend,
  type FinancePeriod, type FinanceWindow, type RevenueChannel, type RevenueTrendPoint,
} from "@/lib/financeReports";

const CHANNEL_COLORS = ["var(--color-accent-brand)", "var(--color-status-info)", "var(--color-status-warn)", "var(--color-border-strong)", "var(--color-status-alert)"];
const n = (v: unknown) => Number(v ?? 0);
const yTick = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);

function PeriodToggle({ period, onChange }: { period: FinancePeriod; onChange: (p: FinancePeriod) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border-subtle bg-bg-base p-0.5 text-sm self-start">
      {(["month", "ytd"] as const).map((p) => (
        <button key={p} onClick={() => onChange(p)} className={cn("px-3 py-1.5 rounded-md transition-colors", period === p ? "bg-bg-active text-text-primary" : "text-text-secondary hover:text-text-primary")}>
          {p === "month" ? "This month" : "Year to date"}
        </button>
      ))}
    </div>
  );
}

export default function Revenue() {
  const { activeOrgId } = useAuth();
  const [period, setPeriod] = useState<FinancePeriod>("month");
  const [kpis, setKpis] = useState<FinanceWindow | null>(null);
  const [channels, setChannels] = useState<RevenueChannel[]>([]);
  const [trend, setTrend] = useState<RevenueTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchKpis(activeOrgId, period), fetchRevenueByChannel(activeOrgId, period), fetchRevenueTrend(activeOrgId)])
      .then(([k, ch, tr]) => {
        if (cancelled) return;
        setKpis(k.current);
        setChannels(ch ?? []);
        setTrend(tr ?? []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeOrgId, period]);

  const channelKeys = useMemo(() => Array.from(new Set(trend.map((t) => t.channel))), [trend]);
  const chartData = useMemo(() => {
    const byMonth = new Map<string, Record<string, number | string>>();
    for (const t of trend) {
      const row = byMonth.get(t.month) ?? { month: businessMonthShort(t.month) };
      row[t.channel] = n(row[t.channel]) + n(t.net);
      byMonth.set(t.month, row);
    }
    return Array.from(byMonth.values());
  }, [trend]);
  const hasTrend = chartData.length > 0 && channelKeys.length > 0;

  const v = (x: number | undefined) => (loading || !kpis ? "—" : formatMoney(x));

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2"><TrendingUp className="w-6 h-6 text-text-secondary" /> Revenue</h1>
          <p className="text-sm text-text-secondary">Sales, refunds, and estimated marketplace fees by channel.</p>
        </div>
        <PeriodToggle period={period} onChange={setPeriod} />
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 mb-6 text-sm text-text-secondary">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-status-info" />
        <span>Fees are estimates based on your configured rates. <Link to="/settings" className="text-accent-brand hover:underline">Edit in Settings</Link>.</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6">
        <StatTile label="Gross sales" value={v(kpis && n(kpis.gross_sales))} />
        <StatTile label="Refunds" value={v(kpis && n(kpis.refunds))} />
        <StatTile label="Estimated fees" value={v(kpis && n(kpis.channel_fees))} />
        <StatTile label="Net revenue" value={v(kpis && n(kpis.net_revenue))} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <h2 className="text-base font-medium mb-4">Net Revenue by Channel · trailing 12 months</h2>
          {!hasTrend ? (
            <EmptyState icon={TrendingUp} title="No sales yet" description="Net revenue by channel will chart here as orders come in." />
          ) : (
            <div className="h-72">
              <RechartsChart>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
                    <XAxis dataKey="month" stroke="var(--color-text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--color-text-secondary)" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={yTick} />
                    <Tooltip cursor={{ fill: "var(--color-bg-hover)", opacity: 0.4 }} formatter={(val: number, name: string) => [formatMoney(Number(val)), name]} />
                    <Legend wrapperStyle={{ fontSize: 12, textTransform: "capitalize" }} />
                    {channelKeys.map((c, i) => (
                      <Bar key={c} dataKey={c} stackId="net" name={c} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} radius={i === channelKeys.length - 1 ? [3, 3, 0, 0] : undefined} maxBarSize={28} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </RechartsChart>
            </div>
          )}
        </Card>

        <Card className="p-6 overflow-auto">
          <h2 className="text-base font-medium mb-4">By Channel</h2>
          {channels.length === 0 ? (
            <p className="text-sm text-text-secondary">No sales in this period.</p>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-[11px] uppercase tracking-wide text-text-secondary border-b border-border-subtle">
                <tr>
                  <th className="py-2 font-medium">Channel</th>
                  <th className="py-2 font-medium text-right">Net</th>
                  <th className="py-2 font-medium text-right">Fee %</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.channel} className="border-b border-border-subtle/50 last:border-0">
                    <td className="py-2 capitalize">{c.channel}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{formatMoney(c.net)}</td>
                    <td className="py-2 text-right tabular-nums text-text-secondary">{n(c.rate).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Full channel detail */}
      {channels.length > 0 && (
        <Card className="p-6 mt-6 overflow-auto">
          <h2 className="text-base font-medium mb-4">Channel detail</h2>
          <table className="w-full min-w-max text-sm text-left">
            <thead className="text-[11px] uppercase tracking-wide text-text-secondary border-b border-border-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">Channel</th>
                <th className="px-3 py-2 font-medium text-right">Gross</th>
                <th className="px-3 py-2 font-medium text-right">Refunds</th>
                <th className="px-3 py-2 font-medium text-right">Est. fees</th>
                <th className="px-3 py-2 font-medium text-right">Net</th>
                <th className="px-3 py-2 font-medium text-right">Effective fee rate</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.channel} className="border-b border-border-subtle/50 last:border-0">
                  <td className="px-3 py-2 capitalize font-medium">{c.channel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(c.gross)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{formatMoney(c.refunds)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{formatMoney(c.fees)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(c.net)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n(c.rate).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
