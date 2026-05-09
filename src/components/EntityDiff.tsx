import { cn } from "@/lib/utils";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

export type EntityDiffProps<T extends Record<string, unknown>> = {
  left: T;
  right: T;
  leftTitle: string;
  rightTitle: string;
  className?: string;
};

/**
 * Side-by-side field comparison for optimistic conflict resolution.
 * Highlights rows where values differ (including nested JSON for arrays/objects).
 */
export function EntityDiff<T extends Record<string, unknown>>({
  left,
  right,
  leftTitle,
  rightTitle,
  className,
}: EntityDiffProps<T>) {
  const keys = Array.from(
    new Set([...Object.keys(left), ...Object.keys(right)])
  ).sort();

  return (
    <div className={cn("grid gap-3 text-xs", className)}>
      <div className="grid grid-cols-2 gap-2 font-medium text-text-secondary uppercase tracking-wide border-b border-border-subtle pb-2">
        <span>{leftTitle}</span>
        <span>{rightTitle}</span>
      </div>
      <div className="max-h-[min(55vh,420px)] overflow-y-auto space-y-1 pr-1">
        {keys.map((key) => {
          const lv = left[key];
          const rv = right[key];
          const changed = !valuesEqual(lv, rv);
          const lStr = formatValue(lv);
          const rStr = formatValue(rv);
          return (
            <div
              key={key}
              className={cn(
                "grid grid-cols-2 gap-2 rounded-md border border-transparent",
                changed && "border-status-warn/30 bg-status-warn/10"
              )}
            >
              <div className="p-2 font-mono text-text-primary whitespace-pre-wrap break-all border-r border-border-subtle/60">
                <div className="text-[10px] text-text-tertiary mb-1 font-sans normal-case tracking-normal">
                  {key}
                </div>
                {lStr}
              </div>
              <div className="p-2 font-mono text-text-primary whitespace-pre-wrap break-all">
                <div className="text-[10px] text-text-tertiary mb-1 font-sans normal-case tracking-normal opacity-0 pointer-events-none select-none">
                  {key}
                </div>
                {rStr}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
