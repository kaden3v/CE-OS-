import type { OrderWithRelations } from "@/hooks/useOrders";
import type { Tables } from "@/lib/database.types";

type Cultivar = Tables<"cultivars">;

/**
 * Pure aggregation helpers for the Overview dashboard.
 *
 * Mirrors the finance pages' approach: every figure shown is derived from real
 * order/line-item data, deterministically (no randomness), with no hardcoded
 * placeholders. Kept side-effect free so the math can be unit-tested in isolation.
 */

export interface ChartDatum {
  name: string;
  value: number;
}

const EXCLUDED_STATUSES = new Set(["cancelled", "refunded"]);

/** Orders that count toward revenue (excludes cancelled/refunded). */
const isRevenueOrder = (o: OrderWithRelations): boolean => !EXCLUDED_STATUSES.has(o.status);

/** A month identity that is comparable and unique across year boundaries. */
const monthIndex = (d: Date): number => d.getFullYear() * 12 + d.getMonth();

const titleCase = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Revenue per month for the trailing `months` window ending with the current
 * month. Always returns exactly `months` buckets (zero-filled) so the chart
 * has a stable x-axis even before much history exists.
 */
export function trailingMonthlyRevenue(orders: OrderWithRelations[], months = 12): ChartDatum[] {
  const now = new Date();
  const buckets: ChartDatum[] = [];
  const indexByKey = new Map<number, number>();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    indexByKey.set(monthIndex(d), buckets.length);
    buckets.push({ name: d.toLocaleString("en-US", { month: "short" }), value: 0 });
  }

  for (const o of orders) {
    if (!isRevenueOrder(o)) continue;
    const bucket = indexByKey.get(monthIndex(new Date(o.placed_at)));
    if (bucket === undefined) continue;
    buckets[bucket].value += Number(o.total);
  }

  return buckets;
}

/** Total revenue per sales channel, largest first (excludes cancelled/refunded). */
export function salesByChannel(orders: OrderWithRelations[]): ChartDatum[] {
  const map = new Map<string, number>();
  for (const o of orders) {
    if (!isRevenueOrder(o)) continue;
    const channel = o.channel || "other";
    map.set(channel, (map.get(channel) ?? 0) + Number(o.total));
  }
  return Array.from(map, ([name, value]) => ({ name: titleCase(name), value })).sort(
    (a, b) => b.value - a.value,
  );
}

export interface TopCultivars {
  slices: ChartDatum[];
  totalUnits: number;
}

/**
 * Units sold per cultivar, derived from order line items (same source the
 * Cultivar Profit page uses). Returns the top `limit` cultivars plus an
 * aggregated "Other" slice, and the grand total of all units sold.
 */
export function topCultivarsByUnits(
  orders: OrderWithRelations[],
  cultivars: Cultivar[],
  limit = 4,
): TopCultivars {
  const map = new Map<string, number>();
  for (const o of orders) {
    if (!isRevenueOrder(o)) continue;
    for (const item of o.items) {
      const cultivar = item.cultivar_id ? cultivars.find((c) => c.id === item.cultivar_id) : null;
      const name = cultivar?.name ?? item.name_snapshot;
      map.set(name, (map.get(name) ?? 0) + item.qty);
    }
  }

  const sorted = Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const totalUnits = sorted.reduce((s, d) => s + d.value, 0);

  if (sorted.length <= limit) return { slices: sorted, totalUnits };

  const top = sorted.slice(0, limit);
  const otherUnits = sorted.slice(limit).reduce((s, d) => s + d.value, 0);
  return { slices: [...top, { name: "Other", value: otherUnits }], totalUnits };
}

export interface CohortRow {
  /** Cohort acquisition month, e.g. "Jan '26". */
  label: string;
  /** Number of customers first seen in this month. */
  size: number;
  /** Retention % per month-offset; `null` for offsets that are still in the future. */
  cells: (number | null)[];
}

export interface CohortRetention {
  rows: CohortRow[];
  /** Number of month-offset columns to render. */
  offsets: number;
}

/**
 * Real customer cohort retention.
 *
 * A customer's cohort is the month of their first (non-cancelled) order. For
 * each subsequent month-offset we report the share of that cohort who placed at
 * least one order. Offset 0 is the acquisition month and is always 100%. Months
 * that haven't happened yet are `null` so the UI can leave them blank.
 */
export function cohortRetention(
  orders: OrderWithRelations[],
  opts: { maxCohorts?: number; maxOffset?: number } = {},
): CohortRetention {
  const maxCohorts = opts.maxCohorts ?? 6;
  const maxOffset = opts.maxOffset ?? 6;
  const nowIdx = monthIndex(new Date());

  // Per-customer: first active month + the set of all active months.
  const byCustomer = new Map<string, { first: number; active: Set<number> }>();
  for (const o of orders) {
    if (!isRevenueOrder(o)) continue;
    const cid = o.customer?.id;
    if (!cid) continue;
    const idx = monthIndex(new Date(o.placed_at));
    const entry = byCustomer.get(cid);
    if (entry) {
      entry.first = Math.min(entry.first, idx);
      entry.active.add(idx);
    } else {
      byCustomer.set(cid, { first: idx, active: new Set([idx]) });
    }
  }

  if (byCustomer.size === 0) return { rows: [], offsets: 0 };

  // Group customers into cohorts keyed by their first month.
  const cohorts = new Map<number, { active: Set<number> }[]>();
  for (const entry of byCustomer.values()) {
    const arr = cohorts.get(entry.first) ?? [];
    arr.push({ active: entry.active });
    cohorts.set(entry.first, arr);
  }

  const cohortKeys = Array.from(cohorts.keys())
    .sort((a, b) => a - b)
    .slice(-maxCohorts);

  const offsets = Math.min(maxOffset, nowIdx - cohortKeys[0] + 1);

  const rows: CohortRow[] = cohortKeys.map((key) => {
    const members = cohorts.get(key)!;
    const size = members.length;
    const cells: (number | null)[] = [];
    for (let off = 0; off < offsets; off++) {
      const targetIdx = key + off;
      if (targetIdx > nowIdx) {
        cells.push(null);
        continue;
      }
      const active = members.filter((m) => m.active.has(targetIdx)).length;
      cells.push((active / size) * 100);
    }
    const label = new Date(Math.floor(key / 12), key % 12, 1).toLocaleString("en-US", {
      month: "short",
      year: "2-digit",
    });
    return { label, size, cells };
  });

  return { rows, offsets };
}
