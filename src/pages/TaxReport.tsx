import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileSpreadsheet, ChevronDown } from "lucide-react";
import { useEntity } from "@/hooks/useEntity";
import { useApp } from "@/contexts/AppContext";
import type { Tables } from "@/lib/database.types";

type Expense = Tables<"expenses">;

export default function TaxReport() {
  const { data: expenses } = useEntity<Expense>("expenses", []);
  const { addToast } = useApp();

  const years = useMemo(() => {
    const ys = new Set<number>();
    expenses.forEach((e) => ys.add(new Date(e.occurred_on).getFullYear()));
    if (ys.size === 0) ys.add(new Date().getFullYear());
    return Array.from(ys).sort((a, b) => b - a);
  }, [expenses]);
  const [year, setYear] = useState<number>(years[0] ?? new Date().getFullYear());

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

  const handleExportCsv = () => {
    const rows = [["Date", "Category", "Amount", "Description"].join(",")];
    expenses
      .filter((e) => new Date(e.occurred_on).getFullYear() === year)
      .forEach((e) => {
        rows.push([e.occurred_on, e.category ?? "", Number(e.amount).toFixed(2), `"${(e.description ?? "").replace(/"/g, '""')}"`].join(","));
      });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ title: "CSV exported", description: `expenses-${year}.csv`, status: "ok" });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Tax Report</h1>
          <p className="text-sm text-text-secondary">Expense summary by category and month.</p>
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
          <Button variant="brand" onClick={handleExportCsv}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

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
