import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Receipt, Factory, PackageOpen, Car, Plus, AlertTriangle, Clock, RefreshCw,
  CalendarClock, CheckCircle2, ChevronRight, PieChart, Target,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { RechartsChart } from "@/components/ui/RechartsChart";
import { EmptyState } from "@/components/ui/StateRenderer";
import { PeriodToggle } from "@/components/finances/PeriodToggle";
import { formatMoney } from "@/lib/format";
import { todayISO, businessMonthShort, formatBusinessDate, monthStartISO, yearStartISO, toBusinessISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { quarterlyEstimate, trendFor } from "@/lib/finance";
import {
  useFinanceOverview, nextDayISO, type FinancePeriod, type FinanceKpiWindow,
} from "@/hooks/useFinanceOverview";
import { useOrders } from "@/hooks/useOrders";
import { useEntity } from "@/hooks/useEntity";
import type { Expense } from "@/components/expenses/types";
import { MetricChip } from "@/components/finances/MetricChip";
import { StatDetailModal } from "@/components/finances/StatDetailModal";
import { buildStatDetail, type StatKey } from "@/lib/financeStatDetails";
import { useMonthGoalPace } from "@/hooks/useRevenueGoals";
import { paceSeverity } from "@/lib/revenueGoals";

// Default income-tax rate for the set-aside hint; the real rate is configurable
// on the Quarterly Estimates tab. Kept conservative so K over-reserves, not under.
const DEFAULT_INCOME_RATE = 12;

const n = (v: unknown): number => Number(v ?? 0);

interface TrendSeries { netRevenue: number[]; netProfit: number[]; expenses: number[] }

function KpiCards({
  cur, prior, loading, period, series, onOpen,
}: {
  cur: FinanceKpiWindow | undefined;
  prior: FinanceKpiWindow | undefined;
  loading: boolean;
  period: FinancePeriod;
  series: TrendSeries;
  onOpen: (k: StatKey) => void;
}) {
  const periodLabel = period === "month" ? "vs last month" : "vs last year";
  const v = (x: number | undefined) => (loading || cur === undefined ? "—" : formatMoney(x));
  const t = (sel: (w: FinanceKpiWindow) => number, higherIsBetter: boolean) =>
    loading || !cur || !prior ? undefined : trendFor(n(sel(cur)), n(sel(prior)), higherIsBetter, periodLabel);
  // Attach a trailing-12-month sparkline to a trend (skip if too few points).
  const spark = (tr: ReturnType<typeof t>, data: number[]) =>
    tr && data.length > 1 ? { ...tr, sparklineData: data } : tr;

  const marginHint =
    cur && n(cur.net_revenue) > 0 ? `${((n(cur.net_profit) / n(cur.net_revenue)) * 100).toFixed(0)}% margin` : undefined;
  const aov =
    loading || !cur ? "—" : n(cur.order_count) > 0 ? formatMoney(n(cur.net_revenue) / n(cur.order_count)) : "—";
  const ordersHint = cur ? `${n(cur.order_count)} order${n(cur.order_count) === 1 ? "" : "s"}` : undefined;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
      <StatTile label="Net Revenue" value={v(cur && n(cur.net_revenue))} hint="Plant sales, after fees" trend={spark(t((w) => n(w.net_revenue), true), series.netRevenue)} onClick={() => onOpen("net_revenue")} />
      <StatTile label="Net Profit" value={v(cur && n(cur.net_profit))} hint={marginHint} trend={spark(t((w) => n(w.net_profit), true), series.netProfit)} onClick={() => onOpen("net_profit")} />
      <StatTile label="Total Expenses" value={v(cur && n(cur.expenses))} trend={spark(t((w) => n(w.expenses), false), series.expenses)} onClick={() => onOpen("total_expenses")} />
      <StatTile label="Avg Order Value" value={aov} hint={ordersHint} onClick={() => onOpen("avg_order_value")} />
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
  alerts, loading, paceAlert,
}: {
  alerts: ReturnType<typeof useFinanceOverview>["alerts"];
  loading: boolean;
  paceAlert?: { tone: "warn" | "alert"; detail: string } | null;
}) {
  const taxDue = useTaxDue();
  const total =
    (alerts?.renewing.length ?? 0) +
    (alerts?.overdue.length ?? 0) +
    (alerts?.low_stock.length ?? 0) +
    (alerts?.uncategorized.length ?? 0) +
    (taxDue ? 1 : 0) +
    (paceAlert ? 1 : 0);

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
      {paceAlert && (
        <AlertRow
          to="/finances/goals"
          icon={Target}
          tone={paceAlert.tone}
          title="Revenue goal off pace"
          detail={paceAlert.detail}
        />
      )}
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
const inWindow = (iso: string, w: { from: string; to: string }) => iso >= w.from && iso < w.to;

/** The same [start, end) window the KPIs use — end is exclusive (tomorrow), so
 *  drill-down line items reconcile to the displayed tile on the current day. */
function overviewWindow(period: FinancePeriod): { from: string; to: string } {
  return { from: period === "ytd" ? yearStartISO() : monthStartISO(), to: nextDayISO(todayISO()) };
}

export default function FinancesOverview() {
  const [period, setPeriod] = useState<FinancePeriod>("month");
  const { kpis, breakdown, cashflow, alerts, loadingKpis, loadingRest } = useFinanceOverview(period);

  // Stat drill-downs: which stat's detail modal is open, plus the raw orders +
  // expenses behind the figures (fetched once, sliced to the active window).
  const [openStat, setOpenStat] = useState<StatKey | null>(null);
  const { data: allOrders, isLoading: ordersLoading } = useOrders();
  const { data: allExpenses, isLoading: expensesLoading } = useEntity<Expense>("expenses", []);

  // Proactive off-pace nudge for the current month (independent of the period
  // toggle). Only fires once the projection is confident and the month is behind.
  const { pace: monthPace } = useMonthGoalPace();
  const monthSev = monthPace ? paceSeverity(monthPace) : "none";
  const paceAlert =
    monthPace?.hasGoal && monthPace.confident && monthSev !== "ok"
      ? {
          tone: (monthSev === "alert" ? "alert" : "warn") as "warn" | "alert",
          detail: `On pace to finish ${formatMoney(Math.abs(monthPace.projectedDelta))} short${monthPace.daysRemaining > 0 ? ` · ${formatMoney(monthPace.neededPerDay)}/day for ${monthPace.daysRemaining}d` : ""}`,
        }
      : null;

  const cur = kpis?.current;
  // Shipping margin: what the buyer paid for shipping minus what postage cost.
  const postage = breakdown.find((b) => /shipping/i.test(b.category))?.total ?? 0;
  const shippingMargin = cur ? n(cur.shipping_collected) - n(postage) : 0;
  // Income tax to set aside on the period's profit (SE + income, conservative).
  const setAside = cur ? quarterlyEstimate(n(cur.net_profit), DEFAULT_INCOME_RATE).total : 0;

  // Trailing-12-month sparklines for the KPI tiles, derived from the cash-flow
  // series (money_in = net revenue, net = net profit, money_out = expenses).
  const series = useMemo(
    () => ({
      netRevenue: cashflow.map((c) => n(c.money_in)),
      netProfit: cashflow.map((c) => n(c.net)),
      expenses: cashflow.map((c) => n(c.money_out)),
    }),
    [cashflow],
  );

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

  // Orders/expenses sliced to the active window for the drill-down line items.
  // Cancelled orders are dropped (the server excludes them from every sum);
  // refunded orders stay so the modal can show them netting out.
  const win = useMemo(() => overviewWindow(period), [period]);
  const windowOrders = useMemo(
    () => allOrders.filter((o) => o.status !== "cancelled" && inWindow(toBusinessISODate(o.placed_at), win)),
    [allOrders, win],
  );
  const windowExpenses = useMemo(
    () => allExpenses.filter((e) => inWindow(e.occurred_on, win)),
    [allExpenses, win],
  );
  const detail = useMemo(
    () =>
      openStat
        ? buildStatDetail(openStat, {
            current: cur, prior: kpis?.prior, breakdown, cashflow, period, windowOrders, windowExpenses,
          })
        : null,
    [openStat, cur, kpis?.prior, breakdown, cashflow, period, windowOrders, windowExpenses],
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Finances</h1>
          <p className="text-sm text-text-secondary">Revenue, costs, and what needs attention.</p>
        </div>
        <PeriodToggle<FinancePeriod> period={period} onChange={setPeriod} options={[{ value: "month", label: "This month" }, { value: "ytd", label: "Year to date" }]} />
      </div>

      <div className="mb-6">
        <QuickActions />
      </div>

      <div className="mb-4">
        <KpiCards cur={cur} prior={kpis?.prior} loading={loadingKpis} period={period} series={series} onOpen={setOpenStat} />
      </div>

      {/* Secondary unit economics + tax accrual */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-3">
        <MetricChip label="Orders" value={loadingKpis || !cur ? "—" : String(n(cur.order_count))} onClick={() => setOpenStat("orders")} />
        <MetricChip
          label="Shipping margin"
          value={loadingKpis || !cur ? "—" : formatMoney(shippingMargin)}
          tone={!loadingKpis && cur && shippingMargin < 0 ? "alert" : "ok"}
          hint={loadingKpis || !cur ? undefined : `${formatMoney(n(cur.shipping_collected))} in − ${formatMoney(postage)} postage`}
          onClick={() => setOpenStat("shipping_margin")}
        />
        <MetricChip label="Gross receipts" value={loadingKpis || !cur ? "—" : formatMoney(n(cur.gross_receipts))} hint="Plant sales + shipping (tax basis)" onClick={() => setOpenStat("gross_receipts")} />
        <MetricChip
          label="Sales tax to remit"
          value={loadingKpis || !cur ? "—" : formatMoney(n(cur.sales_tax_owed))}
          hint="Direct sales (AZ TPT); Etsy remits its own"
          onClick={() => setOpenStat("sales_tax")}
        />
      </div>

      {/* Income-tax set-aside nudge */}
      <Link
        to="/finances/reports?tab=quarterly"
        className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 mb-6 text-sm hover:border-border-strong transition-colors"
      >
        <span className="text-text-secondary">
          Set aside <span className="text-text-primary tabular-nums font-medium">{loadingKpis || !cur ? "—" : formatMoney(setAside)}</span> for income tax
          <span className="text-text-tertiary"> · est. on {period === "month" ? "this month's" : "this year's"} profit at ~{DEFAULT_INCOME_RATE}%</span>
        </span>
        <span className="text-accent-brand shrink-0">Refine →</span>
      </Link>

      <Card className="p-6 mb-6">
        <h2 className="text-base font-medium mb-4">Needs Attention</h2>
        <AlertsPanel alerts={alerts} loading={loadingRest} paceAlert={paceAlert} />
      </Card>

      <Card className="p-6">
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

      <StatDetailModal
        open={openStat !== null}
        onClose={() => setOpenStat(null)}
        detail={detail}
        loadingLineItems={ordersLoading || expensesLoading}
        waterfall={{ win: cur, breakdown }}
      />
    </div>
  );
}
