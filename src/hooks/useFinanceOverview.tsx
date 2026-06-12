import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { rpcCall } from "@/lib/supabase";

export type FinancePeriod = "month" | "ytd";

/** One [start, end) window of KPIs, as returned by `finance_kpis`. */
export interface FinanceKpiWindow {
  gross_sales: number;
  refunds: number;
  channel_fees: number;
  net_revenue: number;
  expenses: number;
  cogs_materials: number;
  cogs_labor: number;
  cogs: number;
  net_profit: number;
}

export interface FinanceKpis {
  period: FinancePeriod;
  current: FinanceKpiWindow;
  prior: FinanceKpiWindow;
}

export interface CashflowPoint {
  month: string; // YYYY-MM-DD (first of month)
  money_in: number;
  money_out: number;
  net: number;
}

export interface SubscriptionAlert {
  id: string;
  name: string;
  amount: number;
  next_renewal: string;
}

export interface SupplyAlert {
  id: string;
  name: string;
  on_hand: number;
  reorder_threshold: number;
  unit: string | null;
}

export interface ExpenseAlert {
  id: string;
  amount: number;
  description: string | null;
  occurred_on: string;
  missing: string;
}

export interface FinanceAlerts {
  renewing: SubscriptionAlert[];
  overdue: SubscriptionAlert[];
  low_stock: SupplyAlert[];
  uncategorized: ExpenseAlert[];
}

/**
 * Drives the Finances Overview page. All aggregation happens in Postgres
 * (finance_kpis / finance_cashflow / finance_alerts) so nothing pulls a full
 * table into the browser. KPIs re-fetch when the period toggles; the cash-flow
 * series and alerts depend only on the active org.
 */
export function useFinanceOverview(period: FinancePeriod) {
  const { activeOrgId } = useAuth();

  const [kpis, setKpis] = useState<FinanceKpis | null>(null);
  const [cashflow, setCashflow] = useState<CashflowPoint[]>([]);
  const [alerts, setAlerts] = useState<FinanceAlerts | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [loadingRest, setLoadingRest] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKpis = useCallback(async () => {
    if (!activeOrgId) return;
    setLoadingKpis(true);
    try {
      const data = await rpcCall<FinanceKpis>("finance_kpis", { p_org_id: activeOrgId, p_period: period });
      setKpis(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load finance summary");
    } finally {
      setLoadingKpis(false);
    }
  }, [activeOrgId, period]);

  const fetchRest = useCallback(async () => {
    if (!activeOrgId) return;
    setLoadingRest(true);
    try {
      const [cf, al] = await Promise.all([
        rpcCall<CashflowPoint[]>("finance_cashflow", { p_org_id: activeOrgId }),
        rpcCall<FinanceAlerts>("finance_alerts", { p_org_id: activeOrgId }),
      ]);
      setCashflow(cf ?? []);
      setAlerts(al);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load finance details");
    } finally {
      setLoadingRest(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void fetchKpis();
  }, [fetchKpis]);

  useEffect(() => {
    void fetchRest();
  }, [fetchRest]);

  return {
    kpis,
    cashflow,
    alerts,
    loadingKpis,
    loadingRest,
    error,
    refresh: useCallback(() => {
      void fetchKpis();
      void fetchRest();
    }, [fetchKpis, fetchRest]),
  };
}
