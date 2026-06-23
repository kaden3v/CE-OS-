/**
 * Revenue goals & pace tracker — client data layer.
 *
 * Actuals come from the server (the existing `finance_kpis` RPC for the current
 * and prior period, and `finance_revenue_vs_goal` for the trailing-12-month
 * series), so the revenue math has a single source of truth in Postgres. The
 * pace arithmetic below (projection, days remaining, required run-rate, on-track
 * status) is pure date + ratio math, kept here so it is unit-testable without a
 * database round-trip.
 */
import { rpcCall, restGet } from "./supabase";
import { monthStartISO, yearStartISO, todayISO, quarterRange } from "./dates";
import type { FinancePeriod } from "./financeReports";

export type GoalPeriodType = "monthly" | "quarterly" | "annual";

/** First day of the current calendar quarter (Phoenix), YYYY-MM-DD. */
export const quarterStartISO = (): string => quarterRange().from;

/** A persisted target, one row per (org, period_type, period_start). */
export interface RevenueGoal {
  id: string;
  org_id?: string;
  user_id?: string;
  period_type: GoalPeriodType;
  period_start: string; // YYYY-MM-DD (first of month / first of year)
  target_amount: number;
  created_at?: string;
  updated_at?: string;
}

/** One month of actual net + gross revenue against that month's effective goal. */
export interface RevenueVsGoalPoint {
  month: string; // YYYY-MM-DD (first of month)
  actual_net: number;
  actual_gross: number;
  goal: number | null;
  /** true = goal is a broader target spread evenly (quarterly ÷3 or annual ÷12, a flat seasonally-naive proxy); false = explicit monthly; null = no goal. */
  goal_is_derived: boolean | null;
}

export const fetchRevenueVsGoal = (orgId: string): Promise<RevenueVsGoalPoint[]> =>
  rpcCall<RevenueVsGoalPoint[]>("finance_revenue_vs_goal", { p_org_id: orgId });

/** The current period's explicit target (monthly/quarterly/annual), or null if unset/zero. */
export async function fetchCurrentGoalTarget(orgId: string, periodType: GoalPeriodType): Promise<number | null> {
  const periodStart =
    periodType === "annual" ? yearStartISO() : periodType === "quarterly" ? quarterStartISO() : monthStartISO();
  const rows = await restGet<{ target_amount: number }[]>(
    `revenue_goals?org_id=eq.${orgId}&period_type=eq.${periodType}&period_start=eq.${periodStart}&select=target_amount`,
  );
  const t = rows?.[0]?.target_amount;
  return t != null && Number(t) > 0 ? Number(t) : null;
}

/** The period_start key for the goal that governs the given toggle. */
export function periodStartFor(period: FinancePeriod): string {
  return period === "ytd" ? yearStartISO() : period === "quarter" ? quarterStartISO() : monthStartISO();
}

/** The goal granularity that governs the given toggle. */
export function periodTypeFor(period: FinancePeriod): GoalPeriodType {
  return period === "ytd" ? "annual" : period === "quarter" ? "quarterly" : "monthly";
}

/** Inclusive [first, last] calendar dates of the period the toggle represents. */
export function periodBounds(period: FinancePeriod): { startISO: string; endISO: string } {
  const today = todayISO();
  if (period === "ytd") {
    const year = today.slice(0, 4);
    return { startISO: `${year}-01-01`, endISO: `${year}-12-31` };
  }
  if (period === "quarter") {
    const { from, to } = quarterRange();
    return { startISO: from, endISO: to };
  }
  const [y, m] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last of this
  return {
    startISO: `${today.slice(0, 7)}-01`,
    endISO: `${today.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`,
  };
}

// ---------------------------------------------------------------------------
// Pace math (pure — unit-tested in revenueGoals.test.ts)
// ---------------------------------------------------------------------------

export type PaceStatus = "ahead" | "on_track" | "behind" | "no_goal";
export type PaceSeverity = "ok" | "warn" | "alert" | "none";

/** Display severity for a pace result — behind-but-within-10% reads as a warning, not an alert. */
export function paceSeverity(p: PaceResult): PaceSeverity {
  if (!p.hasGoal) return "none";
  if (p.status !== "behind") return "ok";
  return p.projectedNet >= p.target * 0.9 ? "warn" : "alert";
}

export interface PaceInput {
  /** Period target; null/0 means no goal set. */
  target: number | null;
  /** Net revenue (after fees) recognized so far this period. */
  actualNet: number;
  /** Gross product sales so far this period (display companion to net). */
  actualGross: number;
  /** Same metric for the prior comparable period, for the delta. */
  priorNet: number | null;
  periodStartISO: string; // inclusive first day
  periodEndISO: string; // inclusive last day
  todayISO: string;
}

export interface PaceResult {
  hasGoal: boolean;
  status: PaceStatus;
  target: number;
  actualNet: number;
  actualGross: number;
  daysElapsed: number;
  daysInPeriod: number;
  daysRemaining: number;
  /** Fraction of the period elapsed, 0..1 — the "pace line". */
  timeFraction: number;
  /** actualNet / target, 0 when no goal. */
  goalFraction: number;
  /** Linear run-rate projection of net revenue to the period end. */
  projectedNet: number;
  /** projectedNet − target. */
  projectedDelta: number;
  /**
   * Whether enough of the period has elapsed for the linear projection to be a
   * trustworthy signal. A flat daily run-rate is noisy early in a period (and
   * seasonally misleading for this nursery), so the UI leads with actual-vs-goal
   * progress and a caveat until this is true rather than asserting ahead/behind.
   */
  confident: boolean;
  /** Remaining net revenue to reach the goal (never negative). */
  neededTotal: number;
  /** neededTotal spread over the days left (0 when the period is over). */
  neededPerDay: number;
  /**
   * Growth vs the prior period as a fraction (null if no prior). Compares the
   * PROJECTED full-period net against the prior FULL period — a like-for-like
   * comparison. Comparing partial-to-date against a full prior period would read
   * as a large false drop early in the period.
   */
  vsPriorPct: number | null;
}

const MS_PER_DAY = 86_400_000;
/** Projected ≥102% of target reads as comfortably "ahead" rather than merely on track. */
const AHEAD_THRESHOLD = 1.02;
/**
 * Below this fraction of the period elapsed, a linear run-rate projection is too
 * noisy to assert ahead/behind (one busy or quiet early day swings it wildly —
 * especially for a seasonal business). Tunable; ~40% balances early signal vs noise.
 */
export const CONFIDENT_AFTER = 0.4;

function isoToUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole calendar days from `aISO` to `bISO`, inclusive of both ends. */
export function inclusiveDaySpan(aISO: string, bISO: string): number {
  return Math.round((isoToUTC(bISO) - isoToUTC(aISO)) / MS_PER_DAY) + 1;
}

export function computeGoalPace(input: PaceInput): PaceResult {
  const { target, actualNet, actualGross, priorNet, periodStartISO, periodEndISO } = input;

  const daysInPeriod = Math.max(inclusiveDaySpan(periodStartISO, periodEndISO), 1);
  // Clamp elapsed into [1, daysInPeriod] so a never-zero divisor and no overrun.
  const rawElapsed = inclusiveDaySpan(periodStartISO, input.todayISO);
  const daysElapsed = Math.min(Math.max(rawElapsed, 1), daysInPeriod);
  const daysRemaining = Math.max(daysInPeriod - daysElapsed, 0);
  const timeFraction = daysElapsed / daysInPeriod;

  const projectedNet = (actualNet / daysElapsed) * daysInPeriod;
  // Like-for-like: projected full period vs the prior full period.
  const vsPriorPct = priorNet && priorNet !== 0 ? (projectedNet - priorNet) / priorNet : null;
  const confident = timeFraction >= CONFIDENT_AFTER;

  if (!target || target <= 0) {
    return {
      hasGoal: false,
      status: "no_goal",
      target: 0,
      actualNet,
      actualGross,
      daysElapsed,
      daysInPeriod,
      daysRemaining,
      timeFraction,
      goalFraction: 0,
      projectedNet,
      projectedDelta: 0,
      confident,
      neededTotal: 0,
      neededPerDay: 0,
      vsPriorPct,
    };
  }

  const neededTotal = Math.max(target - actualNet, 0);
  const neededPerDay = daysRemaining > 0 ? neededTotal / daysRemaining : 0;

  let status: PaceStatus;
  if (projectedNet >= target * AHEAD_THRESHOLD) status = "ahead";
  else if (projectedNet >= target) status = "on_track";
  else status = "behind";

  return {
    hasGoal: true,
    status,
    target,
    actualNet,
    actualGross,
    daysElapsed,
    daysInPeriod,
    daysRemaining,
    timeFraction,
    goalFraction: actualNet / target,
    projectedNet,
    projectedDelta: projectedNet - target,
    confident,
    neededTotal,
    neededPerDay,
    vsPriorPct,
  };
}
