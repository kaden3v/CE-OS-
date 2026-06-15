import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface StatTileProps {
  label: string;
  value: string;
  /** Optional muted sub-line under the label (e.g. clarifying what the figure means). */
  hint?: string;
  trend?: {
    value: string;
    direction: "up" | "down";
    label?: string;
    sparklineData?: number[];
  };
  className?: string;
}

/**
 * Full-width sparkline that scales to its container.
 *
 * Uses a fixed viewBox with `preserveAspectRatio="none"` so the path stretches
 * to whatever width the tile gives it, and `vector-effect="non-scaling-stroke"`
 * so the line stays a crisp 1.5px regardless of that horizontal stretch. Living
 * on its own row (never beside the value), it can't overflow the card.
 */
function Sparkline({ data, colorVariant }: { data: number[]; colorVariant: "up" | "down" }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const W = 100;
  const H = 24;
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((d - min) / range) * H;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const color = colorVariant === "up" ? "text-status-ok" : "text-status-alert";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("w-full h-6 mt-3 shrink-0", color)}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function StatTile({ label, value, hint, trend, className }: StatTileProps) {
  return (
    <div
      className={cn(
        "bg-bg-elevated backdrop-blur-md rounded-[16px] border border-border-subtle p-5 sm:p-6 flex flex-col overflow-hidden",
        className,
      )}
    >
      <h3 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tabular-nums text-text-primary truncate">
        {value}
      </h3>
      {trend && (
        <div className="flex items-center gap-1 text-xs text-text-secondary mt-1 min-w-0">
          {trend.direction === "up" ? (
            <ArrowUpRight className="w-3 h-3 shrink-0 text-status-ok" />
          ) : (
            <ArrowDownRight className="w-3 h-3 shrink-0 text-status-alert" />
          )}
          <span className="shrink-0">{trend.value}</span>
          {trend.label && <span className="text-text-tertiary truncate hidden sm:inline">· {trend.label}</span>}
        </div>
      )}
      <p className="text-xs text-text-secondary uppercase tracking-wide mt-2">{label}</p>
      {hint && <p className="text-[11px] text-text-tertiary mt-1 normal-case tracking-normal">{hint}</p>}
      {trend?.sparklineData && <Sparkline data={trend.sparklineData} colorVariant={trend.direction} />}
    </div>
  );
}
