import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Store, ShoppingBag, CheckCircle2 } from "lucide-react";
import { StatTile } from "@/components/ui/StatTile";
import { MetricChip } from "@/components/finances/MetricChip";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { orderStatusTone } from "@/lib/status";
import { useOrders } from "@/hooks/useOrders";
import { useEntity } from "@/hooks/useEntity";
import { useMonthGoalPace } from "@/hooks/useRevenueGoals";
import { useFinanceOverview, type FinanceKpiWindow } from "@/hooks/useFinanceOverview";
import { GoalPaceStrip } from "@/components/finances/GoalPaceStrip";
import { CustomerPulse } from "@/components/dashboard/CustomerPulse";
import { CashflowCard } from "@/components/dashboard/CashflowCard";
import { ChannelMixCard, TopSellersCard } from "@/components/dashboard/SalesCards";
import { channelMix, customerStats, topSellers, windowStats } from "@/lib/dashboardMetrics";
import { trendFor } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import type { Tables } from "@/lib/database.types";

const LOW_STOCK_THRESHOLD = 10;
const LICENSE_WARNING_DAYS = 60;
const MS_PER_DAY = 86_400_000;

type Inventory = Tables<"inventory">;
type Shipment = Tables<"shipments">;
type Supply = Tables<"supplies">;
type License = Tables<"licenses">;

type AlertItem = { id: string; href: string; label: string; detail: string; tone: "warn" | "alert" };

const nz = (v: unknown): number => Number(v ?? 0);

export default function Dashboard() {
  const navigate = useNavigate();
  const { tasks, toggleTask, setGlobalOrderViewId } = useApp();
  const pendingTasks = tasks.filter((t) => !t.completed).slice(0, 5);

  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: inventory } = useEntity<Inventory>("inventory", []);
  const { data: shipments } = useEntity<Shipment>("shipments", []);
  const { data: supplies } = useEntity<Supply>("supplies", []);
  const { data: licenses } = useEntity<License>("licenses", []);

  const { orgRole } = useAuth();
  const canManage = orgRole === "owner" || orgRole === "manager";

  // Server-side money numbers — same RPCs the Finances tab reports, so the two
  // never disagree. Hooks run unconditionally; render is gated on canManage
  // (RLS is the data-level backstop for staff).
  const { kpis, cashflow, loadingKpis, loadingRest } = useFinanceOverview("month");
  const { pace: monthPace, loading: paceLoading } = useMonthGoalPace();

  // One stable "now" per mount keeps the rolling-window memos deterministic.
  const [nowMs] = useState(() => Date.now());

  // Client-side sales & customer aggregates (a few hundred orders — cheap).
  const win = useMemo(() => windowStats(orders, nowMs), [orders, nowMs]);
  const custStats = useMemo(() => customerStats(orders, nowMs), [orders, nowMs]);
  const mix = useMemo(() => channelMix(orders, nowMs), [orders, nowMs]);
  const sellers = useMemo(() => topSellers(orders, nowMs), [orders, nowMs]);

  // Things that need a human decision: low plant stock, supplies at/below their
  // reorder threshold, licenses expiring inside the warning window.
  const alerts = useMemo<AlertItem[]>(() => {
    const list: AlertItem[] = [];
    inventory.forEach((i) => {
      // Low stock = low SELLABLE stock (Sale-Ready); grow-out plants can't cover
      // orders, so they don't count toward availability.
      const saleable = i.stock_juv;
      if (saleable < LOW_STOCK_THRESHOLD) {
        const growing = i.stock_growout > 0 ? ` (${i.stock_growout} growing on)` : "";
        list.push({ id: `inv-${i.id}`, href: "/inventory", label: i.name, detail: `${saleable} sellable left${growing}`, tone: "warn" });
      }
    });
    supplies.forEach((s) => {
      if (s.reorder_threshold != null && Number(s.on_hand) <= Number(s.reorder_threshold)) {
        list.push({ id: `sup-${s.id}`, href: "/finances/supplies", label: s.name, detail: `${s.on_hand}${s.unit ? ` ${s.unit}` : ""} on hand — reorder`, tone: "warn" });
      }
    });
    const now = Date.now();
    licenses.forEach((l) => {
      if (!l.expires_on) return;
      const days = Math.ceil((new Date(l.expires_on).getTime() - now) / MS_PER_DAY);
      if (days < 0) {
        list.push({ id: `lic-${l.id}`, href: "/licenses", label: l.name, detail: `expired ${-days}d ago`, tone: "alert" });
      } else if (days <= LICENSE_WARNING_DAYS) {
        list.push({ id: `lic-${l.id}`, href: "/licenses", label: l.name, detail: `expires in ${days}d`, tone: days <= 14 ? "alert" : "warn" });
      }
    });
    return list;
  }, [inventory, supplies, licenses]);

  const ops = useMemo(() => {
    const activeOrders = orders.filter((o) => ["pending", "processing", "packed"].includes(o.status)).length;
    const sellable = inventory.reduce((s, p) => s + (p.stock_juv ?? 0), 0);
    const pendingShipments = shipments.filter((s) => s.status === "pending" || s.status === "ready").length;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const revenueMtd = orders
      .filter((o) => new Date(o.placed_at) >= monthStart && o.status !== "cancelled" && o.status !== "refunded")
      .reduce((s, o) => s + Number(o.total), 0);
    return { activeOrders, sellable, pendingShipments, revenueMtd };
  }, [orders, inventory, shipments]);

  const recent = orders.slice(0, 5);

  // Open shipments enriched with their order (customer, items, value) and how
  // long they've been waiting — oldest first, since those are the most urgent.
  const watch = useMemo(() => {
    return shipments
      .filter((s) => s.status === "pending" || s.status === "ready")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, 3)
      .map((sh) => {
        const order = orders.find((o) => o.id === sh.order_id) ?? null;
        const ageDays = Math.floor((Date.now() - new Date(sh.created_at).getTime()) / MS_PER_DAY);
        return { sh, order, ageDays };
      });
  }, [shipments, orders]);

  // ---- Finance KPI helpers (manager tiles) --------------------------------
  const cur = kpis?.current;
  const prior = kpis?.prior;
  const money = (sel: (w: FinanceKpiWindow) => number) =>
    loadingKpis || !cur ? "—" : formatMoney(nz(sel(cur)));
  const kpiTrend = (sel: (w: FinanceKpiWindow) => number, higherIsBetter: boolean) =>
    loadingKpis || !cur || !prior ? undefined : trendFor(nz(sel(cur)), nz(sel(prior)), higherIsBetter, "vs last month");
  const marginHint =
    cur && nz(cur.net_revenue) > 0 ? `${((nz(cur.net_profit) / nz(cur.net_revenue)) * 100).toFixed(0)}% margin` : undefined;

  const newCustTrend = useMemo(() => {
    const base = ordersLoading ? undefined : trendFor(custStats.newThisMonth, custStats.newLastMonth, true, "vs last month");
    const spark = custStats.newByMonth.map((m) => m.value);
    return base && spark.length > 1 ? { ...base, sparklineData: spark } : base;
  }, [ordersLoading, custStats]);

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Overview</h1>
          <p className="text-sm text-text-secondary">{today} · the business at a glance.</p>
        </div>
        {canManage && (
          <Link to="/finances" className="text-sm text-text-secondary hover:text-text-primary shrink-0">
            Full financial report →
          </Link>
        )}
      </div>

      {/* KPI row — money for managers, operations for staff */}
      {canManage ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 shrink-0">
          <StatTile
            label="Net Revenue · MTD"
            value={money((w) => w.net_revenue)}
            hint={cur ? `${nz(cur.order_count)} order${nz(cur.order_count) === 1 ? "" : "s"} · after fees` : undefined}
            trend={kpiTrend((w) => w.net_revenue, true)}
            onClick={() => navigate("/finances")}
          />
          <StatTile
            label="Net Profit · MTD"
            value={money((w) => w.net_profit)}
            hint={marginHint}
            trend={kpiTrend((w) => w.net_profit, true)}
            onClick={() => navigate("/finances")}
          />
          <StatTile
            label="Expenses · MTD"
            value={money((w) => w.expenses)}
            trend={kpiTrend((w) => w.expenses, false)}
            onClick={() => navigate("/finances/expenses")}
          />
          <StatTile
            label="New Customers · MTD"
            value={ordersLoading ? "—" : String(custStats.newThisMonth)}
            hint={ordersLoading ? undefined : `${custStats.newLastMonth} last month`}
            trend={newCustTrend}
            onClick={() => navigate("/customers")}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 shrink-0">
          <StatTile label="Active Orders" value={String(ops.activeOrders)} onClick={() => navigate("/orders")} />
          <StatTile label="Sellable Plants" value={ops.sellable.toLocaleString()} onClick={() => navigate("/inventory")} />
          <StatTile label="Pending Shipments" value={String(ops.pendingShipments)} onClick={() => navigate("/shipping")} />
          <StatTile label="Revenue · MTD" value={formatMoney(ops.revenueMtd)} />
        </div>
      )}

      {/* Ambient revenue-goal pace (managers only; renders nothing without a goal/data) */}
      {canManage && <div className="shrink-0"><GoalPaceStrip pace={monthPace} loading={paceLoading} /></div>}

      {/* Secondary metrics — trailing 30 days + live operations */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
        <MetricChip
          label="Orders · 30d"
          value={ordersLoading ? "—" : String(win.orders)}
          hint={ordersLoading ? undefined : `${win.prevOrders} prior 30d`}
          onClick={() => navigate("/orders")}
        />
        <MetricChip
          label="Avg order · 30d"
          value={ordersLoading || win.aov == null ? "—" : formatMoney(win.aov)}
          hint={win.prevAov != null ? `${formatMoney(win.prevAov)} prior` : undefined}
          onClick={() => navigate("/orders")}
        />
        <MetricChip
          label="Units sold · 30d"
          value={ordersLoading ? "—" : String(win.units)}
          onClick={() => navigate("/cultivars")}
        />
        <MetricChip label="Active orders" value={String(ops.activeOrders)} onClick={() => navigate("/orders")} />
        <MetricChip
          label="Pending ships"
          value={String(ops.pendingShipments)}
          tone={watch.some(({ ageDays }) => ageDays >= 7) ? "alert" : undefined}
          onClick={() => navigate("/shipping")}
        />
        <MetricChip label="Sellable plants" value={ops.sellable.toLocaleString()} onClick={() => navigate("/inventory")} />
      </div>

      {/* Money & customers */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 shrink-0">
        {canManage && (
          <div className="lg:col-span-3">
            <CashflowCard cashflow={cashflow} loading={loadingRest} />
          </div>
        )}
        <div className={canManage ? "lg:col-span-2" : "lg:col-span-5"}>
          <CustomerPulse stats={custStats} loading={ordersLoading} />
        </div>
      </div>

      {/* Where sales come from & what sells */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 shrink-0">
        <ChannelMixCard mix={mix} />
        <TopSellersCard sellers={sellers} />
      </div>

      {/* Recent orders & shipping queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 shrink-0">
        <div className="col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">Recent Orders</h2>
            <Link to="/orders" className="text-xs text-text-secondary hover:text-text-primary">View all →</Link>
          </div>
          <Card>
            <div className="p-0">
              {recent.length === 0 && (
                <div className="p-6 text-sm text-text-tertiary text-center">No orders yet. <Link to="/orders" className="text-accent-brand hover:underline">Create one</Link>.</div>
              )}
              {recent.map((order) => (
                <Link key={order.id} to="/orders" className="flex items-center justify-between p-4 border-b border-border-subtle last:border-0 hover:bg-bg-hover transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-bg-active flex items-center justify-center text-sm font-medium border border-border-subtle shrink-0">
                      {(order.customer?.name ?? "??").split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{order.customer?.name ?? "Direct"}</span>
                        <StatusDot status={orderStatusTone(order.status)} />
                      </div>
                      <div className="text-xs text-text-secondary mt-1 flex items-center gap-2 capitalize">
                        <span className="flex items-center gap-2">
                          {order.channel === "shopify" ? <Store className="w-3 h-3" /> : <ShoppingBag className="w-3 h-3" />}
                          {order.channel}
                        </span>
                        <span>·</span>
                        <span className="font-mono text-[11px]">{order.id.slice(0, 8)}</span>
                        <span>·</span>
                        <span>{new Date(order.placed_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium whitespace-nowrap">${Number(order.total).toFixed(2)}</div>
                    <div className="text-xs text-text-secondary mt-1">{order.items.length} item{order.items.length !== 1 ? "s" : ""}</div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">Pending Shipments</h2>
            <Link to="/shipping" className="text-xs text-text-secondary hover:text-text-primary">All →</Link>
          </div>
          <div className="space-y-3">
            {watch.length === 0 && (
              <Card className="p-4 text-sm text-text-tertiary text-center">No shipments queued.</Card>
            )}
            {watch.map(({ sh, order, ageDays }) => (
              <Card key={sh.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{order?.customer?.name ?? `Shipment ${sh.id.slice(0, 8)}`}</span>
                      {order && (
                        <Badge variant={order.channel === "shopify" ? "brand" : "default"} className="capitalize shrink-0">
                          {order.channel}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-text-tertiary mt-0.5">
                      {order ? (
                        <>
                          <span className="font-mono">{order.id.slice(0, 8)}</span>
                          {" · "}
                          <span className="tabular-nums">${Number(order.total).toFixed(2)}</span>
                          {" · "}
                          {new Date(order.placed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </>
                      ) : (
                        <span className="font-mono">{sh.id.slice(0, 8)}</span>
                      )}
                    </div>
                  </div>
                  {order ? (
                    <Link
                      to="/orders"
                      onClick={() => setGlobalOrderViewId(order.id)}
                      className="text-xs text-text-secondary hover:text-text-primary shrink-0"
                    >
                      Open
                    </Link>
                  ) : (
                    <Link to="/shipping" className="text-xs text-text-secondary hover:text-text-primary shrink-0">Open</Link>
                  )}
                </div>
                {order && order.items.length > 0 && (
                  <div className="text-xs text-text-secondary truncate mt-2" title={order.items.map((i) => `${i.qty}× ${i.name_snapshot}`).join(", ")}>
                    {order.items.map((i) => `${i.qty}× ${i.name_snapshot}`).join(", ")}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-xs pt-3 border-t border-border-subtle mt-3">
                  <div className="flex items-center gap-2 capitalize min-w-0">
                    <StatusDot status={sh.weather_hold ? "warn" : "info"} />
                    <span className="text-text-secondary">{sh.status}</span>
                    {sh.weather_hold && <span className="text-status-warn normal-case shrink-0">Weather hold</span>}
                  </div>
                  <div className="flex items-center gap-3 text-text-tertiary shrink-0">
                    {(sh.ship_to_zip || sh.ship_to_state) && (
                      <span>→ {[sh.ship_to_zip, sh.ship_to_state].filter(Boolean).join(" ")}</span>
                    )}
                    <span className={cn("tabular-nums", ageDays >= 7 ? "text-status-alert" : ageDays >= 3 ? "text-status-warn" : "")}>
                      {ageDays <= 0 ? "today" : `${ageDays}d in queue`}
                    </span>
                  </div>
                </div>
                {sh.weather_note && <div className="text-xs text-text-tertiary mt-2">{sh.weather_note}</div>}
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Needs attention */}
      {alerts.length > 0 && (
        <div className="space-y-4 shrink-0">
          <h2 className="text-base font-medium flex items-center gap-2">
            Needs attention
            <span className="text-xs font-normal text-text-tertiary">({alerts.length})</span>
          </h2>
          <Card>
            <div className="divide-y divide-border-subtle/50">
              {alerts.map((a) => (
                <Link key={a.id} to={a.href} className="flex items-center justify-between p-3 hover:bg-bg-hover transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusDot status={a.tone} />
                    <span className="text-sm font-medium truncate">{a.label}</span>
                  </div>
                  <span className={`text-xs whitespace-nowrap ${a.tone === "alert" ? "text-status-alert" : "text-status-warn"}`}>{a.detail}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Bottom Tasks */}
      <div className="space-y-4 shrink-0 pb-8">
        <h2 className="text-base font-medium">Pending Tasks</h2>
        <Card>
          <div className="p-2 min-h-[48px]">
            {pendingTasks.length === 0 && (
              <div className="text-center py-4 text-sm text-text-tertiary">
                All caught up for now!
              </div>
            )}
            {pendingTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 p-2 hover:bg-bg-hover rounded-lg transition-colors cursor-pointer group" onClick={() => toggleTask(task.id)}>
                <div className="w-5 h-5 rounded-full border border-border-strong flex items-center justify-center group-hover:border-status-ok group-hover:text-status-ok transition-colors">
                  <CheckCircle2 className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                </div>
                <div className="flex-1 text-sm">{task.title}</div>
                {task.due !== "No date" && (
                  <div className="text-xs text-text-secondary px-2 py-1 rounded bg-bg-active">
                    {task.due}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
