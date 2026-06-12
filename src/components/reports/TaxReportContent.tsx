import { useEffect, useMemo, useState } from "react";
import { Download, ChevronDown, Info } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useEntity } from "@/hooks/useEntity";
import { useOrders } from "@/hooks/useOrders";
import { useApp } from "@/contexts/AppContext";
import { formatMoney } from "@/lib/format";
import { isoYear, currentYear, toBusinessISODate } from "@/lib/dates";
import { downloadCsv } from "@/lib/financeReports";
import type { Tables } from "@/lib/database.types";

type Expense = Tables<"expenses">;
type Shipment = Tables<"shipments">;
type Run = Tables<"production_runs">;
type RunSupply = Tables<"production_run_supplies">;
type Trip = Tables<"mileage_log">;
type Settings = Tables<"finance_settings">;

const EXCLUDED = ["cancelled", "refunded"];
const MARKETPLACE = ["etsy", "ebay"]; // collect + remit sales tax for the seller
const n = (v: unknown) => Number(v ?? 0);

export function TaxReportContent() {
  const { data: expenses } = useEntity<Expense>("expenses", []);
  const { data: orders } = useOrders();
  const { data: shipments } = useEntity<Shipment>("shipments", []);
  const { data: runs } = useEntity<Run>("production_runs", [], { orderBy: "run_on" });
  const { data: runSupplies } = useEntity<RunSupply>("production_run_supplies", [], { orderBy: "created_at" });
  const { data: trips } = useEntity<Trip>("mileage_log", [], { orderBy: "trip_date" });
  const { data: settingsRows } = useEntity<Settings>("finance_settings", []);
  const { addToast } = useApp();

  const rateCents = settingsRows[0]?.mileage_rate_cents ?? 70;

  const years = useMemo(() => {
    const ys = new Set<number>();
    expenses.forEach((e) => { const y = isoYear(e.occurred_on); if (y) ys.add(y); });
    orders.forEach((o) => { const y = isoYear(o.placed_at); if (y) ys.add(y); });
    if (ys.size === 0) ys.add(currentYear());
    return Array.from(ys).sort((a, b) => b - a);
  }, [expenses, orders]);
  const [year, setYear] = useState<number>(years[0] ?? currentYear());
  // Keep the selected year valid once data loads (it may contain only prior years).
  useEffect(() => {
    if (!years.includes(year)) setYear(years[0]);
  }, [years]); // eslint-disable-line react-hooks/exhaustive-deps

  const stateByOrder = useMemo(() => {
    const map = new Map<string, string>();
    shipments.forEach((s) => { if (s.ship_to_state) map.set(s.order_id, s.ship_to_state.toUpperCase()); });
    return map;
  }, [shipments]);

  const sales = useMemo(() => {
    const valid = orders.filter((o) => isoYear(o.placed_at) === year && !EXCLUDED.includes(o.status));
    let gross = 0, marketplaceTax = 0, directTax = 0, azDirectTax = 0;
    const byChannel: Record<string, number> = {};
    for (const o of valid) {
      gross += n(o.total);
      byChannel[o.channel] = (byChannel[o.channel] ?? 0) + n(o.total);
      const isMarketplace = MARKETPLACE.includes(o.channel.toLowerCase());
      if (isMarketplace) marketplaceTax += n(o.tax);
      else {
        directTax += n(o.tax);
        if (stateByOrder.get(o.id) === "AZ") azDirectTax += n(o.tax);
      }
    }
    return { valid, gross, marketplaceTax, directTax, azDirectTax, byChannel };
  }, [orders, year, stateByOrder]);

  const cogs = useMemo(() => {
    const yearRuns = runs.filter((r) => isoYear(r.run_on) === year);
    const runIds = new Set(yearRuns.map((r) => r.id));
    const materials = runSupplies.filter((s) => runIds.has(s.run_id)).reduce((sum, s) => sum + n(s.qty) * n(s.unit_cost_snapshot), 0);
    const labor = yearRuns.filter((r) => r.labor_type === "hired").reduce((s, r) => s + n(r.labor_hours) * n(r.labor_rate), 0);
    return { materials, labor, total: materials + labor };
  }, [runs, runSupplies, year]);

  const bySchedC = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses.filter((e) => isoYear(e.occurred_on) === year)) {
      const k = e.schedule_c_category ?? "Uncategorized";
      map[k] = (map[k] ?? 0) + n(e.amount);
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses, year]);
  const expenseTotal = useMemo(() => bySchedC.reduce((s, [, v]) => s + v, 0), [bySchedC]);

  const mileageDeduction = useMemo(() => {
    const miles = trips.filter((t) => isoYear(t.trip_date) === year).reduce((s, t) => s + n(t.miles), 0);
    return (miles * rateCents) / 100;
  }, [trips, year, rateCents]);

  const exportSales = () => {
    const rows: (string | number)[][] = [["Date", "Order", "Channel", "Ship-to state", "Status", "Subtotal", "Shipping", "Tax", "Total"]];
    sales.valid.forEach((o) => rows.push([toBusinessISODate(o.placed_at), o.id.slice(0, 8), o.channel, stateByOrder.get(o.id) ?? "", o.status, n(o.subtotal).toFixed(2), n(o.shipping).toFixed(2), n(o.tax).toFixed(2), n(o.total).toFixed(2)]));
    downloadCsv(`sales-${year}.csv`, rows);
    addToast({ title: "CSV exported", description: `sales-${year}.csv`, status: "ok" });
  };
  const exportExpenses = () => {
    const rows: (string | number)[][] = [["Date", "Schedule C", "Category", "Amount", "Description"]];
    expenses.filter((e) => isoYear(e.occurred_on) === year).forEach((e) => rows.push([e.occurred_on, e.schedule_c_category ?? "", e.category ?? "", n(e.amount).toFixed(2), e.description ?? ""]));
    downloadCsv(`expenses-${year}.csv`, rows);
    addToast({ title: "CSV exported", description: `expenses-${year}.csv`, status: "ok" });
  };
  const exportScheduleC = () => {
    const rows: (string | number)[][] = [["Schedule C line", "Amount"]];
    rows.push(["Gross sales", sales.gross.toFixed(2)]);
    rows.push(["COGS — Materials", cogs.materials.toFixed(2)]);
    rows.push(["COGS — Hired labor", cogs.labor.toFixed(2)]);
    bySchedC.forEach(([cat, v]) => rows.push([cat, v.toFixed(2)]));
    rows.push(["Car and truck (mileage)", mileageDeduction.toFixed(2)]);
    downloadCsv(`schedule-c-${year}.csv`, rows);
    addToast({ title: "CSV exported", description: `schedule-c-${year}.csv`, status: "ok" });
  };

  const StatRow = ({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) => (
    <div className="flex items-center justify-between py-2 border-b border-border-subtle/50 last:border-0">
      <div>
        <div className={strong ? "text-sm font-medium" : "text-sm text-text-secondary"}>{label}</div>
        {sub && <div className="text-xs text-text-tertiary mt-0.5">{sub}</div>}
      </div>
      <div className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="relative">
          <select className="appearance-none bg-bg-base border border-border-subtle rounded-md pl-3 pr-8 py-2 text-sm font-medium hover:border-border-strong focus:outline-none" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportSales}><Download className="w-4 h-4" /> Sales</Button>
          <Button variant="outline" onClick={exportExpenses}><Download className="w-4 h-4" /> Expenses</Button>
          <Button variant="brand" onClick={exportScheduleC}><Download className="w-4 h-4" /> Schedule C</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <h3 className="text-sm font-medium mb-3">Sales tax collected</h3>
          <StatRow label="Remitted by marketplace" value={formatMoney(sales.marketplaceTax)} sub="Etsy, eBay collect and remit on your behalf" />
          <StatRow label="Collected on direct sales" value={formatMoney(sales.directTax)} sub="Shopify and direct — you remit this (AZ TPT for Arizona orders)" strong />
          {sales.azDirectTax > 0 && <StatRow label="— of which Arizona (AZ TPT)" value={formatMoney(sales.azDirectTax)} />}
        </Card>
        <Card className="p-6">
          <h3 className="text-sm font-medium mb-3">Cost of goods (live from Production)</h3>
          <StatRow label="Materials (consumed supplies)" value={formatMoney(cogs.materials)} />
          <StatRow label="Hired labor" value={formatMoney(cogs.labor)} />
          <StatRow label="Total COGS" value={formatMoney(cogs.total)} strong />
        </Card>
      </div>

      <Card className="p-6 mb-6">
        <h3 className="text-sm font-medium mb-3">Deductions — by Schedule C category</h3>
        {bySchedC.length === 0 ? (
          <p className="text-sm text-text-tertiary">No expenses for {year}.</p>
        ) : (
          <div>
            {bySchedC.map(([cat, v]) => <StatRow key={cat} label={cat} value={formatMoney(v)} />)}
            <StatRow label="Car and truck (mileage)" value={formatMoney(mileageDeduction)} sub={`${rateCents}¢/mi`} />
            <StatRow label="Total deductions" value={formatMoney(expenseTotal + mileageDeduction)} strong />
          </div>
        )}
      </Card>

      <div className="flex items-start gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-sm text-text-secondary">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-status-info" />
        <span>Gross sales {year}: <span className="text-text-primary tabular-nums">{formatMoney(sales.gross)}</span> across {sales.valid.length} orders.</span>
      </div>
    </div>
  );
}
