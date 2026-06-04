import { StatTile } from "@/components/ui/StatTile";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { Store, ShoppingBag, CheckCircle2, BarChart3, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { RechartsChart } from "@/components/ui/RechartsChart";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useApp } from "@/contexts/AppContext";
import { useOrders } from "@/hooks/useOrders";
import { useEntity } from "@/hooks/useEntity";
import type { Tables } from "@/lib/database.types";

const REVENUE_DATA = [
  { name: 'Jan', value: 2400 }, { name: 'Feb', value: 1398 }, { name: 'Mar', value: 4800 },
  { name: 'Apr', value: 3908 }, { name: 'May', value: 4800 }, { name: 'Jun', value: 3800 },
  { name: 'Jul', value: 4300 }
];

const CHANNEL_DATA = [
  { name: 'Shopify', value: 450 }, { name: 'Etsy', value: 320 }, { name: 'Wholesale', value: 150 }
];

const CULTIVAR_DATA = [
  { name: "'Pirouette'", value: 400 }, { name: "'El Lobo'", value: 300 }, { name: 'gigantea', value: 300 }, { name: 'esseriana', value: 200 }
];
// Data-viz earth tones — sourced from @theme tokens (src/index.css)
const COLORS = [
  'var(--color-viz-terracotta)',
  'var(--color-viz-olive)',
  'var(--color-viz-moss)',
  'var(--color-viz-pine)',
];

type Inventory = Tables<"inventory">;
type Shipment = Tables<"shipments">;

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<"operations" | "reporting">("operations");
  const { tasks, toggleTask } = useApp();
  const pendingTasks = tasks.filter(t => !t.completed).slice(0, 5);

  const { data: orders } = useOrders();
  const { data: inventory } = useEntity<Inventory>("inventory", []);
  const { data: shipments } = useEntity<Shipment>("shipments", []);

  const stats = useMemo(() => {
    const activeOrders = orders.filter((o) => ["pending", "processing", "packed"].includes(o.status)).length;
    const plantsInStock = inventory.reduce((s, p) => s + (p.stock_juv ?? 0) + (p.stock_mat ?? 0) + (p.stock_flower ?? 0), 0);
    const pendingShipments = shipments.filter((s) => s.status === "pending" || s.status === "ready").length;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const revenueMtd = orders
      .filter((o) => new Date(o.placed_at) >= monthStart && o.status !== "cancelled" && o.status !== "refunded")
      .reduce((s, o) => s + Number(o.total), 0);
    return { activeOrders, plantsInStock, pendingShipments, revenueMtd };
  }, [orders, inventory, shipments]);

  const recent = orders.slice(0, 5);
  const watch = shipments.filter((s) => s.status === "pending" || s.status === "ready").slice(0, 3);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 flex flex-col h-full">
      <div className="flex items-center justify-between shrink-0">
         <div>
            <h1 className="text-2xl font-semibold mb-2">Overview</h1>
            <p className="text-sm text-text-secondary">Nursery operations and financial insights.</p>
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
          {/* Top Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
            <StatTile label="Active Orders" value={stats.activeOrders.toString()} />
            <StatTile label="Plants in Stock" value={stats.plantsInStock.toLocaleString()} />
            <StatTile label="Pending Shipments" value={stats.pendingShipments.toString()} />
            <StatTile label="Revenue (MTD)" value={`$${stats.revenueMtd.toFixed(2)}`} />
          </div>

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
                            <StatusDot
                              status={
                                order.status === "pending" ? "alert" :
                                order.status === "processing" ? "warn" :
                                order.status === "packed" ? "info" : "ok"
                              }
                            />
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
                {watch.map((sh) => (
                  <Card key={sh.id} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-sm font-medium font-mono">{sh.id.slice(0, 8)}</div>
                        <div className="text-xs text-text-tertiary">{sh.ship_to_state ? `${sh.ship_to_zip ?? ""} ${sh.ship_to_state}` : sh.carrier ?? "—"}</div>
                      </div>
                      <Link to="/shipping" className="text-xs text-text-secondary hover:text-text-primary">Open</Link>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-3 border-t border-border-subtle mt-1 capitalize">
                      <div className="flex items-center gap-2">
                        <StatusDot status={sh.weather_hold ? "warn" : "info"} />
                        <span className="text-text-secondary">{sh.status}</span>
                      </div>
                      {sh.weather_hold && <span className="text-status-warn">Weather hold</span>}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>

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
                    {task.due && task.due !== "No date" && (
                      <div className="text-xs text-text-secondary px-2 py-0.5 rounded bg-bg-active">
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

      {viewMode === "reporting" && (
        <div className="flex-1 flex flex-col gap-8 pb-12 overflow-y-auto pr-2">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
              <Card className="p-6 h-[340px] flex flex-col">
                 <h3 className="text-sm font-medium text-text-secondary mb-6">Revenue Growth (YTD)</h3>
                 <div className="flex-1 min-h-0">
                    <RechartsChart>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={REVENUE_DATA} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
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
                        <BarChart data={CHANNEL_DATA} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} layout="vertical">
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" stroke="var(--color-text-secondary)" fontSize={12} tickLine={false} axisLine={false} width={80} />
                          <Bar dataKey="value" fill="var(--color-bg-active)" radius={[0, 4, 4, 0]}>
                             {CHANNEL_DATA.map((entry, index) => (
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
                 <h3 className="text-sm font-medium text-text-secondary mb-2">Top Cultivars (Units)</h3>
                 <div className="flex-1 flex items-center justify-center min-h-0 relative">
                    <RechartsChart>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={CULTIVAR_DATA}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                          >
                            {CULTIVAR_DATA.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </RechartsChart>
                    {/* Legend */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                       <div className="text-xs text-text-tertiary uppercase tracking-widest">Total</div>
                       <div className="text-xl font-medium">1.2K</div>
                    </div>
                 </div>
              </Card>

              <Card className="p-6 lg:col-span-2 flex flex-col">
                 <h3 className="text-sm font-medium text-text-secondary mb-6">Customer Cohort Retention</h3>
                 <div className="flex-1 overflow-x-auto">
                    <div className="min-w-[600px]">
                       <div className="flex text-xs text-text-tertiary mb-2 font-mono">
                          <div className="w-[100px] shrink-0"></div>
                          {Array.from({length: 12}).map((_, i) => <div key={i} className="flex-1 text-center">Mo {i+1}</div>)}
                       </div>
                       <div className="space-y-1">
                          {["Jan", "Feb", "Mar", "Apr", "May"].map((month, mIdx) => (
                             <div key={month} className="flex text-xs font-mono items-center">
                                <div className="w-[100px] shrink-0 font-medium text-text-secondary">{month} <span className="opacity-50">({120 - mIdx*10})</span></div>
                                {Array.from({length: 12}).map((_, i) => {
                                   if (i > 11 - mIdx) return <div key={i} className="flex-1 m-2 h-6 rounded bg-transparent"></div>;
                                   const val = Math.max(5, 100 - (i * 15) - (mIdx * 5) + Math.random() * 10);
                                   return (
                                     <div key={i} className="flex-1 m-2 h-6 rounded border border-border-subtle relative group flex items-center justify-center cursor-help">
                                        <div className="absolute inset-0 bg-accent-brand" style={{ opacity: val / 100 }}></div>
                                        <div className="relative z-10 opacity-0 group-hover:opacity-100 font-medium">{val.toFixed(0)}%</div>
                                     </div>
                                   )
                                })}
                             </div>
                          ))}
                       </div>
                    </div>
                 </div>
              </Card>
           </div>
        </div>
      )}
    </div>
  );
}
