import { cn } from "@/lib/utils";

export interface PeriodOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Shared segmented period control used across the finance pages (Overview,
 * Revenue, Goals). Options are passed in so each page exposes only the periods
 * its data supports (e.g. Goals adds "This quarter"). Conveys selection with
 * aria-pressed, not color alone.
 */
export function PeriodToggle<T extends string>({
  period,
  onChange,
  options,
}: {
  period: T;
  onChange: (p: T) => void;
  // NoInfer so T is fixed by `period`/`onChange`, not widened to `string` by the literal.
  options: PeriodOption<NoInfer<T>>[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-border-subtle bg-bg-base p-0.5 text-sm self-start">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={period === o.value}
          className={cn(
            "px-3 py-1.5 rounded-md transition-colors",
            period === o.value ? "bg-bg-active text-text-primary" : "text-text-secondary hover:text-text-primary",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
