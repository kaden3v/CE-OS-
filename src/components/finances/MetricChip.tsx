import { cn } from "@/lib/utils";

export interface MetricChipProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "alert";
  /** When provided, the chip becomes an interactive button (e.g. to open a drill-down). */
  onClick?: () => void;
}

const CHIP_BASE = "bg-bg-elevated backdrop-blur-md rounded-[14px] border border-border-subtle px-4 py-3";

/** A compact secondary-metric card for the Finances Overview unit-economics row. */
export function MetricChip({ label, value, hint, tone, onClick }: MetricChipProps) {
  const body = (
    <>
      <div className={cn("text-xl font-semibold tabular-nums", tone === "alert" ? "text-status-alert" : "text-text-primary")}>
        {value}
      </div>
      <div className="text-[11px] text-text-secondary uppercase tracking-wide mt-0.5">{label}</div>
      {hint && <div className="text-[10px] text-text-tertiary mt-0.5 truncate">{hint}</div>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          CHIP_BASE,
          "text-left w-full cursor-pointer transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brand",
        )}
      >
        {body}
      </button>
    );
  }

  return <div className={CHIP_BASE}>{body}</div>;
}
