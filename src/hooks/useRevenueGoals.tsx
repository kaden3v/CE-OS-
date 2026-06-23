import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/hooks/useEntity";
import { supabase } from "@/lib/supabase";
import { logDbError } from "@/lib/dbErrors";
import { fetchKpis, type FinancePeriod, type FinanceWindow } from "@/lib/financeReports";
import { todayISO } from "@/lib/dates";
import {
  computeGoalPace,
  fetchCurrentGoalTarget,
  fetchRevenueVsGoal,
  periodBounds,
  type GoalPeriodType,
  type PaceResult,
  type RevenueGoal,
  type RevenueVsGoalPoint,
} from "@/lib/revenueGoals";

export interface UseRevenueGoals {
  goals: RevenueGoal[];
  series: RevenueVsGoalPoint[];
  /** Current-period actuals from finance_kpis (net + gross). */
  current: FinanceWindow | null;
  /** Prior comparable period, for the delta. */
  prior: FinanceWindow | null;
  loadingKpis: boolean;
  loadingSeries: boolean;
  /** Current/prior KPI load failure (drives the tiles + pace hero). */
  kpiError: string | null;
  /** Trailing-12-month series load failure (drives the chart). */
  seriesError: string | null;
  goalFor: (type: GoalPeriodType, periodStart: string) => RevenueGoal | undefined;
  /** Upsert the target for one period; refreshes the chart series on success. */
  saveGoal: (type: GoalPeriodType, periodStart: string, target: number) => Promise<{ ok: boolean }>;
  refresh: () => void;
}

/**
 * Drives the Finances → Goals tab. Targets are read/written through `useEntity`
 * (org-scoped, manager-gated by RLS, with live refresh); actuals are aggregated
 * server-side via `finance_kpis` (period-dependent) and `finance_revenue_vs_goal`
 * (org-only), mirroring the split loading states in `useFinanceOverview`.
 */
/**
 * Lightweight current-month pace for ambient surfaces (the Dashboard strip and
 * the Overview off-pace alert). Reuses finance_kpis + computeGoalPace; manager-
 * gated. Returns null pace for non-managers or until the month KPIs land.
 */
export function useMonthGoalPace(): { pace: PaceResult | null; loading: boolean } {
  const { activeOrgId, orgRole } = useAuth();
  const canManage = orgRole === "owner" || orgRole === "manager";
  const [current, setCurrent] = useState<FinanceWindow | null>(null);
  const [prior, setPrior] = useState<FinanceWindow | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrgId || !canManage) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchKpis(activeOrgId, "month"),
      fetchCurrentGoalTarget(activeOrgId, "monthly").catch(() => null), // goal failure must not break the MTD read
    ])
      .then(([k, t]) => {
        if (cancelled) return;
        setCurrent(k.current);
        setPrior(k.prior);
        setTarget(t);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, canManage]);

  const bounds = periodBounds("month");
  const pace = current
    ? computeGoalPace({
        target,
        actualNet: Number(current.net_revenue),
        actualGross: Number(current.gross_sales),
        priorNet: prior ? Number(prior.net_revenue) : null,
        periodStartISO: bounds.startISO,
        periodEndISO: bounds.endISO,
        todayISO: todayISO(),
      })
    : null;

  return { pace, loading };
}

export function useRevenueGoals(period: FinancePeriod): UseRevenueGoals {
  const { user, activeOrgId } = useAuth();
  const goalsEntity = useEntity<RevenueGoal>("revenue_goals", [], {
    orderBy: "period_start",
    ascending: false,
  });

  const [current, setCurrent] = useState<FinanceWindow | null>(null);
  const [prior, setPrior] = useState<FinanceWindow | null>(null);
  const [series, setSeries] = useState<RevenueVsGoalPoint[]>([]);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [loadingSeries, setLoadingSeries] = useState(true);
  // Separate per-loader errors: a successful series load must not clear (mask) a
  // real KPI failure, which would leave the hero silently showing $0 / "behind".
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const loadKpis = useCallback(async () => {
    if (!activeOrgId) return;
    setLoadingKpis(true);
    try {
      const k = await fetchKpis(activeOrgId, period);
      setCurrent(k.current);
      setPrior(k.prior);
      setKpiError(null);
    } catch (e) {
      setKpiError(e instanceof Error ? e.message : "Couldn't load revenue");
    } finally {
      setLoadingKpis(false);
    }
  }, [activeOrgId, period]);

  const loadSeries = useCallback(async () => {
    if (!activeOrgId) return;
    setLoadingSeries(true);
    try {
      const s = await fetchRevenueVsGoal(activeOrgId);
      setSeries(s ?? []);
      setSeriesError(null);
    } catch (e) {
      setSeriesError(e instanceof Error ? e.message : "Couldn't load revenue history");
    } finally {
      setLoadingSeries(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    void loadSeries();
  }, [loadSeries]);

  const goalFor = useCallback(
    (type: GoalPeriodType, periodStart: string) =>
      goalsEntity.data.find((g) => g.period_type === type && g.period_start === periodStart),
    [goalsEntity.data],
  );

  // True upsert keyed on the table's (org_id, period_type, period_start) unique
  // constraint — avoids the read-then-insert race where a goal that exists
  // server-side but isn't yet in local state would collide on insert.
  const saveGoal = useCallback(
    async (type: GoalPeriodType, periodStart: string, target: number) => {
      if (!supabase || !activeOrgId || !user) return { ok: false };
      const { error } = await supabase
        .from("revenue_goals")
        .upsert(
          { org_id: activeOrgId, user_id: user.id, period_type: type, period_start: periodStart, target_amount: target },
          { onConflict: "org_id,period_type,period_start" },
        );
      if (error) {
        logDbError("upsert revenue_goals", error);
        return { ok: false };
      }
      await goalsEntity.refresh();
      void loadSeries();
      return { ok: true };
    },
    [activeOrgId, user, goalsEntity, loadSeries],
  );

  return {
    goals: goalsEntity.data,
    series,
    current,
    prior,
    loadingKpis,
    loadingSeries,
    kpiError,
    seriesError,
    goalFor,
    saveGoal,
    refresh: useCallback(() => {
      void loadKpis();
      void loadSeries();
    }, [loadKpis, loadSeries]),
  };
}
