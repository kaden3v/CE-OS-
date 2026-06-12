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

function Sparkline({ data, colorVariant }: { data: number[], colorVariant: 'up' | 'down' }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 24;
  const w = 60;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  const color = colorVariant === 'up' ? 'text-status-ok' : 'text-status-alert';

  return (
    <svg width={w} height={h} className="overflow-visible ml-4">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className={color}
      />
    </svg>
  );
}

export function StatTile({ label, value, hint, trend, className }: StatTileProps) {
  return (
    <div
      className={cn(
        "bg-bg-elevated backdrop-blur-md rounded-[16px] border border-border-subtle p-6 flex flex-col",
        className
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-4xl font-semibold tabular-nums text-text-primary">
          {value}
        </h3>
        {trend && (
           <div className="flex items-center">
              <div className="flex flex-col items-end gap-2 text-xs text-text-secondary">
                <div className="flex items-center gap-2">
                  {trend.direction === "up" ? (
                    <ArrowUpRight className="w-3 h-3 text-status-ok" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3 text-status-alert" />
                  )}
                  <span>{trend.value}</span>
                </div>
                {trend.label && <span className="text-text-tertiary ml-2">{trend.label}</span>}
              </div>
              {trend.sparklineData && (
                 <Sparkline data={trend.sparklineData} colorVariant={trend.direction} />
              )}
           </div>
        )}
      </div>
      <p className="text-xs text-text-secondary uppercase tracking-wide">
        {label}
      </p>
      {hint && <p className="text-[11px] text-text-tertiary mt-1 normal-case tracking-normal">{hint}</p>}
    </div>
  );
}
