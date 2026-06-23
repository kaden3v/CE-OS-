import { Link } from "react-router";
import { Target } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { PaceBar, PACE_SEV_BAR, PACE_SEV_TEXT, PACE_STATUS_LABEL } from "./PaceBar";
import { paceSeverity, type PaceResult } from "@/lib/revenueGoals";

/**
 * Ambient current-month pace summary for the Dashboard. Renders nothing while
 * loading or for users without a pace (non-managers). Mirrors the Goals page's
 * pace hero — neutral "Tracking" early in the month, color-coded once confident —
 * and links through to the full tracker.
 */
export function GoalPaceStrip({ pace, loading }: { pace: PaceResult | null; loading: boolean }) {
  if (loading || !pace) return null;

  if (!pace.hasGoal) {
    return (
      <Link to="/finances/goals" className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary">
        <Target className="w-4 h-4" /> Set a monthly revenue goal →
      </Link>
    );
  }

  const early = !pace.confident;
  const sev = early ? "none" : paceSeverity(pace);
  const label = early ? "Tracking" : PACE_STATUS_LABEL[pace.status];

  return (
    <Link to="/finances/goals" className="block">
      <Card className="p-4 hover:border-border-strong transition-colors">
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="flex items-center gap-2 text-text-secondary"><Target className="w-4 h-4" /> Revenue goal · this month</span>
          <span className={cn("font-medium", PACE_SEV_TEXT[sev])}>{label}</span>
        </div>
        <PaceBar fillPct={pace.goalFraction * 100} markerPct={pace.timeFraction * 100} barClass={PACE_SEV_BAR[sev]} />
        <div className="mt-2 flex items-center justify-between text-xs text-text-secondary tabular-nums">
          <span>{formatMoney(pace.actualNet)} of {formatMoney(pace.target)}</span>
          <span>{(pace.goalFraction * 100).toFixed(0)}% of goal</span>
        </div>
      </Card>
    </Link>
  );
}
