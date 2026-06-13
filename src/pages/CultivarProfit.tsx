import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { CultivarName } from "@/components/ui/CultivarName";
import { EmptyState } from "@/components/ui/StateRenderer";
import { useOrders } from "@/hooks/useOrders";
import { useEntity } from "@/hooks/useEntity";
import { formatMoney } from "@/lib/format";
import type { Tables } from "@/lib/database.types";

type Cultivar = Tables<"cultivars">;
type Run = Tables<"production_runs">;
type RunSupply = Tables<"production_run_supplies">;

export default function CultivarProfit() {
  const { data: orders } = useOrders();
  const { data: cultivars } = useEntity<Cultivar>("cultivars", []);
  const { data: runs } = useEntity<Run>("production_runs", [], { orderBy: "created_at" });
  const { data: runSupplies } = useEntity<RunSupply>("production_run_supplies", [], { orderBy: "created_at" });

  // Per-UNIT production cost per cultivar = total run cost / total units produced.
  // Costing COGS on a per-unit basis lets us match it to units SOLD below, rather
  // than dumping a cultivar's whole lifetime production cost onto its sales.
  const unitCostByCultivar = useMemo(() => {
    const materialsByRun = new Map<string, number>();
    runSupplies.forEach((s) => {
      materialsByRun.set(s.run_id, (materialsByRun.get(s.run_id) ?? 0) + Number(s.qty) * Number(s.unit_cost_snapshot));
    });
    const agg = new Map<string, { cost: number; qty: number }>();
    runs.forEach((r) => {
      if (!r.cultivar_id) return;
      const cost = (materialsByRun.get(r.id) ?? 0) + Number(r.labor_hours) * Number(r.labor_rate);
      const cur = agg.get(r.cultivar_id) ?? { cost: 0, qty: 0 };
      cur.cost += cost;
      cur.qty += Number(r.quantity);
      agg.set(r.cultivar_id, cur);
    });
    const map = new Map<string, number>();
    agg.forEach((v, k) => map.set(k, v.qty > 0 ? v.cost / v.qty : 0));
    return map;
  }, [runs, runSupplies]);

  // Per-cultivar units, REALIZED revenue, and matched COGS from order_items.
  // Realized revenue allocates each order's discount (subtotal vs the sum of its
  // line list prices) pro-rata across its lines, so totals reconcile to the
  // server's product revenue ($6,435.67) instead of overstating at list price.
  const rows = useMemo(() => {
    type Row = { id: string; cultivarId: string | null; name: string; units: number; revenue: number; orders: number; cost: number };
    const map = new Map<string, Row>();
    for (const order of orders) {
      if (order.status === "cancelled" || order.status === "refunded") continue;
      const lineSum = order.items.reduce((s, it) => s + Number(it.price) * it.qty, 0);
      const scale = lineSum > 0 ? Number(order.subtotal) / lineSum : 1;
      const seen = new Set<string>();
      for (const item of order.items) {
        const key = item.cultivar_id ?? `name:${item.name_snapshot}`;
        const cultivar = item.cultivar_id ? cultivars.find((c) => c.id === item.cultivar_id) : null;
        const name = cultivar?.name ?? item.name_snapshot;
        const revenue = Number(item.price) * item.qty * scale;
        const existing = map.get(key);
        if (existing) {
          existing.units += item.qty;
          existing.revenue += revenue;
          if (!seen.has(key)) existing.orders += 1;
        } else {
          map.set(key, { id: key, cultivarId: item.cultivar_id, name, units: item.qty, revenue, orders: 1, cost: 0 });
        }
        seen.add(key);
      }
    }
    // Sold-basis COGS: units sold × the cultivar's per-unit production cost.
    for (const row of map.values()) {
      row.cost = row.cultivarId ? row.units * (unitCostByCultivar.get(row.cultivarId) ?? 0) : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [orders, cultivars, unitCostByCultivar]);

  const totals = useMemo(
    () => rows.reduce((s, r) => ({ units: s.units + r.units, revenue: s.revenue + r.revenue }), { units: 0, revenue: 0 }),
    [rows],
  );

  const columns = [
    { accessorKey: "name", header: "Cultivar", cell: (info: any) => <CultivarName name={info.getValue()} className="font-medium" /> },
    { accessorKey: "units", header: "Units Sold", cell: (info: any) => <span className="tabular-nums">{info.getValue()}</span> },
    { accessorKey: "orders", header: "Orders", cell: (info: any) => <span className="tabular-nums text-text-secondary">{info.getValue()}</span> },
    { accessorKey: "revenue", header: "Revenue", cell: (info: any) => <span className="tabular-nums font-medium">{formatMoney(info.getValue())}</span> },
    {
      accessorKey: "cost",
      header: "Est. COGS",
      cell: (info: any) => (
        <span className="tabular-nums text-text-secondary">
          {info.getValue() > 0 ? formatMoney(info.getValue()) : "—"}
        </span>
      ),
    },
    {
      id: "margin",
      header: "Margin",
      cell: (info: any) => {
        const { revenue, cost } = info.row.original;
        if (cost <= 0) return <span className="text-text-tertiary">—</span>;
        const margin = revenue - cost;
        const pct = revenue > 0 ? (margin / revenue) * 100 : 0;
        return (
          <span className={`tabular-nums font-medium ${margin < 0 ? "text-status-alert" : "text-status-ok"}`}>
            {formatMoney(margin)} <span className="text-text-tertiary font-normal">· {pct.toFixed(0)}%</span>
          </span>
        );
      },
    },
    {
      id: "share",
      header: "% of revenue",
      cell: (info: any) => {
        const pct = totals.revenue > 0 ? (info.row.original.revenue / totals.revenue) * 100 : 0;
        return <span className="text-text-secondary tabular-nums">{pct.toFixed(1)}%</span>;
      },
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/cultivars">
          <Button variant="outline" className="w-10 px-0" aria-label="Back to cultivars">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold mb-2">Cultivar Profit</h1>
          <p className="text-sm text-text-secondary">Realized revenue per cultivar (after order discounts), with sold-basis COGS.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Total revenue</div>
          <div className="text-3xl font-semibold tabular-nums">{formatMoney(totals.revenue)}</div>
        </Card>
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Units sold</div>
          <div className="text-3xl font-semibold tabular-nums">{totals.units}</div>
        </Card>
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Cultivars represented</div>
          <div className="text-3xl font-semibold tabular-nums">{rows.length}</div>
        </Card>
      </div>

      <Card className="flex-1 overflow-auto flex flex-col">
        {rows.length === 0 ? (
          <EmptyState
            title="No revenue data yet"
            description="Sell some plants — completed orders will populate this view."
          />
        ) : (
          <DataTable columns={columns} data={rows} />
        )}
      </Card>

      <p className="text-xs text-text-tertiary italic mt-4">
        Revenue is realized (each order's discount allocated across its lines), so the total reconciles with
        recognized product revenue (shipping and platform fees sit in the Finances P&L, not here). Est. COGS is
        units sold × the cultivar's per-unit production cost (materials +
        labor ÷ units produced, from Finances → Production). Cultivars with no logged runs show no margin.
      </p>
    </div>
  );
}
