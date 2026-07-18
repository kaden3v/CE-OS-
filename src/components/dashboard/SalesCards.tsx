import { Link } from "react-router";
import { Store, Sprout } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatMoney } from "@/lib/format";
import type { ChannelSlice, TopSeller } from "@/lib/dashboardMetrics";

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Where the last 30 days of revenue came from, with per-channel order count and AOV. */
export function ChannelMixCard({ mix }: { mix: ChannelSlice[] }) {
  return (
    <Card className="p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-secondary flex items-center gap-2">
          <Store className="w-4 h-4" /> Channel mix · 30d
        </h3>
        <Link to="/orders" className="text-xs text-text-secondary hover:text-text-primary">Orders →</Link>
      </div>
      {mix.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-text-tertiary py-8">
          No orders in the last 30 days.
        </div>
      ) : (
        <div className="space-y-4">
          {mix.map((c, i) => (
            <div key={c.channel}>
              <div className="flex items-baseline justify-between text-sm mb-1.5 gap-2">
                <span className="font-medium">{cap(c.channel)}</span>
                <span className="text-text-secondary tabular-nums">
                  {formatMoney(c.revenue)} · {Math.round(c.share * 100)}%
                </span>
              </div>
              <div className="h-2 rounded bg-bg-active overflow-hidden">
                <div
                  className={i === 0 ? "h-full bg-accent-brand" : "h-full bg-border-strong"}
                  style={{ width: `${Math.max(2, c.share * 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-text-tertiary mt-1 tabular-nums">
                {c.orders} order{c.orders === 1 ? "" : "s"}
                {c.aov != null && <> · {formatMoney(c.aov)} avg</>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Best-selling plants over the last 30 days, by units, with revenue. */
export function TopSellersCard({ sellers }: { sellers: TopSeller[] }) {
  const maxUnits = sellers[0]?.units || 1;
  return (
    <Card className="p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-secondary flex items-center gap-2">
          <Sprout className="w-4 h-4" /> Top sellers · 30d
        </h3>
        <Link to="/cultivars" className="text-xs text-text-secondary hover:text-text-primary">Cultivars →</Link>
      </div>
      {sellers.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-text-tertiary py-8">
          No units sold in the last 30 days.
        </div>
      ) : (
        <div className="space-y-3">
          {sellers.map((s, i) => (
            <div key={s.name}>
              <div className="flex items-baseline justify-between text-sm mb-1.5 gap-2 min-w-0">
                <span className="truncate">{s.name}</span>
                <span className="text-text-secondary tabular-nums whitespace-nowrap">
                  {s.units} sold · {formatMoney(s.revenue)}
                </span>
              </div>
              <div className="h-1.5 rounded bg-bg-active overflow-hidden">
                <div
                  className={i === 0 ? "h-full bg-accent-brand" : "h-full bg-border-strong"}
                  style={{ width: `${Math.max(3, (s.units / maxUnits) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
