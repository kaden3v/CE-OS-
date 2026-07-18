/**
 * Pure aggregation for the Dashboard's sales & customer panels.
 *
 * Everything here is computed client-side from the already-loaded orders list
 * (a few hundred rows) — money KPIs stay server-side in the finance RPCs. All
 * functions take `now` explicitly so tests are deterministic.
 *
 * "New customer" is defined by FIRST VALID ORDER date, not customers.created_at:
 * the Etsy history import created every historical customer on one day, so
 * created_at says nothing about when someone actually became a customer.
 */

export interface MetricOrderItem {
  qty: number;
  name_snapshot: string;
  price?: number | string | null;
}

/** The slice of an order the dashboard math needs (OrderWithRelations satisfies it). */
export interface MetricOrder {
  id: string;
  customer_id: string | null;
  customer?: { id: string; name: string } | null;
  placed_at: string;
  status: string;
  total: number | string;
  channel: string;
  items: MetricOrderItem[];
}

const DAY_MS = 86_400_000;
const n = (v: number | string | null | undefined): number => Number(v ?? 0);

/** Orders that count toward revenue and customer history. */
export function validOrders<T extends Pick<MetricOrder, "status">>(orders: readonly T[]): T[] {
  return orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded");
}

// ---------------------------------------------------------------------------
// Rolling-window sales stats
// ---------------------------------------------------------------------------

export interface WindowStats {
  orders: number;
  revenue: number;
  units: number;
  /** revenue / orders, or null with no orders. */
  aov: number | null;
  prevOrders: number;
  prevRevenue: number;
  prevAov: number | null;
}

/** Sales in the trailing `days` window vs the window immediately before it. */
export function windowStats(orders: readonly MetricOrder[], now: number, days = 30): WindowStats {
  const start = now - days * DAY_MS;
  const prevStart = now - 2 * days * DAY_MS;
  let cur = { orders: 0, revenue: 0, units: 0 };
  let prev = { orders: 0, revenue: 0 };
  for (const o of validOrders(orders)) {
    const t = new Date(o.placed_at).getTime();
    if (Number.isNaN(t) || t > now) continue;
    if (t >= start) {
      cur = {
        orders: cur.orders + 1,
        revenue: cur.revenue + n(o.total),
        units: cur.units + o.items.reduce((s, it) => s + n(it.qty), 0),
      };
    } else if (t >= prevStart) {
      prev = { orders: prev.orders + 1, revenue: prev.revenue + n(o.total) };
    }
  }
  return {
    ...cur,
    aov: cur.orders > 0 ? cur.revenue / cur.orders : null,
    prevOrders: prev.orders,
    prevRevenue: prev.revenue,
    prevAov: prev.orders > 0 ? prev.revenue / prev.orders : null,
  };
}

// ---------------------------------------------------------------------------
// Customer acquisition & loyalty
// ---------------------------------------------------------------------------

export interface MonthCount {
  /** Short month label, e.g. "Feb". */
  label: string;
  value: number;
}

export interface TopCustomer {
  id: string;
  name: string;
  orders: number;
  total: number;
}

export interface CustomerStats {
  /** Customers with at least one valid order. */
  totalCustomers: number;
  repeatCustomers: number;
  /** repeatCustomers / totalCustomers, or null with no customers. */
  repeatRate: number | null;
  /** First-order counts for the current calendar month and the one before. */
  newThisMonth: number;
  newLastMonth: number;
  /** First-order counts per month, oldest → current (length = months). */
  newByMonth: MonthCount[];
  /** Share of trailing-30d orders (with a known customer) from returning customers. */
  returningShare30: number | null;
  /** Highest-revenue customers over the trailing 90 days. */
  topCustomers90: TopCustomer[];
}

export function customerStats(orders: readonly MetricOrder[], now: number, months = 6): CustomerStats {
  const valid = validOrders(orders);

  // First valid order per customer + order counts. Guests (null customer_id)
  // have no identity to track, so they stay out of customer metrics.
  const firstOrder = new Map<string, number>();
  const orderCount = new Map<string, number>();
  for (const o of valid) {
    if (!o.customer_id) continue;
    const t = new Date(o.placed_at).getTime();
    if (Number.isNaN(t)) continue;
    const prev = firstOrder.get(o.customer_id);
    if (prev === undefined || t < prev) firstOrder.set(o.customer_id, t);
    orderCount.set(o.customer_id, (orderCount.get(o.customer_id) ?? 0) + 1);
  }

  const totalCustomers = firstOrder.size;
  const repeatCustomers = [...orderCount.values()].filter((c) => c >= 2).length;

  // First-order counts bucketed into the last `months` calendar months.
  const ref = new Date(now);
  const buckets: { start: number; end: number; label: string }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const end = new Date(ref.getFullYear(), ref.getMonth() - i + 1, 1);
    buckets.push({
      start: start.getTime(),
      end: end.getTime(),
      label: start.toLocaleString(undefined, { month: "short" }),
    });
  }
  const newByMonth = buckets.map((b) => ({
    label: b.label,
    value: [...firstOrder.values()].filter((t) => t >= b.start && t < b.end).length,
  }));
  const lastMonthStart = new Date(ref.getFullYear(), ref.getMonth() - 1, 1).getTime();
  const thisMonthStart = new Date(ref.getFullYear(), ref.getMonth(), 1).getTime();
  const newThisMonth = [...firstOrder.values()].filter((t) => t >= thisMonthStart).length;
  const newLastMonth = [...firstOrder.values()].filter((t) => t >= lastMonthStart && t < thisMonthStart).length;

  // Returning share of the trailing 30 days: an order counts as returning when
  // its customer's first order came strictly before it.
  const cutoff30 = now - 30 * DAY_MS;
  let with30 = 0;
  let returning30 = 0;
  for (const o of valid) {
    if (!o.customer_id) continue;
    const t = new Date(o.placed_at).getTime();
    if (Number.isNaN(t) || t < cutoff30 || t > now) continue;
    with30 += 1;
    const first = firstOrder.get(o.customer_id);
    if (first !== undefined && first < t) returning30 += 1;
  }

  // Top customers by trailing-90d revenue.
  const cutoff90 = now - 90 * DAY_MS;
  const agg = new Map<string, TopCustomer>();
  for (const o of valid) {
    if (!o.customer_id) continue;
    const t = new Date(o.placed_at).getTime();
    if (Number.isNaN(t) || t < cutoff90 || t > now) continue;
    const cur = agg.get(o.customer_id) ?? {
      id: o.customer_id,
      name: o.customer?.name ?? "Unknown",
      orders: 0,
      total: 0,
    };
    agg.set(o.customer_id, { ...cur, orders: cur.orders + 1, total: cur.total + n(o.total) });
  }
  const topCustomers90 = [...agg.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  return {
    totalCustomers,
    repeatCustomers,
    repeatRate: totalCustomers > 0 ? repeatCustomers / totalCustomers : null,
    newThisMonth,
    newLastMonth,
    newByMonth,
    returningShare30: with30 > 0 ? returning30 / with30 : null,
    topCustomers90,
  };
}

// ---------------------------------------------------------------------------
// Per-customer purchase aggregates & lifecycle segments
// ---------------------------------------------------------------------------

export interface CustomerAggregate {
  customerId: string;
  orders: number;
  /** Lifetime spend across valid orders. */
  total: number;
  /** Timestamp of the first valid order. */
  firstAt: number;
  /** Timestamp of the most recent valid order. */
  lastAt: number;
}

/** Lifetime purchase roll-up per customer id (valid orders only). */
export function customerAggregates(orders: readonly MetricOrder[]): Map<string, CustomerAggregate> {
  const map = new Map<string, CustomerAggregate>();
  for (const o of validOrders(orders)) {
    if (!o.customer_id) continue;
    const t = new Date(o.placed_at).getTime();
    if (Number.isNaN(t)) continue;
    const cur = map.get(o.customer_id);
    map.set(
      o.customer_id,
      cur
        ? {
            ...cur,
            orders: cur.orders + 1,
            total: cur.total + n(o.total),
            firstAt: Math.min(cur.firstAt, t),
            lastAt: Math.max(cur.lastAt, t),
          }
        : { customerId: o.customer_id, orders: 1, total: n(o.total), firstAt: t, lastAt: t },
    );
  }
  return map;
}

export type CustomerSegment = "new" | "repeat" | "one-time" | "lapsed" | "prospect";

export const SEGMENT_LABEL: Record<CustomerSegment, string> = {
  new: "New",
  repeat: "Repeat",
  "one-time": "One-time",
  lapsed: "Lapsed",
  prospect: "Prospect",
};

const NEW_WINDOW_MS = 30 * DAY_MS;
const LAPSED_AFTER_MS = 90 * DAY_MS;

/**
 * One lifecycle badge per customer, priority-ordered:
 * prospect (never ordered) → new (first order ≤30d ago) → lapsed (no order in
 * 90d) → repeat (2+ orders) → one-time.
 */
export function customerSegment(agg: CustomerAggregate | undefined, now: number): CustomerSegment {
  if (!agg || agg.orders === 0) return "prospect";
  if (now - agg.firstAt <= NEW_WINDOW_MS) return "new";
  if (now - agg.lastAt > LAPSED_AFTER_MS) return "lapsed";
  return agg.orders >= 2 ? "repeat" : "one-time";
}

// ---------------------------------------------------------------------------
// Channel mix & top sellers (trailing window)
// ---------------------------------------------------------------------------

export interface ChannelSlice {
  channel: string;
  orders: number;
  revenue: number;
  /** Revenue share of the window (0..1). */
  share: number;
  aov: number | null;
}

export function channelMix(orders: readonly MetricOrder[], now: number, days = 30): ChannelSlice[] {
  const start = now - days * DAY_MS;
  const agg = new Map<string, { orders: number; revenue: number }>();
  for (const o of validOrders(orders)) {
    const t = new Date(o.placed_at).getTime();
    if (Number.isNaN(t) || t < start || t > now) continue;
    const cur = agg.get(o.channel) ?? { orders: 0, revenue: 0 };
    agg.set(o.channel, { orders: cur.orders + 1, revenue: cur.revenue + n(o.total) });
  }
  const total = [...agg.values()].reduce((s, c) => s + c.revenue, 0);
  return [...agg.entries()]
    .map(([channel, c]) => ({
      channel,
      ...c,
      share: total > 0 ? c.revenue / total : 0,
      aov: c.orders > 0 ? c.revenue / c.orders : null,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface TopSeller {
  name: string;
  units: number;
  revenue: number;
}

export function topSellers(orders: readonly MetricOrder[], now: number, days = 30, limit = 5): TopSeller[] {
  const start = now - days * DAY_MS;
  const agg = new Map<string, { units: number; revenue: number }>();
  for (const o of validOrders(orders)) {
    const t = new Date(o.placed_at).getTime();
    if (Number.isNaN(t) || t < start || t > now) continue;
    for (const it of o.items) {
      const cur = agg.get(it.name_snapshot) ?? { units: 0, revenue: 0 };
      agg.set(it.name_snapshot, {
        units: cur.units + n(it.qty),
        revenue: cur.revenue + n(it.qty) * n(it.price),
      });
    }
  }
  return [...agg.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
    .slice(0, limit);
}
