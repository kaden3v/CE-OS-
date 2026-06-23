/**
 * Client wrappers + CSV helpers for the finance reports. All aggregation is
 * server-side (finance_pnl / finance_revenue_* / finance_kpis / finance_cashflow);
 * these reduce to the same _finance_kpi_window so P&L and Overview reconcile.
 */
import { rpcCall } from "./supabase";

export interface FinanceWindow {
  gross_sales: number;
  /** Product + shipping (net of refunds) — gross-receipts basis for taxes. */
  gross_receipts: number;
  refunds: number;
  shipping_collected: number;
  channel_fees: number;
  net_revenue: number;
  expenses: number;
  cogs_materials: number;
  cogs_labor: number;
  cogs: number;
  mileage: number;
  gross_profit: number;
  net_profit: number;
  month?: string;
}

export interface ScheduleCRow {
  category: string;
  months: number[]; // 12
  total: number;
}

export interface Pnl {
  year: number;
  months: FinanceWindow[]; // 12, each with `month` label
  total: FinanceWindow;
  schedule_c: ScheduleCRow[];
}

export interface RevenueChannel {
  channel: string;
  gross: number;
  refunds: number;
  fees: number;
  net: number;
  rate: number;
}

export interface RevenueTrendPoint {
  month: string; // YYYY-MM-DD
  channel: string;
  net: number;
}

export type FinancePeriod = "month" | "quarter" | "ytd";

export const fetchKpis = (orgId: string, period: FinancePeriod) =>
  rpcCall<{ period: string; current: FinanceWindow; prior: FinanceWindow }>("finance_kpis", { p_org_id: orgId, p_period: period });

export const fetchPnl = (orgId: string, year: number) =>
  rpcCall<Pnl>("finance_pnl", { p_org_id: orgId, p_year: year });

export const fetchRevenueByChannel = (orgId: string, period: FinancePeriod) =>
  rpcCall<RevenueChannel[]>("finance_revenue_by_channel", { p_org_id: orgId, p_period: period });

export const fetchRevenueTrend = (orgId: string) =>
  rpcCall<RevenueTrendPoint[]>("finance_revenue_trend", { p_org_id: orgId });

export const fetchCashflow = (orgId: string) =>
  rpcCall<{ month: string; money_in: number; money_out: number; net: number }[]>("finance_cashflow", { p_org_id: orgId });

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
const csvCell = (v: string | number | null | undefined): string => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
