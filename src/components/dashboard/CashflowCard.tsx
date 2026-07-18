import { Link } from "react-router";
import { Wallet } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/Card";
import { RechartsChart } from "@/components/ui/RechartsChart";
import { businessMonthShort } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { CashflowPoint } from "@/hooks/useFinanceOverview";

const yTick = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);

/**
 * Trailing-12-month money in / money out / net, straight from the
 * finance_cashflow RPC — the same numbers the Finances tab reports.
 */
export function CashflowCard({ cashflow, loading }: { cashflow: CashflowPoint[]; loading: boolean }) {
  const data = cashflow.map((p) => ({
    month: businessMonthShort(p.month),
    in: Number(p.money_in ?? 0),
    out: Number(p.money_out ?? 0),
    net: Number(p.net ?? 0),
  }));
  const hasFlow = data.some((d) => d.in !== 0 || d.out !== 0);

  return (
    <Card className="p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-secondary flex items-center gap-2">
          <Wallet className="w-4 h-4" /> Cash flow · 12 months
        </h3>
        <Link to="/finances" className="text-xs text-text-secondary hover:text-text-primary">Finances →</Link>
      </div>
      <div className="flex-1 min-h-[16rem]">
        {loading || !hasFlow ? (
          <div className="h-full flex items-center justify-center text-xs text-text-tertiary">
            {loading ? "Loading cash flow…" : "Sales and expenses chart here as they're logged."}
          </div>
        ) : (
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
                <Bar dataKey="in" name="Money in" fill="var(--color-accent-brand)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar dataKey="out" name="Money out" fill="var(--color-status-alert)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Line type="monotone" dataKey="net" name="Net" stroke="var(--color-text-primary)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </RechartsChart>
        )}
      </div>
    </Card>
  );
}
