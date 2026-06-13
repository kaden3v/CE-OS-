import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight, ChevronDown } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FinanceKpiWindow, ExpenseBreakdownRow } from "@/hooks/useFinanceOverview";

const n = (v: unknown): number => Number(v ?? 0);
const isPostage = (category: string) => /shipping/i.test(category);

interface RowProps {
  label: string;
  sub?: string;
  amount: number;
  outflow?: boolean;
  bold?: boolean;
  result?: boolean;
  indent?: boolean;
  to?: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

/** One line of the derivation. Outflows render in red with a leading minus. */
function Row({ label, sub, amount, outflow, bold, result, indent, to, expandable, expanded, onToggle }: RowProps) {
  const amountStr = (outflow ? "−" : "") + formatMoney(amount);
  const interactive = Boolean(to || expandable);

  const inner: ReactNode = (
    <div
      className={cn(
        "flex items-center justify-between gap-2 py-2 px-2 rounded-md border-t",
        indent ? "pl-7 border-border-subtle/30" : "border-border-subtle/60",
        (bold || result) && "bg-bg-elevated/60 border-border-subtle",
        interactive && "hover:bg-bg-hover",
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {expandable &&
          (expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          ))}
        <span className={cn("truncate", indent ? "text-text-secondary" : bold || result ? "font-semibold" : "")}>
          {label}
        </span>
        {sub && <span className="text-[11px] text-text-tertiary hidden sm:inline whitespace-nowrap">· {sub}</span>}
      </div>
      <span
        className={cn(
          "tabular-nums shrink-0",
          outflow ? "text-status-alert" : result ? "text-text-primary font-semibold" : bold ? "font-medium" : "text-text-secondary",
        )}
      >
        {amountStr}
      </span>
    </div>
  );

  if (expandable) {
    return (
      <button type="button" onClick={onToggle} className="w-full text-left">
        {inner}
      </button>
    );
  }
  if (to) {
    return (
      <Link to={to} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

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
      <Row label="Product revenue" sub="plant sales" amount={n(win.gross_sales)} to="/finances/revenue" />
      {fees > 0 && <Row label="Channel & processing fees" sub="modeled, non-Etsy" amount={fees} outflow to="/finances/revenue" />}
      <Row label="Net revenue" amount={n(win.net_revenue)} bold />

      {(shippingCollected > 0 || postage > 0) && (
        <Row
          label="Shipping"
          sub={`collected ${formatMoney(shippingCollected)} − postage ${formatMoney(postage)}`}
          amount={Math.abs(shippingNet)}
          outflow={shippingNet < 0}
          to="/finances/expenses"
        />
      )}
      <Row
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
          otherExpenses.map((b) => <Row key={b.category} label={b.category} amount={n(b.total)} outflow indent />)
        ) : (
          <div className="pl-7 py-2 text-xs text-text-tertiary border-t border-border-subtle/30">No operating expenses in this period.</div>
        ))}
      {mileage > 0 && <Row label="Mileage deduction" amount={mileage} outflow to="/finances/mileage" />}
      <Row label="Net profit" amount={n(win.net_profit)} result />

      {cogs > 0 && (
        <p className="text-[11px] text-text-tertiary mt-3 px-1 leading-relaxed">
          Production COGS {formatMoney(cogs)} is tracked for per-unit costing and is not a cash-basis net-profit
          deduction here — supplies are expensed when purchased. See Production for per-unit cost.
        </p>
      )}
    </div>
  );
}
