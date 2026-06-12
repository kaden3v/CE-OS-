import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Receipt, Factory, PackageOpen, Car, Plus, AlertTriangle, Clock, RefreshCw,
  CalendarClock, CheckCircle2, ChevronRight, PieChart,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { RechartsChart } from "@/components/ui/RechartsChart";
import { EmptyState } from "@/components/ui/StateRenderer";
import { formatMoney } from "@/lib/format";
import { todayISO, businessMonthShort, formatBusinessDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  useFinanceOverview, type FinancePeriod, type FinanceKpiWindow,
} from "@/hooks/useFinanceOverview";

const n = (v: unknown): number => Number(v ?? 0);

// ---------------------------------------------------------------------------
// Period toggle (segmented control)
// ---------------------------------------------------------------------------
function PeriodToggle({ period, onChange }: { period: FinancePeriod; onChange: (p: FinancePeriod) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border-subtle bg-bg-base p-0.5 text-sm self-start">
      {(["month", "ytd"] as const).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          aria-pressed={period === p}
          className={cn(
            "px-3 py-1.5 rounded-md transition-colors",
            period === p ? "bg-bg-active text-text-primary" : "text-text-secondary hover:text-text-primary",
          )}
        >
          {p === "month" ? "This month" : "Year to date"}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI deltas — green means "better than the prior period", whichever direction
// that is for the metric (revenue/profit up = good; expenses/COGS down = good).
// ---------------------------------------------------------------------------
function trendFor(
  cur: number,
  prior: number,
  higherIsBetter: boolean,
  periodLabel: string,
): { value: string; direction: "up" | "down"; label: string } | undefined {
  const improved = higherIsBetter ? cur >= prior : cur <= prior;
  if (prior === 0) {
    if (cur === 0) return undefined;
    return { value: "new", direction: improved ? "up" : "down", label: periodLabel };
  }
  const pct = ((cur - prior) / Math.abs(prior)) * 100;
  const sign = pct > 0 ? "+" : "";
  return { value: `${sign}${pct.toFixed(0)}%`, direction: improved ? "up" : "down", label: periodLabel };
}

function KpiCards({
  cur, prior, loading, period,
}: { cur: FinanceKpiWindow | undefined; prior: FinanceKpiWindow | undefined; loading: boolean; period: FinancePeriod }) {
  const periodLabel = period === "month" ? "vs last month" : "vs last year";
  const v = (x: number | undefined) => (loading || cur === undefined ? "—" : formatMoney(x));
  const t = (sel: (w: FinanceKpiWindow) => number, higherIsBetter: boolean) =>
    loading || !cur || !prior ? undefined : trendFor(n(sel(cur)), n(sel(prior)), higherIsBetter, periodLabel);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
      <StatTile label="Net Revenue" value={v(cur && n(cur.net_revenue))} trend={t((w) => n(w.net_revenue), true)} />
      <StatTile label="Total Expenses" value={v(cur && n(cur.expenses))} trend={t((w) => n(w.expenses), false)} />
      <StatTile label="COGS" value={v(cur && n(cur.cogs))} hint="Production cost · not in net profit" trend={t((w) => n(w.cogs), false)} />
      <StatTile label="Net Profit" value={v(cur && n(cur.net_profit))} trend={t((w) => n(w.net_profit), true)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cash flow chart
// ---------------------------------------------------------------------------
const yTick = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);

function CashflowChart({ data }: { data: { month: string; in: number; out: number; net: number }[] }) {
  const hasFlow = data.some((d) => d.in !== 0 || d.out !== 0);
  if (!hasFlow) {
    return (
      <EmptyState
        icon={PieChart}
        title="No cash flow yet"
        description="Sales, expenses, and supply purchases will chart here as they're logged."
      />
    );
  }
  return (
    <div className="h-72">
      <RechartsChart>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
            <XAxis dataKey="month" stroke="var(--color-text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--color-text-secondary)" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={yTick} />
            <Tooltip
              cursor={{ fill: "var(--color-bg-hover)", opacity: 0.4 }}
              formatter={(value: number, name: string) => [formatMoney(Number(value)), name]}
            />
            <Bar dataKey="in" name="Money in" fill="var(--color-accent-brand)" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Bar dataKey="out" name="Money out" fill="var(--color-status-alert)" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Line type="monotone" dataKey="net" name="Net" stroke="var(--color-text-primary)" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </RechartsChart>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
function AlertRow({
  to, icon: Icon, tone, title, detail, amount,
}: {
  to: string; icon: typeof AlertTriangle; tone: "alert" | "warn" | "info";
  title: string; detail: string; amount?: string;
}) {
  const toneColor = tone === "alert" ? "text-status-alert" : tone === "warn" ? "text-status-warn" : "text-status-info";
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-hover transition-colors group"
    >
      <Icon className={cn("w-4 h-4 shrink-0", toneColor)} strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-text-primary truncate">{title}</div>
        <div className="text-xs text-text-tertiary truncate">{detail}</div>
      </div>
      {amount && <span className="text-sm tabular-nums text-text-secondary">{amount}</span>}
      <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-secondary shrink-0" />
    </Link>
  );
}

/** Next quarterly estimated-tax due date within 30 days, computed in Phoenix time. */
function useTaxDue(): { date: Date; days: number } | null {
  return useMemo(() => {
    const today = new Date(`${todayISO()}T00:00:00`);
    const y = today.getFullYear();
    const candidates = [
      new Date(y, 0, 15), new Date(y, 3, 15), new Date(y, 5, 15), new Date(y, 8, 15), new Date(y + 1, 0, 15),
    ];
    const DAY = 86400000;
    for (const d of candidates) {
      const days = Math.ceil((d.getTime() - today.getTime()) / DAY);
      if (days >= 0 && days <= 30) return { date: d, days };
    }
    return null;
  }, []);
}

function AlertsPanel({
  alerts, loading,
}: { alerts: ReturnType<typeof useFinanceOverview>["alerts"]; loading: boolean }) {
  const taxDue = useTaxDue();
  const total =
    (alerts?.renewing.length ?? 0) +
    (alerts?.overdue.length ?? 0) +
    (alerts?.low_stock.length ?? 0) +
    (alerts?.uncategorized.length ?? 0) +
    (taxDue ? 1 : 0);

  if (loading) {
    return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-bg-base animate-pulse" />)}</div>;
  }

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <CheckCircle2 className="w-10 h-10 text-status-ok mb-3" strokeWidth={1.5} />
        <div className="text-sm font-medium text-text-primary">All clear</div>
        <div className="text-xs text-text-secondary mt-1">No renewals, low stock, or untagged expenses.</div>
      </div>
    );
  }

  return (
    <div className="space-y-1 -mx-1">
      {taxDue && (
        <AlertRow
          to="/finances/tax-report"
          icon={CalendarClock}
          tone="warn"
          title="Estimated tax due soon"
          detail={`${formatBusinessDate(taxDue.date)} · in ${taxDue.days} day${taxDue.days === 1 ? "" : "s"}`}
        />
      )}
      {alerts?.overdue.map((s) => (
        <AlertRow
          key={`ov-${s.id}`}
          to="/finances/subscriptions"
          icon={AlertTriangle}
          tone="alert"
          title={`${s.name} — renewal passed`}
          detail={`Was due ${formatBusinessDate(s.next_renewal)} · no charge logged`}
          amount={formatMoney(n(s.amount))}
        />
      ))}
      {alerts?.renewing.map((s) => (
        <AlertRow
          key={`rn-${s.id}`}
          to="/finances/subscriptions"
          icon={RefreshCw}
          tone="info"
          title={`${s.name} renews soon`}
          detail={`Renews ${formatBusinessDate(s.next_renewal)}`}
          amount={formatMoney(n(s.amount))}
        />
      ))}
      {alerts?.low_stock.map((su) => (
        <AlertRow
          key={`ls-${su.id}`}
          to="/finances/supplies"
          icon={PackageOpen}
          tone="warn"
          title={`${su.name} low`}
          detail={`${n(su.on_hand)}${su.unit ? ` ${su.unit}` : ""} on hand · reorder at ${n(su.reorder_threshold)}`}
        />
      ))}
      {alerts?.uncategorized.map((e) => (
        <AlertRow
          key={`uc-${e.id}`}
          to="/finances/expenses"
          icon={Clock}
          tone="info"
          title={`Missing ${e.missing}`}
          detail={`${e.description ?? "Expense"} · ${formatBusinessDate(e.occurred_on)}`}
          amount={formatMoney(n(e.amount))}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick actions — reuse existing page modals via nav state where they exist.
// ---------------------------------------------------------------------------
function QuickActions() {
  const navigate = useNavigate();
  const actions: { label: string; icon: typeof Receipt; to: string; openNew: boolean }[] = [
    { label: "Log Expense", icon: Receipt, to: "/finances/expenses", openNew: true },
    { label: "Log Production Run", icon: Factory, to: "/finances/production", openNew: true },
    { label: "Log Supply Purchase", icon: PackageOpen, to: "/finances/supplies", openNew: true },
    { label: "Log Mileage", icon: Car, to: "/finances/mileage", openNew: false },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button
          key={a.label}
          variant="default"
          onClick={() => navigate(a.to, a.openNew ? { state: { openNew: true } } : undefined)}
        >
          <a.icon className="w-4 h-4" strokeWidth={1.5} />
          {a.label}
        </Button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function FinancesOverview() {
  const [period, setPeriod] = useState<FinancePeriod>("month");
  const { kpis, cashflow, alerts, loadingKpis, loadingRest } = useFinanceOverview(period);

  const chartData = useMemo(
    () =>
      cashflow.map((c) => ({
        month: businessMonthShort(c.month),
        in: n(c.money_in),
        out: n(c.money_out),
        net: n(c.net),
      })),
    [cashflow],
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Finances</h1>
          <p className="text-sm text-text-secondary">Revenue, costs, and what needs attention.</p>
        </div>
        <PeriodToggle period={period} onChange={setPeriod} />
      </div>

      <div className="mb-6">
        <QuickActions />
      </div>

      <div className="mb-6">
        <KpiCards cur={kpis?.current} prior={kpis?.prior} loading={loadingKpis} period={period} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-medium">Cash Flow</h2>
            <div className="flex items-center gap-4 text-xs text-text-secondary">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent-brand" /> In</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-status-alert" /> Out</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-text-primary" /> Net</span>
            </div>
          </div>
          {loadingRest ? (
            <div className="h-72 rounded-lg bg-bg-base animate-pulse" />
          ) : (
            <CashflowChart data={chartData} />
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-medium mb-4">Needs Attention</h2>
          <AlertsPanel alerts={alerts} loading={loadingRest} />
        </Card>
      </div>
    </div>
  );
}
