import { Link } from "react-router";
import { Users } from "lucide-react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from "recharts";
import { Card } from "@/components/ui/Card";
import { RechartsChart } from "@/components/ui/RechartsChart";
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

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-text-secondary uppercase tracking-wide mt-0.5">{label}</div>
      {hint && <div className="text-[10px] text-text-tertiary mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

/**
 * Customer acquisition & loyalty at a glance: new customers per month
 * (first-order based), repeat rate, and who's spending the most lately.
 */
export function CustomerPulse({ stats, loading }: { stats: CustomerStats; loading: boolean }) {
  const hasAny = stats.totalCustomers > 0;

  return (
    <Card className="p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-secondary flex items-center gap-2">
          <Users className="w-4 h-4" /> Customers
        </h3>
        <Link to="/customers" className="text-xs text-text-secondary hover:text-text-primary">All →</Link>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
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

      {/* New customers by month (first valid order) */}
      <div className="h-24 shrink-0">
        {hasAny ? (
          <RechartsChart>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.newByMonth} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" stroke="var(--color-text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false}>
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
      <div className="text-[10px] text-text-tertiary mt-1 mb-4">New customers by month (first order)</div>

      {/* Top customers, trailing 90 days */}
      <div className="mt-auto">
        <div className="text-[11px] uppercase tracking-wide text-text-secondary mb-2">Top customers · 90d</div>
        {stats.topCustomers90.length === 0 ? (
          <div className="text-xs text-text-tertiary">No customer orders in the last 90 days.</div>
        ) : (
          <ul className="space-y-2">
            {stats.topCustomers90.slice(0, 4).map((c, i) => (
              <li key={c.id} className="flex items-center gap-2.5 min-w-0">
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
