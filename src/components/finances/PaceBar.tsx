import { cn } from "@/lib/utils";
import type { PaceResult, PaceSeverity } from "@/lib/revenueGoals";

const clampPct = (v: number) => Math.min(Math.max(v, 0), 100);

/** Human label for each pace status, shared across the Goals page and the pace strip. */
export const PACE_STATUS_LABEL: Record<PaceResult["status"], string> = {
  ahead: "Ahead of pace",
  on_track: "On track",
  behind: "Behind pace",
  no_goal: "No goal set",
};

export const PACE_SEV_TEXT: Record<PaceSeverity, string> = {
  ok: "text-status-ok",
  warn: "text-status-warn",
  alert: "text-status-alert",
  none: "text-text-secondary",
};

export const PACE_SEV_BAR: Record<PaceSeverity, string> = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  alert: "bg-status-alert",
  none: "bg-border-strong",
};

/**
 * Goal-progress bar with a marker at the expected-pace position. The fill is the
 * fraction of the goal reached; the marker is the fraction of the period elapsed,
 * so fill-past-marker reads as ahead. Marker is clamped inside the rounded caps.
 */
export function PaceBar({ fillPct, markerPct, barClass }: { fillPct: number; markerPct: number; barClass: string }) {
  const marker = Math.min(Math.max(markerPct, 1), 99);
  return (
    <div className="relative w-full">
      <div className="w-full h-3 rounded-full bg-bg-active overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", barClass)} style={{ width: `${clampPct(fillPct)}%` }} />
      </div>
      <div className="absolute -top-1 -bottom-1 w-px -translate-x-1/2 bg-text-primary/70" style={{ left: `${marker}%` }} aria-hidden />
    </div>
  );
}
