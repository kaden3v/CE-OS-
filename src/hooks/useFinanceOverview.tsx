import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { rpcCall } from "@/lib/supabase";
import { monthStartISO, yearStartISO, todayISO } from "@/lib/dates";

export type FinancePeriod = "month" | "ytd";

/** One [start, end) window of KPIs, as returned by `finance_kpis`. */
export interface FinanceKpiWindow {
  gross_sales: number;
  /** Product + shipping (net of refunds) — the IRS gross-receipts basis for taxes. */
  gross_receipts: number;
  refunds: number;
  shipping_collected: number;
  order_count: number;
  sales_tax_owed: number;
  channel_fees: number;
  net_revenue: number;
  expenses: number;
  cogs_materials: number;
  cogs_labor: number;
  cogs: number;
  mileage: number;
  net_profit: number;
}

/** One expense category total for a window, from `finance_expense_breakdown`. */
export interface ExpenseBreakdownRow {
  category: string;
  total: number;
}

/** The day after the Phoenix calendar `iso` date — the exclusive end of a window. */
function nextDayISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
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
  const [breakdown, setBreakdown] = useState<ExpenseBreakdownRow[]>([]);
  const [cashflow, setCashflow] = useState<CashflowPoint[]>([]);
  const [alerts, setAlerts] = useState<FinanceAlerts | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [loadingRest, setLoadingRest] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKpis = useCallback(async () => {
    if (!activeOrgId) return;
    setLoadingKpis(true);
    // The expense breakdown must cover the same window the KPI uses: month or
    // YTD start, through today inclusive (exclusive upper bound = tomorrow).
    const start = period === "ytd" ? yearStartISO() : monthStartISO();
    const end = nextDayISO(todayISO());
    try {
      const [data, bd] = await Promise.all([
        rpcCall<FinanceKpis>("finance_kpis", { p_org_id: activeOrgId, p_period: period }),
        rpcCall<ExpenseBreakdownRow[]>("finance_expense_breakdown", { p_org_id: activeOrgId, p_start: start, p_end: end }),
      ]);
      setKpis(data);
      setBreakdown(bd ?? []);
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
    breakdown,
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
