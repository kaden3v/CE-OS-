import { type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight, ChevronDown } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BreakdownRowProps {
  label: string;
  sub?: string;
  amount: number;
  /** Render this text instead of the money-formatted amount (counts, ratios). */
  valueText?: string;
  outflow?: boolean;
  bold?: boolean;
  result?: boolean;
  indent?: boolean;
  to?: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

/**
 * One line of a financial derivation ("show your work"). Outflows render in red
 * with a leading minus; result rows are emphasized. Shared by the Net Profit
 * waterfall and the stat drill-down modals so every breakdown looks identical.
 */
export function BreakdownRow({
  label, sub, amount, valueText, outflow, bold, result, indent, to, expandable, expanded, onToggle,
}: BreakdownRowProps) {
  const amountStr = valueText ?? (outflow ? "−" : "") + formatMoney(amount);
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
