import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileSpreadsheet, ChevronDown } from "lucide-react";
import { useEntity } from "@/hooks/useEntity";
import { useOrders } from "@/hooks/useOrders";
import { useApp } from "@/contexts/AppContext";
import type { Tables } from "@/lib/database.types";

type Expense = Tables<"expenses">;
type Shipment = Tables<"shipments">;
type Run = Tables<"production_runs">;
type RunItem = Tables<"production_run_items">;

const EXCLUDED_ORDER_STATUSES = ["cancelled", "refunded"];

const csvCell = (v: string | number | null | undefined): string => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const downloadCsv = (filename: string, rows: string[][]) => {
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function TaxReport() {
  const { data: expenses } = useEntity<Expense>("expenses", []);
  const { data: orders } = useOrders();
  const { data: shipments } = useEntity<Shipment>("shipments", []);
  const { data: runs } = useEntity<Run>("production_runs", [], { orderBy: "created_at" });
  const { data: runItems } = useEntity<RunItem>("production_run_items", [], { orderBy: "created_at" });
  const { addToast } = useApp();

  const years = useMemo(() => {
    const ys = new Set<number>();
    expenses.forEach((e) => ys.add(new Date(e.occurred_on).getFullYear()));
    orders.forEach((o) => ys.add(new Date(o.placed_at).getFullYear()));
    if (ys.size === 0) ys.add(new Date().getFullYear());
    return Array.from(ys).sort((a, b) => b - a);
  }, [expenses, orders]);
  const [year, setYear] = useState<number>(years[0] ?? new Date().getFullYear());

  // Destination state per order (from its shipment) — what sales-tax nexus
  // questions actually need.
  const stateByOrder = useMemo(() => {
    const map = new Map<string, string>();
    shipments.forEach((s) => {
      if (s.ship_to_state) map.set(s.order_id, s.ship_to_state.toUpperCase());
    });
    return map;
  }, [shipments]);

  const sales = useMemo(() => {
    const valid = orders.filter(
      (o) => new Date(o.placed_at).getFullYear() === year && !EXCLUDED_ORDER_STATUSES.includes(o.status),
    );
    const byChannel: Record<string, number> = {};
    const byState: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    let total = 0;
    let taxCollected = 0;
    for (const o of valid) {
      const amount = Number(o.total);
      total += amount;
      taxCollected += Number(o.tax);
      byChannel[o.channel] = (byChannel[o.channel] ?? 0) + amount;
      const st = stateByOrder.get(o.id) ?? "Unknown";
      byState[st] = (byState[st] ?? 0) + amount;
      const m = new Date(o.placed_at).toLocaleString("en-US", { month: "short" });
      byMonth[m] = (byMonth[m] ?? 0) + amount;
    }
    return { valid, byChannel, byState, byMonth, total, taxCollected };
  }, [orders, year, stateByOrder]);

  // Schedule C-style COGS for the year, from production runs.
  const cogs = useMemo(() => {
    const yearRuns = runs.filter((r) => new Date(r.run_on).getFullYear() === year);
    const runIds = new Set(yearRuns.map((r) => r.id));
    const materials = runItems
      .filter((i) => runIds.has(i.run_id))
      .reduce((s, i) => s + Number(i.qty_used) * Number(i.unit_cost), 0);
    const labor = yearRuns.reduce((s, r) => s + Number(r.labor_hours) * Number(r.labor_rate), 0);
    return { materials, labor, total: materials + labor, runCount: yearRuns.length };
  }, [runs, runItems, year]);

  const { byCategory, byMonth, total } = useMemo(() => {
    const filtered = expenses.filter((e) => new Date(e.occurred_on).getFullYear() === year);
    const byCategory: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    let total = 0;
    for (const e of filtered) {
      const cat = e.category ?? "Uncategorized";
      byCategory[cat] = (byCategory[cat] ?? 0) + Number(e.amount);
      const m = new Date(e.occurred_on).toLocaleString("en-US", { month: "short" });
      byMonth[m] = (byMonth[m] ?? 0) + Number(e.amount);
      total += Number(e.amount);
    }
    return { byCategory, byMonth, total };
  }, [expenses, year]);

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const maxMonthly = Math.max(...Object.values(byMonth), 0);

  const handleExportExpensesCsv = () => {
    const rows: string[][] = [["Date", "Category", "Amount", "Description"]];
    expenses
      .filter((e) => new Date(e.occurred_on).getFullYear() === year)
      .forEach((e) => {
        rows.push([e.occurred_on, e.category ?? "", Number(e.amount).toFixed(2), e.description ?? ""]);
      });
    downloadCsv(`expenses-${year}.csv`, rows);
    addToast({ title: "CSV exported", description: `expenses-${year}.csv`, status: "ok" });
  };

  // Flat, accounting-software-friendly sales export (one row per order).
  const handleExportSalesCsv = () => {
    const rows: string[][] = [["Date", "Order", "Channel", "Customer", "Ship-to state", "Status", "Subtotal", "Shipping", "Tax", "Total"]];
    sales.valid.forEach((o) => {
      rows.push([
        new Date(o.placed_at).toISOString().slice(0, 10),
        o.id.slice(0, 8),
        o.channel,
        o.customer?.name ?? "",
        stateByOrder.get(o.id) ?? "",
        o.status,
        Number(o.subtotal).toFixed(2),
        Number(o.shipping).toFixed(2),
        Number(o.tax).toFixed(2),
        Number(o.total).toFixed(2),
      ]);
    });
    downloadCsv(`sales-${year}.csv`, rows);
    addToast({ title: "CSV exported", description: `sales-${year}.csv`, status: "ok" });
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Tax Report</h1>
          <p className="text-sm text-text-secondary">Sales and expense summaries for tax season.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              className="appearance-none bg-bg-base border border-border-subtle rounded-md pl-3 pr-8 py-2 text-sm font-medium hover:border-border-strong focus:outline-none"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
          </div>
          <Button variant="outline" onClick={handleExportSalesCsv}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Sales CSV
          </Button>
          <Button variant="brand" onClick={handleExportExpensesCsv}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Expenses CSV
          </Button>
        </div>
      </div>

      {/* Sales (what you collected) */}
      <h2 className="text-base font-medium mb-4">Sales</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Gross sales {year}</div>
          <div className="text-3xl font-semibold tabular-nums">${sales.total.toFixed(2)}</div>
        </Card>
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Tax collected</div>
          <div className="text-3xl font-semibold tabular-nums">${sales.taxCollected.toFixed(2)}</div>
        </Card>
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Orders</div>
          <div className="text-3xl font-semibold tabular-nums">{sales.valid.length}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="p-6">
          <h3 className="text-sm font-medium mb-4">Sales by Channel</h3>
          {Object.keys(sales.byChannel).length === 0 ? (
            <p className="text-sm text-text-tertiary">No sales for {year}.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(sales.byChannel)
                .sort((a, b) => b[1] - a[1])
                .map(([channel, amount]) => {
                  const pct = sales.total > 0 ? (amount / sales.total) * 100 : 0;
                  return (
                    <div key={channel} className="space-y-1">
                      <div className="flex justify-between text-sm capitalize">
                        <span>{channel}</span>
                        <span className="tabular-nums">${amount.toFixed(2)} <span className="text-text-tertiary">· {pct.toFixed(0)}%</span></span>
                      </div>
                      <div className="h-1.5 bg-bg-active rounded overflow-hidden">
                        <div className="h-full bg-accent-brand" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium mb-4">Sales by Ship-to State</h3>
          {Object.keys(sales.byState).length === 0 ? (
            <p className="text-sm text-text-tertiary">No sales for {year}. States come from each order's shipment.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(sales.byState)
                .sort((a, b) => b[1] - a[1])
                .map(([st, amount]) => {
                  const pct = sales.total > 0 ? (amount / sales.total) * 100 : 0;
                  return (
                    <div key={st} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{st}</span>
                        <span className="tabular-nums">${amount.toFixed(2)} <span className="text-text-tertiary">· {pct.toFixed(0)}%</span></span>
                      </div>
                      <div className="h-1.5 bg-bg-active rounded overflow-hidden">
                        <div className="h-full bg-accent-brand" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>
      </div>

      {/* Cost of goods (Schedule C) */}
      <h2 className="text-base font-medium mb-4">Cost of Goods (Schedule C)</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Materials</div>
          <div className="text-3xl font-semibold tabular-nums">${cogs.materials.toFixed(2)}</div>
          <div className="text-xs text-text-tertiary mt-1">supplies consumed in {cogs.runCount} production run{cogs.runCount === 1 ? "" : "s"}</div>
        </Card>
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Labor</div>
          <div className="text-3xl font-semibold tabular-nums">${cogs.labor.toFixed(2)}</div>
          <div className="text-xs text-text-tertiary mt-1">hours × rate on production runs</div>
        </Card>
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Total COGS {year}</div>
          <div className="text-3xl font-semibold tabular-nums">${cogs.total.toFixed(2)}</div>
          <div className="text-xs text-text-tertiary mt-1">log runs under Finances → Production</div>
        </Card>
      </div>

      <h2 className="text-base font-medium mb-4">Expenses</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Total {year}</div>
          <div className="text-3xl font-semibold tabular-nums">${total.toFixed(2)}</div>
        </Card>
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Categories</div>
          <div className="text-3xl font-semibold tabular-nums">{Object.keys(byCategory).length}</div>
        </Card>
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Entries</div>
          <div className="text-3xl font-semibold tabular-nums">{expenses.filter((e) => new Date(e.occurred_on).getFullYear() === year).length}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="p-6">
          <h3 className="text-sm font-medium mb-4">By Category</h3>
          {Object.keys(byCategory).length === 0 ? (
            <p className="text-sm text-text-tertiary">No expenses for {year}.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amount]) => {
                  const pct = total > 0 ? (amount / total) * 100 : 0;
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{cat}</span>
                        <span className="tabular-nums">${amount.toFixed(2)} <span className="text-text-tertiary">· {pct.toFixed(0)}%</span></span>
                      </div>
                      <div className="h-1.5 bg-bg-active rounded overflow-hidden">
                        <div className="h-full bg-accent-brand" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium mb-4">By Month</h3>
          <div className="grid grid-cols-12 gap-1 items-end h-48">
            {months.map((m) => {
              const v = byMonth[m] ?? 0;
              const h = maxMonthly > 0 ? Math.max(2, (v / maxMonthly) * 100) : 0;
              return (
                <div key={m} className="flex flex-col items-center justify-end h-full group">
                  <div className="w-full bg-accent-brand rounded-t hover:opacity-80 transition-opacity relative" style={{ height: `${h}%`, minHeight: v > 0 ? "8px" : "0" }}>
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] tabular-nums opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-bg-elevated border border-border-subtle rounded px-1">${v.toFixed(0)}</div>
                  </div>
                  <div className="text-[10px] text-text-tertiary mt-1">{m}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
