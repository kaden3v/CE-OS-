import React, { useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Plus, FileText, X } from "lucide-react";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/Input";
import { useEntity } from "@/hooks/useEntity";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

type Expense = Tables<"expenses">;
type Vendor = Tables<"vendors">;

const CATEGORIES = ["Soil and media", "Packaging", "Shipping", "Utilities", "Marketing", "Permits and licenses", "Tools", "Other"];

const SEED: Expense[] = [];

export default function Expenses() {
  const { data: expenses, add, isLoading } = useEntity<Expense>("expenses", SEED, {
    toRow: (e) => ({
      vendor_id: e.vendor_id,
      amount: e.amount,
      category: e.category,
      description: e.description,
      occurred_on: e.occurred_on,
      receipt_url: e.receipt_url,
    }),
    orderBy: "occurred_on",
  });
  const { data: vendors } = useEntity<Vendor>("vendors", [], { toRow: (v) => ({ name: v.name }) });
  const { addToast } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  const [form, setForm] = useState({ amount: "", category: "Soil and media", vendor_id: "", description: "", occurred_on: new Date().toISOString().slice(0, 10) });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      addToast({ title: "Amount required", description: "Enter a positive number.", status: "warn" });
      return;
    }
    const result = await add({
      id: crypto.randomUUID(),
      amount,
      category: form.category,
      vendor_id: form.vendor_id || null,
      description: form.description.trim() || null,
      occurred_on: form.occurred_on,
      receipt_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Expense);
    if (result.ok === false) {
      addToast({ title: "Couldn't save expense", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setIsOpen(false);
    setForm({ amount: "", category: "Soil and media", vendor_id: "", description: "", occurred_on: new Date().toISOString().slice(0, 10) });
    addToast({ title: "Expense logged", description: `$${amount.toFixed(2)} · ${form.category}`, status: "ok" });
  };

  const vendorName = (id: string | null) => (id ? vendors.find((v) => v.id === id)?.name ?? "—" : "—");

  const columns = useMemo(
    () => [
      {
        accessorKey: "occurred_on",
        header: "Date",
        cell: (info: any) => <span className="text-text-secondary">{new Date(info.getValue()).toLocaleDateString()}</span>,
      },
      { accessorKey: "category", header: "Category", cell: (info: any) => (info.getValue() ? <Badge>{info.getValue()}</Badge> : null) },
      { accessorKey: "vendor_id", header: "Vendor", cell: (info: any) => <span className="font-medium">{vendorName(info.getValue())}</span> },
      { accessorKey: "description", header: "Memo", cell: (info: any) => <span className="text-text-secondary">{info.getValue() ?? "—"}</span> },
      { accessorKey: "amount", header: "Amount", cell: (info: any) => <span className="font-medium tabular-nums">${Number(info.getValue()).toFixed(2)}</span> },
    ],
    [vendors],
  );

  // Aggregations
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const sumYtd = expenses.filter((e) => e.occurred_on >= yearStart).reduce((s, e) => s + Number(e.amount), 0);
  const sumMonth = expenses.filter((e) => e.occurred_on >= monthStart).reduce((s, e) => s + Number(e.amount), 0);
  const byCat = expenses.reduce<Record<string, number>>((acc, e) => {
    const k = e.category ?? "Uncategorized";
    acc[k] = (acc[k] ?? 0) + Number(e.amount);
    return acc;
  }, {});
  const topCategory = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const isEmpty = !isLoading && expenses.length === 0;

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col relative">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Expenses</h1>
          <p className="text-sm text-text-secondary">Track operating costs.</p>
        </div>
        <Button variant="brand" onClick={() => setIsOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Expense
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 mt-2">
        <StatTile label="This month" value={`$${sumMonth.toFixed(2)}`} />
        <StatTile label="YTD total" value={`$${sumYtd.toFixed(2)}`} />
        <StatTile label="Top category" value={topCategory} />
      </div>

      <Card className="flex-1 overflow-auto flex flex-col mb-12">
        {isLoading && <LoadingTable cols={5} rows={8} />}
        {!isLoading && isEmpty && (
          <EmptyState
            icon={FileText}
            title="No expenses yet"
            description="Track operating costs."
            action={<Button variant="outline" onClick={() => setIsOpen(true)}>Add Expense</Button>}
          />
        )}
        {!isLoading && !isEmpty && <DataTable columns={columns} data={expenses} />}
      </Card>

      {isOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-bg-elevated border-border-strong shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <h2 className="text-lg font-semibold">Log Expense</h2>
              <button onClick={() => setIsOpen(false)} aria-label="Close" className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-4 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Amount *</label>
                <Input type="number" step="0.01" min="0" required placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Date</label>
                  <Input type="date" value={form.occurred_on} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Category</label>
                  <select
                    className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Vendor</label>
                <select
                  className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong"
                  value={form.vendor_id}
                  onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
                >
                  <option value="">— None —</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Memo</label>
                <Input placeholder="Optional" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit">Save Expense</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
