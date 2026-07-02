import { useEffect, useMemo, useState } from "react";
import { Download, ChevronDown, Info } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useEntity } from "@/hooks/useEntity";
import { useOrders } from "@/hooks/useOrders";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTaxSchedule } from "@/contexts/ExpenseCategoriesContext";
import type { TaxSchedule } from "@/lib/scheduleF";
import { formatMoney } from "@/lib/format";
import { isoYear, currentYear, toBusinessISODate } from "@/lib/dates";
import { downloadCsv, fetchPnl, type Pnl } from "@/lib/financeReports";
import type { Tables } from "@/lib/database.types";

type Expense = Tables<"expenses">;
type Shipment = Tables<"shipments">;
type Settings = Tables<"finance_settings">;

const EXCLUDED = ["cancelled", "refunded"];
const MARKETPLACE = ["etsy", "ebay"]; // collect + remit sales tax for the seller
const n = (v: unknown) => Number(v ?? 0);

/**
 * Year-end tax summary. Gross receipts, COGS, tax-line deductions, and the
 * mileage deduction are sourced from `finance_pnl` so this document reconciles
 * with the P&L tab to the cent. Deductions group by the org's active schedule —
 * Schedule F (farm, the nursery default) or Schedule C via the swap control.
 * Per the 2026-06-12 audit, gross receipts are subtotal+shipping (sales tax is
 * a pass-through, never income). The only figure computed in the browser is the
 * sales-tax *liability* split, which has no server equivalent and needs
 * per-order channel + ship-to-state detail.
 */
export function TaxReportContent() {
  const { activeOrgId } = useAuth();
  const { taxSchedule, setTaxSchedule } = useTaxSchedule();
  const [swapBusy, setSwapBusy] = useState(false);
  const { data: expenses } = useEntity<Expense>("expenses", []);
  const { data: orders } = useOrders();
  const { data: shipments } = useEntity<Shipment>("shipments", []);
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

  // Server-side P&L for the year — the single source of truth for the totals.
  const [pnl, setPnl] = useState<Pnl | null>(null);
  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    fetchPnl(activeOrgId, year).then((p) => { if (!cancelled) setPnl(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeOrgId, year]);

  const grossReceipts = n(pnl?.total.gross_receipts);
  const cogs = { materials: n(pnl?.total.cogs_materials), labor: n(pnl?.total.cogs_labor), total: n(pnl?.total.cogs) };
  const expenseTotal = n(pnl?.total.expenses);
  const mileageDeduction = n(pnl?.total.mileage);
  // Deductions grouped by the active schedule's line. schedule_f is absent
  // until its migration lands — fall back to C rather than an empty card.
  const bySchedule = useMemo(() => {
    const source = (taxSchedule === "F" ? pnl?.schedule_f : pnl?.schedule_c) ?? pnl?.schedule_c ?? [];
    return source.map((c) => [c.category, n(c.total)] as [string, number]).sort((a, b) => b[1] - a[1]);
  }, [pnl, taxSchedule]);

  const swapSchedule = async (next: TaxSchedule) => {
    if (next === taxSchedule || swapBusy) return;
    setSwapBusy(true);
    const r = await setTaxSchedule(next);
    setSwapBusy(false);
    if (!r.ok) addToast({ title: "Couldn't switch schedule", description: r.error, status: "alert" });
  };

  const stateByOrder = useMemo(() => {
    const map = new Map<string, string>();
    shipments.forEach((s) => { if (s.ship_to_state) map.set(s.order_id, s.ship_to_state.toUpperCase()); });
    return map;
  }, [shipments]);

  // Sales-tax liability split (no server equivalent): who remits what.
  const taxSplit = useMemo(() => {
    const valid = orders.filter((o) => isoYear(o.placed_at) === year && !EXCLUDED.includes(o.status));
    let marketplaceTax = 0, directTax = 0, azDirectTax = 0;
    for (const o of valid) {
      if (MARKETPLACE.includes(o.channel.toLowerCase())) marketplaceTax += n(o.tax);
      else {
        directTax += n(o.tax);
        if (stateByOrder.get(o.id) === "AZ") azDirectTax += n(o.tax);
      }
    }
    return { valid, marketplaceTax, directTax, azDirectTax };
  }, [orders, year, stateByOrder]);

  const exportSales = () => {
    const rows: (string | number)[][] = [["Date", "Order", "Channel", "Ship-to state", "Status", "Subtotal", "Shipping", "Tax", "Total"]];
    taxSplit.valid.forEach((o) => rows.push([toBusinessISODate(o.placed_at), o.id.slice(0, 8), o.channel, stateByOrder.get(o.id) ?? "", o.status, n(o.subtotal).toFixed(2), n(o.shipping).toFixed(2), n(o.tax).toFixed(2), n(o.total).toFixed(2)]));
    downloadCsv(`sales-${year}.csv`, rows);
    addToast({ title: "CSV exported", description: `sales-${year}.csv`, status: "ok" });
  };
  const exportExpenses = () => {
    const rows: (string | number)[][] = [["Date", "Schedule F", "Schedule C", "Category", "Amount", "Description"]];
    expenses.filter((e) => isoYear(e.occurred_on) === year).forEach((e) => rows.push([e.occurred_on, e.schedule_f_category ?? "", e.schedule_c_category ?? "", e.category ?? "", n(e.amount).toFixed(2), e.description ?? ""]));
    downloadCsv(`expenses-${year}.csv`, rows);
    addToast({ title: "CSV exported", description: `expenses-${year}.csv`, status: "ok" });
  };
  const exportSchedule = () => {
    const rows: (string | number)[][] = [[`Schedule ${taxSchedule} line`, "Amount"]];
    rows.push(["Gross receipts (subtotal + shipping, tax excluded)", grossReceipts.toFixed(2)]);
    rows.push(["COGS — Materials", cogs.materials.toFixed(2)]);
    rows.push(["COGS — Hired labor", cogs.labor.toFixed(2)]);
    bySchedule.forEach(([cat, v]) => rows.push([cat, v.toFixed(2)]));
    rows.push(["Car and truck (mileage)", mileageDeduction.toFixed(2)]);
    const file = `schedule-${taxSchedule.toLowerCase()}-${year}.csv`;
    downloadCsv(file, rows);
    addToast({ title: "CSV exported", description: file, status: "ok" });
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
        <div className="flex items-center gap-2 flex-wrap">
          <div role="group" aria-label="Tax schedule" className="flex rounded-lg border border-border-subtle overflow-hidden">
            {(["F", "C"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void swapSchedule(s)}
                disabled={swapBusy}
                aria-pressed={taxSchedule === s}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  taxSchedule === s ? "bg-accent-brand-dim text-accent-brand" : "text-text-secondary hover:text-text-primary hover:bg-bg-active"
                }`}
              >
                Schedule {s}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={exportSales}><Download className="w-4 h-4" /> Sales</Button>
          <Button variant="outline" onClick={exportExpenses}><Download className="w-4 h-4" /> Expenses</Button>
          <Button variant="brand" onClick={exportSchedule}><Download className="w-4 h-4" /> Schedule {taxSchedule}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <h3 className="text-sm font-medium mb-3">Sales tax collected</h3>
          <StatRow label="Remitted by marketplace" value={formatMoney(taxSplit.marketplaceTax)} sub="Etsy, eBay collect and remit on your behalf" />
          <StatRow label="Collected on direct sales" value={formatMoney(taxSplit.directTax)} sub="Shopify and direct — you remit this (AZ TPT for Arizona orders)" strong />
          {taxSplit.azDirectTax > 0 && <StatRow label="— of which Arizona (AZ TPT)" value={formatMoney(taxSplit.azDirectTax)} />}
        </Card>
        <Card className="p-6">
          <h3 className="text-sm font-medium mb-3">Cost of goods (live from Production)</h3>
          <StatRow label="Materials (consumed supplies)" value={formatMoney(cogs.materials)} />
          <StatRow label="Hired labor" value={formatMoney(cogs.labor)} />
          <StatRow label="Total COGS" value={formatMoney(cogs.total)} strong />
        </Card>
      </div>

      <Card className="p-6 mb-6">
        <h3 className="text-sm font-medium mb-3">Deductions — by Schedule {taxSchedule} category</h3>
        {bySchedule.length === 0 ? (
          <p className="text-sm text-text-tertiary">No expenses for {year}.</p>
        ) : (
          <div>
            {bySchedule.map(([cat, v]) => <StatRow key={cat} label={cat} value={formatMoney(v)} />)}
            <StatRow label="Car and truck (mileage)" value={formatMoney(mileageDeduction)} sub={`${rateCents}¢/mi`} />
            <StatRow label="Total deductions" value={formatMoney(expenseTotal + mileageDeduction)} strong />
          </div>
        )}
      </Card>

      <div className="flex items-start gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-sm text-text-secondary">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-status-info" />
        <span>
          Gross receipts {year}: <span className="text-text-primary tabular-nums">{formatMoney(grossReceipts)}</span> across {taxSplit.valid.length} orders
          <span className="text-text-tertiary"> · product + shipping, sales tax excluded.</span>
        </span>
      </div>
    </div>
  );
}
