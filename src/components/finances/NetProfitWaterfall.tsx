import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { num as n } from "@/lib/finance";
import { BreakdownRow } from "./BreakdownRow";
import type { FinanceKpiWindow, ExpenseBreakdownRow } from "@/hooks/useFinanceOverview";

const isPostage = (category: string) => /shipping/i.test(category);

interface Props {
  win: FinanceKpiWindow | undefined;
  breakdown: ExpenseBreakdownRow[];
  loading: boolean;
}

/**
 * "Show your work" for Net Profit. Revenue is plant sales; shipping is its own
 * net line (what buyers paid minus postage); operating expenses expand into
 * their categories. Every line is the exact figure the server returned, so K can
 * always answer "where did this number come from?" without leaving the screen.
 * Cash basis: production COGS is a managerial note, not a deduction.
 */
export function NetProfitWaterfall({ win, breakdown, loading }: Props) {
  const [expExpanded, setExpExpanded] = useState(false);

  if (loading || !win) {
    return <div className="h-72 rounded-lg bg-bg-base animate-pulse" />;
  }

  const fees = n(win.channel_fees);
  const shippingCollected = n(win.shipping_collected);
  const mileage = n(win.mileage);
  const cogs = n(win.cogs);

  const postage = breakdown.filter((b) => isPostage(b.category)).reduce((s, b) => s + n(b.total), 0);
  const otherExpenses = breakdown.filter((b) => !isPostage(b.category));
  const otherExpensesTotal = otherExpenses.reduce((s, b) => s + n(b.total), 0);
  const shippingNet = shippingCollected - postage; // negative = shipping loses money

  return (
    <div className="text-sm">
      <BreakdownRow label="Product revenue" sub="plant sales" amount={n(win.gross_sales)} to="/finances/revenue" />
      {fees > 0 && <BreakdownRow label="Channel & processing fees" sub="modeled, non-Etsy" amount={fees} outflow to="/finances/revenue" />}
      <BreakdownRow label="Net revenue" amount={n(win.net_revenue)} bold />

      {(shippingCollected > 0 || postage > 0) && (
        <BreakdownRow
          label="Shipping"
          sub={`collected ${formatMoney(shippingCollected)} − postage ${formatMoney(postage)}`}
          amount={Math.abs(shippingNet)}
          outflow={shippingNet < 0}
          to="/finances/expenses"
        />
      )}
      <BreakdownRow
        label="Operating expenses"
        sub="ads, marketplace fees, other"
        amount={otherExpensesTotal}
        outflow
        to={expExpanded ? undefined : "/finances/expenses"}
        expandable
        expanded={expExpanded}
        onToggle={() => setExpExpanded((v) => !v)}
      />
      {expExpanded &&
        (otherExpenses.length > 0 ? (
          otherExpenses.map((b) => <BreakdownRow key={b.category} label={b.category} amount={n(b.total)} outflow indent />)
        ) : (
          <div className="pl-7 py-2 text-xs text-text-tertiary border-t border-border-subtle/30">No operating expenses in this period.</div>
        ))}
      {mileage > 0 && <BreakdownRow label="Mileage deduction" amount={mileage} outflow to="/finances/mileage" />}
      <BreakdownRow label="Net profit" amount={n(win.net_profit)} result />

      {cogs > 0 && (
        <p className="text-[11px] text-text-tertiary mt-3 px-1 leading-relaxed">
          Production COGS {formatMoney(cogs)} is tracked for per-unit costing and is not a cash-basis net-profit
          deduction here — supplies are expensed when purchased. See Production for per-unit cost.
        </p>
      )}
    </div>
  );
}
