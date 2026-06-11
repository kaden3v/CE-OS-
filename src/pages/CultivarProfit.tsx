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
import type { Tables } from "@/lib/database.types";

type Cultivar = Tables<"cultivars">;
type Run = Tables<"production_runs">;
type RunItem = Tables<"production_run_items">;

export default function CultivarProfit() {
  const { data: orders } = useOrders();
  const { data: cultivars } = useEntity<Cultivar>("cultivars", []);
  const { data: runs } = useEntity<Run>("production_runs", [], { orderBy: "created_at" });
  const { data: runItems } = useEntity<RunItem>("production_run_items", [], { orderBy: "created_at" });

  // COGS per cultivar from production runs: materials (snapshotted unit costs)
  // plus labor, attributed to the run's cultivar.
  const costByCultivar = useMemo(() => {
    const materialsByRun = new Map<string, number>();
    runItems.forEach((i) => {
      materialsByRun.set(i.run_id, (materialsByRun.get(i.run_id) ?? 0) + Number(i.qty_used) * Number(i.unit_cost));
    });
    const map = new Map<string, number>();
    runs.forEach((r) => {
      if (!r.cultivar_id) return;
      const cost = (materialsByRun.get(r.id) ?? 0) + Number(r.labor_hours) * Number(r.labor_rate);
      map.set(r.cultivar_id, (map.get(r.cultivar_id) ?? 0) + cost);
    });
    return map;
  }, [runs, runItems]);

  // Aggregate per-cultivar units & revenue from order_items; cost from runs.
  const rows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; units: number; revenue: number; orders: number; cost: number }>();
    for (const order of orders) {
      if (order.status === "cancelled" || order.status === "refunded") continue;
      const seen = new Set<string>();
      for (const item of order.items) {
        const key = item.cultivar_id ?? `name:${item.name_snapshot}`;
        const cultivar = item.cultivar_id ? cultivars.find((c) => c.id === item.cultivar_id) : null;
        const name = cultivar?.name ?? item.name_snapshot;
        const existing = map.get(key);
        const revenue = Number(item.price) * item.qty;
        if (existing) {
          existing.units += item.qty;
          existing.revenue += revenue;
          if (!seen.has(key)) existing.orders += 1;
        } else {
          map.set(key, {
            id: key,
            name,
            units: item.qty,
            revenue,
            orders: 1,
            cost: item.cultivar_id ? costByCultivar.get(item.cultivar_id) ?? 0 : 0,
          });
        }
        seen.add(key);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [orders, cultivars, costByCultivar]);

  const totals = useMemo(
    () => rows.reduce((s, r) => ({ units: s.units + r.units, revenue: s.revenue + r.revenue }), { units: 0, revenue: 0 }),
    [rows],
  );

  const columns = [
    { accessorKey: "name", header: "Cultivar", cell: (info: any) => <CultivarName name={info.getValue()} className="font-medium" /> },
    { accessorKey: "units", header: "Units Sold", cell: (info: any) => <span className="tabular-nums">{info.getValue()}</span> },
    { accessorKey: "orders", header: "Orders", cell: (info: any) => <span className="tabular-nums text-text-secondary">{info.getValue()}</span> },
    { accessorKey: "revenue", header: "Revenue", cell: (info: any) => <span className="tabular-nums font-medium">${info.getValue().toFixed(2)}</span> },
    {
      accessorKey: "cost",
      header: "Est. COGS",
      cell: (info: any) => (
        <span className="tabular-nums text-text-secondary">
          {info.getValue() > 0 ? `$${info.getValue().toFixed(2)}` : "—"}
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
            ${margin.toFixed(2)} <span className="text-text-tertiary font-normal">· {pct.toFixed(0)}%</span>
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
          <p className="text-sm text-text-secondary">Revenue per cultivar, derived from order line items.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Total revenue</div>
          <div className="text-3xl font-semibold tabular-nums">${totals.revenue.toFixed(2)}</div>
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
        Est. COGS comes from production runs (Finances → Production): supplies consumed at snapshotted
        cost plus labor, attributed to each run's cultivar. Cultivars with no logged runs show no margin.
      </p>
    </div>
  );
}
