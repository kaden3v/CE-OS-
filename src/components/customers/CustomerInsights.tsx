import { Users, Crown } from "lucide-react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from "recharts";
import { Card } from "@/components/ui/Card";
import { RechartsChart } from "@/components/ui/RechartsChart";
import { MiniStat } from "@/components/dashboard/MiniStat";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CustomerStats } from "@/lib/dashboardMetrics";

const pct = (v: number | null): string => (v == null ? "—" : `${Math.round(v * 100)}%`);

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";

interface CustomerInsightsProps {
  /** 12-month customerStats over the loaded orders. */
  stats: CustomerStats;
  /** Directory size (includes prospects who never ordered). */
  directoryCount: number;
  loading: boolean;
  /** Open a customer's detail panel (top-customer rows click through). */
  onSelectCustomer: (id: string) => void;
}

/**
 * Dashboard band for the Customers page, in the Overview's Customer Pulse
 * style: acquisition stats + a 12-month new-customer chart on the left, the
 * highest-spending recent customers on the right.
 */
export function CustomerInsights({ stats, directoryCount, loading, onSelectCustomer }: CustomerInsightsProps) {
  const hasAny = stats.totalCustomers > 0;
  const prospects = Math.max(0, directoryCount - stats.totalCustomers);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
      <Card className="p-5 lg:col-span-3 flex flex-col">
        <h3 className="text-sm font-medium text-text-secondary flex items-center gap-2 mb-4">
          <Users className="w-4 h-4" /> Customer base
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <MiniStat
            label="Customers"
            value={loading ? "—" : String(stats.totalCustomers)}
            hint={loading ? undefined : prospects > 0 ? `+${prospects} never ordered` : "all have ordered"}
          />
          <MiniStat
            label="New · this mo"
            value={loading ? "—" : String(stats.newThisMonth)}
            hint={loading ? undefined : `${stats.newLastMonth} last month`}
          />
          <MiniStat
            label="Repeat rate"
            value={loading ? "—" : pct(stats.repeatRate)}
            hint={loading ? undefined : `${stats.repeatCustomers} of ${stats.totalCustomers} reordered`}
          />
          <MiniStat
            label="Returning · 30d"
            value={loading ? "—" : pct(stats.returningShare30)}
            hint="share of recent orders"
          />
        </div>
        <div className="h-32 flex-1">
          {hasAny ? (
            <RechartsChart>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.newByMonth} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" stroke="var(--color-text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                    {stats.newByMonth.map((m, i) => (
                      <Cell
                        key={m.label + i}
                        fill={i === stats.newByMonth.length - 1 ? "var(--color-accent-brand)" : "var(--color-border-strong)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </RechartsChart>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-text-tertiary">
              New-customer trend appears as orders come in.
            </div>
          )}
        </div>
        <div className="text-[10px] text-text-tertiary mt-1">New customers by month (first order) · last 12 months</div>
      </Card>

      <Card className="p-5 lg:col-span-2 flex flex-col">
        <h3 className="text-sm font-medium text-text-secondary flex items-center gap-2 mb-4">
          <Crown className="w-4 h-4" /> Top customers · 90d
        </h3>
        {stats.topCustomers90.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-text-tertiary py-8">
            No customer orders in the last 90 days.
          </div>
        ) : (
          <ul className="space-y-1 -mx-2">
            {stats.topCustomers90.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelectCustomer(c.id)}
                  className="w-full flex items-center gap-2.5 min-w-0 px-2 py-1.5 rounded-lg hover:bg-bg-hover transition-colors text-left"
                >
                  <span
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium border shrink-0",
                      i === 0 ? "bg-accent-brand/15 border-accent-brand/40 text-accent-brand" : "bg-bg-active border-border-subtle",
                    )}
                  >
                    {initials(c.name)}
                  </span>
                  <span className="text-sm truncate flex-1">{c.name}</span>
                  <span className="text-xs text-text-tertiary whitespace-nowrap">
                    {c.orders} order{c.orders === 1 ? "" : "s"}
                  </span>
                  <span className="text-sm font-medium tabular-nums whitespace-nowrap">{formatMoney(c.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
