import { StatTile } from "@/components/ui/StatTile";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { mockOrders } from "@/lib/mockData";
import { Store, ShoppingBag, ThermometerSun, CheckCircle2, BarChart3, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { RechartsChart } from "@/components/ui/RechartsChart";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useState } from "react";
import { useApp } from "@/contexts/AppContext";

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
const COLORS = ['#C2714F', '#8A9A5B', '#4A5D23', '#2C3518'];

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<"operations" | "reporting">("operations");
  const { tasks, toggleTask } = useApp();
  const pendingTasks = tasks.filter(t => !t.completed).slice(0, 5); // limit to 5 on dash

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
            <StatTile
              label="Active Orders"
              value="42"
              trend={{ value: "3", direction: "up", label: "from last week" }}
            />
            <StatTile
              label="Plants in Stock"
              value="1,248"
            />
            <StatTile
              label="Pending Shipments"
              value="18"
              trend={{ value: "Heat advisory", direction: "down", label: "in 2 zips" }}
            />
            <StatTile
              label="Revenue (MTD)"
              value="$3,240"
              trend={{ value: "12%", direction: "up", sparklineData: [210, 240, 260, 245, 290, 310, 305, 340, 420] }}
            />
          </div>

          {/* Middle Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 shrink-0">
            {/* Recent Orders */}
            <div className="col-span-2 space-y-4">
              <h2 className="text-base font-medium">Recent Orders</h2>
              <Card>
                <div className="p-0">
                  {mockOrders.slice(0, 5).map((order) => (
                    <div key={order.id} className="flex items-center justify-between p-4 border-b border-border-subtle last:border-0 hover:bg-bg-hover transition-colors cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-bg-active flex items-center justify-center text-sm font-medium border border-border-subtle shrink-0">
                          {order.customer.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{order.customer}</span>
                            <StatusDot
                              status={
                                order.status === "Pending" ? "alert" :
                                order.status === "Processing" ? "warn" :
                                order.status === "Packed" ? "info" : "ok"
                              }
                            />
                          </div>
                          <div className="text-xs text-text-secondary mt-2 flex items-center gap-2">
                            <span className="flex items-center gap-2">
                              {order.channel === "Shopify" ? <Store className="w-3 h-3" /> : <ShoppingBag className="w-3 h-3" />}
                              {order.channel}
                            </span>
                            <span>&middot;</span>
                            <span>{order.id}</span>
                            <span>&middot;</span>
                            <span>{order.created}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium whitespace-nowrap">${order.subtotal.toFixed(2)}</div>
                        <div className="text-xs text-text-secondary mt-2">{order.items} item{order.items !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Ship Window Watch */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-medium">Ship-Window Watch</h2>
                <div className="text-xs text-text-tertiary">Next Ship: Monday</div>
              </div>
              <div className="space-y-3">
                {[
                  { id: "ORD-1198", zip: "85001", dest: "Phoenix, AZ", temp: 95, cond: "Sunny", rec: "Hold", windowOpen: false },
                  { id: "ORD-1199", zip: "98101", dest: "Seattle, WA", temp: 65, cond: "Cloudy", rec: "Ship", windowOpen: true },
                  { id: "ORD-1200", zip: "10001", dest: "New York, NY", temp: 72, cond: "Clear", rec: "Ship", windowOpen: true },
                ].map((watch) => (
                  <Card key={watch.id} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-sm font-medium">{watch.dest}</div>
                        <div className="text-xs text-text-tertiary">{watch.id}</div>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <ThermometerSun className="w-3.5 h-3.5 text-text-secondary" />
                          {watch.temp}&deg;F
                        </div>
                        <div className="text-xs text-text-secondary">{watch.cond}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-3 border-t border-border-subtle mt-1">
                      <div className="flex items-center gap-2">
                        <StatusDot status={watch.windowOpen ? "ok" : "alert"} />
                        <span className="text-text-secondary">
                          {watch.windowOpen ? "Window Open this Mon" : "Hold—Window Closed"}
                        </span>
                      </div>
                      <div className={cn("font-medium", watch.windowOpen ? "text-status-ok" : "text-status-alert")}>
                        {watch.rec}
                      </div>
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
