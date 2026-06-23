/**
 * Builds the "how was this number derived?" descriptor for each Finances
 * Overview stat. Pure data only — no React, no fetching — so it's the tested
 * specification of every drill-down's composition, chart, and line-item list.
 *
 * Headline figures and footer totals come straight from the server KPI window
 * (`FinanceKpiWindow`), so they always match the tile. The line items are the
 * client-side orders/expenses behind the figure, filtered to mirror the SQL in
 * `_finance_kpi_window` (see supabase/migrations/..._finance_revenue_is_product_sales.sql).
 * Where a figure can't be reconciled per-row (modeled channel fees, postage
 * summed from an expense category), the descriptor carries a `caveat`.
 */
import { formatMoney } from "@/lib/format";
import { formatBusinessDate, businessMonthShort } from "@/lib/dates";
import { num, trendFor, type Trend } from "@/lib/finance";
import type {
  FinanceKpiWindow, ExpenseBreakdownRow, CashflowPoint, FinancePeriod,
} from "@/hooks/useFinanceOverview";
import type { OrderWithRelations } from "@/hooks/useOrders";
import type { Expense } from "@/components/expenses/types";

export type StatKey =
  | "net_revenue" | "net_profit" | "total_expenses" | "avg_order_value"
  | "orders" | "shipping_margin" | "gross_receipts" | "sales_tax";

/** One line of the "how it's built" derivation. */
export interface CompositionRow {
  label: string;
  sub?: string;
  amount: number;
  /** Overrides the money-formatted amount (for counts / ratios). */
  valueText?: string;
  outflow?: boolean;
  bold?: boolean;
  result?: boolean;
}

export type ChartKind = "inout" | "bars" | "none";

export interface TrendPoint {
  label: string;
  in?: number;
  out?: number;
  net?: number;
  value?: number;
}

export interface ChartSpec {
  kind: ChartKind;
  data: TrendPoint[];
  caption?: string;
  emptyHint?: string;
  barColor?: "brand" | "alert";
}

export type LineItemKind = "orders" | "expenses" | "none";

export interface LineColumn {
  header: string;
  align?: "right";
}

export interface LineItemRow {
  id: string;
  cells: string[];
  /** Muted styling (e.g. a refunded order that nets out of the total). */
  muted?: boolean;
}

export interface LineItemTable {
  kind: LineItemKind;
  columns: LineColumn[];
  rows: LineItemRow[];
  footer?: { label: string; value: string };
  emptyText: string;
  caveat?: string;
  truncatedNote?: string;
}

export interface StatDetail {
  key: StatKey;
  title: string;
  headline: string;
  delta?: Trend;
  intro: string;
  /** Net Profit embeds the full <NetProfitWaterfall> instead of composition rows. */
  useWaterfall?: boolean;
  composition: CompositionRow[];
  chart: ChartSpec;
  lineItems: LineItemTable;
  fullTab?: { to: string; label: string };
}

export interface StatDetailInput {
  current: FinanceKpiWindow | undefined;
  prior: FinanceKpiWindow | undefined;
  breakdown: ExpenseBreakdownRow[];
  cashflow: CashflowPoint[];
  period: FinancePeriod;
  /** Orders in the active window, already filtered to exclude cancelled. */
  windowOrders: OrderWithRelations[];
  /** Expenses in the active window. */
  windowExpenses: Expense[];
}

const MAX_ROWS = 100;
const FACILITATOR_CHANNELS = ["etsy", "ebay"];

const TITLES: Record<StatKey, string> = {
  net_revenue: "Net Revenue",
  net_profit: "Net Profit",
  total_expenses: "Total Expenses",
  avg_order_value: "Avg Order Value",
  orders: "Orders",
  shipping_margin: "Shipping Margin",
  gross_receipts: "Gross Receipts",
  sales_tax: "Sales Tax to Remit",
};

const FEE_CAVEAT =
  "Channel & processing fees are modeled from your configured rates and applied in aggregate, so this list shows plant sales (subtotal) only.";
const POSTAGE_CAVEAT =
  "Postage is summed from your Shipping expense category for the period, not matched to individual orders.";
const REFUND_NOTE = "Refunded orders are shown muted and netted out of the total.";

// --- small helpers -----------------------------------------------------------

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const itemCount = (o: OrderWithRelations) => o.items.reduce((s, it) => s + num(it.qty), 0);
const customerName = (o: OrderWithRelations) => o.customer?.name ?? "—";
const isRefunded = (o: OrderWithRelations) => o.status === "refunded";
const isFacilitator = (o: OrderWithRelations) => FACILITATOR_CHANNELS.includes(o.channel.toLowerCase());

/** Date cell that flags a refunded order inline (it nets out of the total). */
const orderDate = (o: OrderWithRelations) =>
  formatBusinessDate(o.placed_at) + (isRefunded(o) ? "  ·  refunded" : "");

const hasFlow = (cashflow: CashflowPoint[]) =>
  cashflow.some((c) => num(c.money_in) !== 0 || num(c.money_out) !== 0);

function inoutChart(cashflow: CashflowPoint[], caption: string): ChartSpec {
  if (!hasFlow(cashflow)) return { kind: "none", data: [], emptyHint: "No cash-flow history yet." };
  return {
    kind: "inout",
    caption,
    data: cashflow.map((c) => ({
      label: businessMonthShort(c.month),
      in: num(c.money_in),
      out: num(c.money_out),
      net: num(c.net),
    })),
  };
}

function barsChart(
  cashflow: CashflowPoint[],
  sel: (c: CashflowPoint) => number,
  caption: string,
  barColor: "brand" | "alert",
): ChartSpec {
  if (!hasFlow(cashflow)) return { kind: "none", data: [], emptyHint: "No trend history yet." };
  return {
    kind: "bars",
    caption,
    barColor,
    data: cashflow.map((c) => ({ label: businessMonthShort(c.month), value: num(sel(c)) })),
  };
}

const noChart = (emptyHint: string): ChartSpec => ({ kind: "none", data: [], emptyHint });

interface ColumnDef<Row> extends LineColumn {
  cell: (row: Row) => string;
}

function buildTable<Row extends { id: string }>(
  kind: LineItemKind,
  rows: Row[],
  columns: ColumnDef<Row>[],
  footer: { label: string; value: string } | undefined,
  opts: { emptyText: string; caveat?: string; muted?: (r: Row) => boolean },
): LineItemTable {
  const limited = rows.slice(0, MAX_ROWS);
  return {
    kind,
    columns: columns.map((c) => ({ header: c.header, align: c.align })),
    rows: limited.map((r) => ({ id: r.id, cells: columns.map((c) => c.cell(r)), muted: opts.muted?.(r) })),
    footer,
    emptyText: opts.emptyText,
    caveat: opts.caveat,
    truncatedNote: rows.length > MAX_ROWS ? `Showing ${MAX_ROWS} of ${rows.length}.` : undefined,
  };
}

/** Join the non-empty caveat fragments into one sentence group. */
const caveat = (...parts: (string | false | undefined)[]) =>
  parts.filter(Boolean).join(" ") || undefined;

// --- the builder -------------------------------------------------------------

export function buildStatDetail(key: StatKey, input: StatDetailInput): StatDetail {
  const { current: w, prior, breakdown, cashflow, period, windowOrders, windowExpenses } = input;

  if (!w) {
    return {
      key, title: TITLES[key], headline: "—", intro: "Loading…",
      composition: [], chart: noChart(""), lineItems: { kind: "none", columns: [], rows: [], emptyText: "" },
    };
  }

  const periodLabel = period === "month" ? "vs last month" : "vs last year";
  const delta = (sel: (x: FinanceKpiWindow) => number, higherIsBetter: boolean): Trend | undefined =>
    prior ? trendFor(num(sel(w)), num(sel(prior)), higherIsBetter, periodLabel) : undefined;

  const postage = breakdown.filter((b) => /shipping/i.test(b.category)).reduce((s, b) => s + num(b.total), 0);
  const orderCount = num(w.order_count);
  const aov = orderCount > 0 ? num(w.net_revenue) / orderCount : 0;

  // Orders subsets that mirror the SQL filters for each stat.
  const ordersActive = windowOrders.filter((o) => !isRefunded(o)); // == order_count rows
  const ordersTaxable = ordersActive.filter((o) => !isFacilitator(o) && num(o.tax) > 0);
  const anyRefunds = windowOrders.some(isRefunded);

  switch (key) {
    case "net_revenue":
      return {
        key, title: TITLES[key],
        headline: formatMoney(num(w.net_revenue)),
        delta: delta((x) => x.net_revenue, true),
        intro: "Plant sales after channel and processing fees — what you actually keep from revenue.",
        composition: [
          { label: "Product revenue", sub: "plant sales", amount: num(w.gross_sales) },
          { label: "Channel & processing fees", sub: "modeled", amount: num(w.channel_fees), outflow: true },
          { label: "Net revenue", amount: num(w.net_revenue), result: true },
        ],
        chart: inoutChart(cashflow, "Cash flow — trailing 12 months"),
        lineItems: buildTable("orders", windowOrders, [
          { header: "Date", cell: orderDate },
          { header: "Channel", cell: (o) => capitalize(o.channel) },
          { header: "Customer", cell: customerName },
          { header: "Items", align: "right", cell: (o) => String(itemCount(o)) },
          { header: "Subtotal", align: "right", cell: (o) => formatMoney(num(o.subtotal)) },
        ], { label: "Plant sales, net of refunds", value: formatMoney(num(w.gross_sales)) },
          { emptyText: "No orders in this period.", caveat: caveat(FEE_CAVEAT, anyRefunds && REFUND_NOTE), muted: isRefunded }),
        fullTab: { to: "/finances/revenue", label: "View revenue" },
      };

    case "net_profit":
      return {
        key, title: TITLES[key],
        headline: formatMoney(num(w.net_profit)),
        delta: delta((x) => x.net_profit, true),
        intro: "What's left after fees, shipping, operating expenses, and mileage.",
        useWaterfall: true,
        composition: [],
        chart: barsChart(cashflow, (c) => num(c.net), "Net profit — trailing 12 months", "brand"),
        lineItems: { kind: "none", columns: [], rows: [], emptyText: "" },
      };

    case "total_expenses":
      return {
        key, title: TITLES[key],
        headline: formatMoney(num(w.expenses)),
        delta: delta((x) => x.expenses, false),
        intro: "Everything you spent this period, grouped by category.",
        composition: [
          ...breakdown.map((b) => ({ label: b.category || "Uncategorized", amount: num(b.total), outflow: true })),
          { label: "Total expenses", amount: num(w.expenses), result: true },
        ],
        chart: barsChart(cashflow, (c) => num(c.money_out), "Expenses — trailing 12 months", "alert"),
        lineItems: buildTable("expenses", windowExpenses, [
          { header: "Date", cell: (e) => formatBusinessDate(e.occurred_on) },
          { header: "Category", cell: (e) => e.category || "Uncategorized" },
          { header: "Vendor", cell: (e) => e.vendor_name || "—" },
          { header: "Memo", cell: (e) => e.description || "—" },
          { header: "Amount", align: "right", cell: (e) => formatMoney(num(e.amount)) },
        ], { label: "Total expenses", value: formatMoney(num(w.expenses)) },
          { emptyText: "No expenses in this period." }),
        fullTab: { to: "/finances/expenses", label: "View all expenses" },
      };

    case "avg_order_value":
      return {
        key, title: TITLES[key],
        headline: orderCount > 0 ? formatMoney(aov) : "—",
        delta: delta((x) => (num(x.order_count) > 0 ? num(x.net_revenue) / num(x.order_count) : 0), true),
        intro: "Net revenue spread across the orders you fulfilled.",
        composition: [
          { label: "Net revenue", amount: num(w.net_revenue) },
          { label: "Orders", amount: 0, valueText: `÷ ${orderCount}` },
          { label: "Avg order value", amount: aov, result: true },
        ],
        chart: noChart("Per-order average isn't tracked month by month yet."),
        lineItems: buildTable("orders", windowOrders, [
          { header: "Date", cell: orderDate },
          { header: "Channel", cell: (o) => capitalize(o.channel) },
          { header: "Customer", cell: customerName },
          { header: "Items", align: "right", cell: (o) => String(itemCount(o)) },
          { header: "Subtotal", align: "right", cell: (o) => formatMoney(num(o.subtotal)) },
        ], { label: `Average of ${orderCount} order${orderCount === 1 ? "" : "s"}`, value: orderCount > 0 ? formatMoney(aov) : "—" },
          { emptyText: "No orders in this period.", caveat: caveat(FEE_CAVEAT, anyRefunds && REFUND_NOTE), muted: isRefunded }),
        fullTab: { to: "/orders", label: "View orders" },
      };

    case "orders": {
      const byStatus = new Map<string, number>();
      ordersActive.forEach((o) => byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1));
      return {
        key, title: TITLES[key],
        headline: String(orderCount),
        delta: delta((x) => x.order_count, true),
        intro: "Orders placed this period. Excludes cancelled and refunded.",
        composition: [
          ...[...byStatus].map(([status, count]) => ({ label: capitalize(status), amount: 0, valueText: String(count) })),
          { label: "Total orders", amount: 0, valueText: String(orderCount), result: true },
        ],
        chart: noChart("Monthly order counts aren't charted yet."),
        lineItems: buildTable("orders", ordersActive, [
          { header: "Date", cell: (o) => formatBusinessDate(o.placed_at) },
          { header: "Channel", cell: (o) => capitalize(o.channel) },
          { header: "Customer", cell: customerName },
          { header: "Items", align: "right", cell: (o) => String(itemCount(o)) },
          { header: "Total", align: "right", cell: (o) => formatMoney(num(o.total)) },
        ], { label: "Orders", value: String(orderCount) },
          { emptyText: "No orders in this period." }),
        fullTab: { to: "/orders", label: "View orders" },
      };
    }

    case "shipping_margin": {
      const margin = num(w.shipping_collected) - postage;
      return {
        key, title: TITLES[key],
        headline: formatMoney(margin),
        intro: "What buyers paid for shipping minus what postage actually cost.",
        composition: [
          { label: "Shipping collected", amount: num(w.shipping_collected) },
          { label: "Postage", sub: "Shipping expense category", amount: postage, outflow: true },
          { label: "Shipping margin", amount: Math.abs(margin), outflow: margin < 0, result: true },
        ],
        chart: noChart("Shipping margin isn't charted over time yet."),
        lineItems: buildTable("orders", windowOrders, [
          { header: "Date", cell: orderDate },
          { header: "Channel", cell: (o) => capitalize(o.channel) },
          { header: "Customer", cell: customerName },
          { header: "Shipping", align: "right", cell: (o) => formatMoney(num(o.shipping)) },
        ], { label: "Shipping collected, net of refunds", value: formatMoney(num(w.shipping_collected)) },
          { emptyText: "No orders in this period.", caveat: caveat(POSTAGE_CAVEAT, anyRefunds && REFUND_NOTE), muted: isRefunded }),
        fullTab: { to: "/finances/expenses", label: "View shipping costs" },
      };
    }

    case "gross_receipts":
      return {
        key, title: TITLES[key],
        headline: formatMoney(num(w.gross_receipts)),
        delta: delta((x) => x.gross_receipts, true),
        intro: "Plant sales plus shipping collected — the IRS gross-receipts (tax) basis.",
        composition: [
          { label: "Product revenue", sub: "plant sales", amount: num(w.gross_sales) },
          { label: "Shipping collected", amount: num(w.shipping_collected) },
          { label: "Gross receipts", sub: "tax basis", amount: num(w.gross_receipts), result: true },
        ],
        chart: inoutChart(cashflow, "Cash received — trailing 12 months"),
        lineItems: buildTable("orders", windowOrders, [
          { header: "Date", cell: orderDate },
          { header: "Channel", cell: (o) => capitalize(o.channel) },
          { header: "Subtotal", align: "right", cell: (o) => formatMoney(num(o.subtotal)) },
          { header: "Shipping", align: "right", cell: (o) => formatMoney(num(o.shipping)) },
          { header: "Receipts", align: "right", cell: (o) => formatMoney(num(o.subtotal) + num(o.shipping)) },
        ], { label: "Gross receipts, net of refunds", value: formatMoney(num(w.gross_receipts)) },
          { emptyText: "No orders in this period.", caveat: caveat(anyRefunds && REFUND_NOTE), muted: isRefunded }),
        fullTab: { to: "/finances/revenue", label: "View revenue" },
      };

    case "sales_tax":
      return {
        key, title: TITLES[key],
        headline: formatMoney(num(w.sales_tax_owed)),
        intro: "Sales tax you owe on direct-channel sales. Etsy and eBay collect and remit their own.",
        composition: [
          { label: "Sales tax collected", sub: "direct channels", amount: num(w.sales_tax_owed), result: true },
        ],
        chart: noChart("Monthly sales tax isn't charted yet."),
        lineItems: buildTable("orders", ordersTaxable, [
          { header: "Date", cell: (o) => formatBusinessDate(o.placed_at) },
          { header: "Channel", cell: (o) => capitalize(o.channel) },
          { header: "Tax", align: "right", cell: (o) => formatMoney(num(o.tax)) },
        ], { label: "Sales tax to remit", value: formatMoney(num(w.sales_tax_owed)) },
          { emptyText: "No taxable direct sales in this period." }),
        fullTab: { to: "/finances/tax-report", label: "View tax report" },
      };
  }
}
