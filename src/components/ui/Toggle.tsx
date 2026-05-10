import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  /**
   * `brand` (green, default), `info` (blue, for dev tools), `warn` (yellow), `alert` (red).
   */
  tone?: "brand" | "info" | "warn" | "alert";
}

const TONE_BG: Record<NonNullable<ToggleProps["tone"]>, string> = {
  brand: "bg-accent-brand",
  info: "bg-status-info",
  warn: "bg-status-warn",
  alert: "bg-status-alert",
};

/**
 * 36×20 track, 2px padding, 16px ball.
 * Travel = 36 - 2*2 - 16 = 16 → translate-x-4.
 */
export function Toggle({ checked, onChange, disabled, ariaLabel, tone = "brand" }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent-brand",
        checked ? TONE_BG[tone] : "bg-bg-active border border-border-strong",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "block w-4 h-4 rounded-full bg-text-primary transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}
