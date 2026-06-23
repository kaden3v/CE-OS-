import { StatTile } from "@/components/ui/StatTile";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { Badge } from "@/components/ui/Badge";
import { Store, ShoppingBag, CheckCircle2, BarChart3, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { RechartsChart } from "@/components/ui/RechartsChart";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { orderStatusTone } from "@/lib/status";
import { useOrders } from "@/hooks/useOrders";
import { useEntity } from "@/hooks/useEntity";
import { useMonthGoalPace } from "@/hooks/useRevenueGoals";
import { GoalPaceStrip } from "@/components/finances/GoalPaceStrip";
import { formatMoney } from "@/lib/format";
import type { Tables } from "@/lib/database.types";

const COLORS = ['#C2714F', '#8A9A5B', '#4A5D23', '#2C3518'];
const REPORTING_MONTHS = 7;
const TOP_CULTIVAR_COUNT = 4;
const LOW_STOCK_THRESHOLD = 10;
const LICENSE_WARNING_DAYS = 60;
const MS_PER_DAY = 86_400_000;

type Inventory = Tables<"inventory">;
type Shipment = Tables<"shipments">;
type Supply = Tables<"supplies">;
type License = Tables<"licenses">;

type AlertItem = { id: string; href: string; label: string; detail: string; tone: "warn" | "alert" };

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<"operations" | "reporting">("operations");
  const { tasks, toggleTask, setGlobalOrderViewId } = useApp();
  const pendingTasks = tasks.filter(t => !t.completed).slice(0, 5);

  const { data: orders } = useOrders();
  const { data: inventory } = useEntity<Inventory>("inventory", []);
  const { data: shipments } = useEntity<Shipment>("shipments", []);
  const { data: supplies } = useEntity<Supply>("supplies", []);
  const { data: licenses } = useEntity<License>("licenses", []);

  // Current-month finance pace (managers only): one source for the MTD tile and
  // the ambient goal-pace strip, so the dashboard doesn't double-fetch KPIs.
  const { orgRole } = useAuth();
  const canManage = orgRole === "owner" || orgRole === "manager";
  const { pace: monthPace, loading: paceLoading } = useMonthGoalPace();
  const netRevenueMtd = canManage ? (monthPace?.actualNet ?? null) : null;

  // Things that need a human decision: low plant stock, supplies at/below their
  // reorder threshold, licenses expiring inside the warning window.
  const alerts = useMemo<AlertItem[]>(() => {
    const list: AlertItem[] = [];
    inventory.forEach((i) => {
      // Low stock = low SELLABLE stock (sale-ready + specimen); grow-out plants
      // can't cover orders, so they don't count toward availability.
      const saleable = i.stock_juv + i.stock_mat;
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

  const stats = useMemo(() => {
    const activeOrders = orders.filter((o) => ["pending", "processing", "packed"].includes(o.status)).length;
    const plantsInStock = inventory.reduce((s, p) => s + (p.stock_growout ?? 0) + (p.stock_juv ?? 0) + (p.stock_mat ?? 0), 0);
    const pendingShipments = shipments.filter((s) => s.status === "pending" || s.status === "ready").length;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const revenueMtd = orders
      .filter((o) => new Date(o.placed_at) >= monthStart && o.status !== "cancelled" && o.status !== "refunded")
      .reduce((s, o) => s + Number(o.total), 0);
    return { activeOrders, plantsInStock, pendingShipments, revenueMtd };
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

  // Reporting aggregates — computed from real orders (cancelled/refunded excluded).
  const reporting = useMemo(() => {
    const valid = orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded");
    const now = new Date();
    const months: Array<{ name: string; value: number }> = [];
    for (let i = REPORTING_MONTHS - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const value = valid
        .filter((o) => {
          const placed = new Date(o.placed_at);
          return placed >= start && placed < end;
        })
        .reduce((s, o) => s + Number(o.total), 0);
      months.push({ name: start.toLocaleString(undefined, { month: "short" }), value });
    }

    const channelTotals = new Map<string, number>();
    valid.forEach((o) => channelTotals.set(o.channel, (channelTotals.get(o.channel) ?? 0) + Number(o.total)));
    const channels = [...channelTotals.entries()]
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
      .sort((a, b) => b.value - a.value);

    const unitTotals = new Map<string, number>();
    valid.forEach((o) => o.items.forEach((it) => unitTotals.set(it.name_snapshot, (unitTotals.get(it.name_snapshot) ?? 0) + it.qty)));
    const topCultivars = [...unitTotals.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_CULTIVAR_COUNT);
    const totalUnits = [...unitTotals.values()].reduce((s, v) => s + v, 0);

    return { months, channels, topCultivars, totalUnits, hasData: valid.length > 0 };
  }, [orders]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
         <div>
            <h1 className="text-2xl font-semibold mb-2">Overview</h1>
            <p className="text-sm text-text-secondary hidden sm:block">Nursery operations and financial insights.</p>
         </div>
         <div className="flex bg-bg-active border border-border-subtle p-2 rounded-lg">
            <button 
              onClick={() => setViewMode("operations")}
              className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2", viewMode === "operations" ? "bg-bg-elevated shadow-sm text-text-primary" : "text-text-secondary hover:text-text-primary")}
            >
              <LayoutGrid className="w-4 h-4" /> Operations
            </button>
            <button 
              onClick={() => setViewMode("reporting")}
              className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2", viewMode === "reporting" ? "bg-bg-elevated shadow-sm text-text-primary" : "text-text-secondary hover:text-text-primary")}
            >
              <BarChart3 className="w-4 h-4" /> Reporting
            </button>
         </div>
      </div>

      {viewMode === "operations" && (
        <>
          {/* Top Stats — 2×2 on phones so all four fit one screen */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 shrink-0">
            <StatTile label="Active Orders" value={stats.activeOrders.toString()} />
            <StatTile label="Plants in Stock" value={stats.plantsInStock.toLocaleString()} />
            <StatTile label="Pending Shipments" value={stats.pendingShipments.toString()} />
            <StatTile
              label={canManage ? "Net Revenue (MTD)" : "Revenue (MTD)"}
              value={canManage && netRevenueMtd != null ? formatMoney(netRevenueMtd) : formatMoney(stats.revenueMtd)}
            />
          </div>

          {/* Ambient revenue-goal pace (managers only; renders nothing without a goal/data) */}
          {canManage && <div className="shrink-0"><GoalPaceStrip pace={monthPace} loading={paceLoading} /></div>}

          {/* Middle Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 shrink-0">
            {/* Recent Orders */}
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
                          <div className="text-xs text-text-secondary mt-2 flex items-center gap-2 capitalize">
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
                        <div className="text-xs text-text-secondary mt-2">{order.items.length} item{order.items.length !== 1 ? "s" : ""}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            </div>

            {/* Pending Shipments */}
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
          <div className="space-y-4 shrink-0">
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
                      <div className="text-xs text-text-secondary px-2 py-2 rounded bg-bg-active">
                        {task.due}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {viewMode === "reporting" && !reporting.hasData && (
        <Card className="p-12 text-center text-sm text-text-tertiary">
          No order data yet — reporting charts populate as orders come in.
        </Card>
      )}

      {viewMode === "reporting" && reporting.hasData && (
        <div className="flex-1 flex flex-col gap-8 pb-12 overflow-y-auto pr-2">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
              <Card className="p-6 h-[340px] flex flex-col">
                 <h3 className="text-sm font-medium text-text-secondary mb-6">Revenue (last {REPORTING_MONTHS} months)</h3>
                 <div className="flex-1 min-h-0">
                    <RechartsChart>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={reporting.months} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--color-accent-brand)" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="var(--color-accent-brand)" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="name" stroke="var(--color-border-strong)" fontSize={12} tickLine={false} axisLine={false} />
                          <Area type="monotone" dataKey="value" stroke="var(--color-accent-brand)" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </RechartsChart>
                 </div>
              </Card>

              <Card className="p-6 h-[340px] flex flex-col">
                 <h3 className="text-sm font-medium text-text-secondary mb-6">Sales by Channel</h3>
                 <div className="flex-1 min-h-0">
                    <RechartsChart>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reporting.channels} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} layout="vertical">
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" stroke="var(--color-text-secondary)" fontSize={12} tickLine={false} axisLine={false} width={80} />
                          <Bar dataKey="value" fill="var(--color-bg-active)" radius={[0, 4, 4, 0]}>
                             {reporting.channels.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? "var(--color-accent-brand)" : "var(--color-border-strong)"} />
                             ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </RechartsChart>
                 </div>
              </Card>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="p-6 h-[320px] lg:col-span-1 flex flex-col">
                 <h3 className="text-sm font-medium text-text-secondary mb-2">Top Cultivars (Units Sold)</h3>
                 <div className="flex-1 flex items-center justify-center min-h-0 relative">
                    <RechartsChart>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={reporting.topCultivars}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                          >
                            {reporting.topCultivars.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </RechartsChart>
                    {/* Legend */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                       <div className="text-xs text-text-tertiary uppercase tracking-widest">Total</div>
                       <div className="text-xl font-medium">
                         {reporting.totalUnits >= 1000 ? `${(reporting.totalUnits / 1000).toFixed(1)}K` : reporting.totalUnits}
                       </div>
                    </div>
                 </div>
              </Card>

              <Card className="p-6 lg:col-span-2 flex flex-col">
                 <h3 className="text-sm font-medium text-text-secondary mb-6">Revenue by Channel</h3>
                 <div className="flex-1 space-y-3 overflow-y-auto">
                    {reporting.channels.map((c) => {
                      const max = reporting.channels[0]?.value || 1;
                      return (
                        <div key={c.name} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-text-primary">{c.name}</span>
                            <span className="text-text-secondary tabular-nums">${c.value.toFixed(2)}</span>
                          </div>
                          <div className="h-2 rounded bg-bg-active overflow-hidden">
                            <div className="h-full bg-accent-brand" style={{ width: `${(c.value / max) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                 </div>
              </Card>
           </div>
        </div>
      )}
    </div>
  );
}
