import React, { useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Plus, Receipt, FileText, X } from "lucide-react";
import { useDataState } from "@/hooks/useDataState";
import { LoadingTable, ErrorState, EmptyState, StateRenderer, resolveDataViewState } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/Input";

const INITIAL_EXPENSES = [
  { id: 1, category: "Soil and media", vendor: "Sphagnum Moss Co.", amount: 145.00, date: "2 days ago", desc: "2 Bales of LFS", receipt: true, deductible: true },
  { id: 2, category: "Packaging", vendor: "Amazon Business", amount: 48.50, date: "5 days ago", desc: "Kraft mailers 100pk", receipt: true, deductible: true },
  { id: 3, category: "Shipping", vendor: "USPS", amount: 312.40, date: "1 week ago", desc: "Postage reload", receipt: true, deductible: true },
  { id: 4, category: "Utilities", vendor: "SRP", amount: 185.20, date: "2 weeks ago", desc: "Electricity for grow room", receipt: true, deductible: true },
  { id: 5, category: "Marketing", vendor: "Instagram Ads", amount: 25.00, date: "3 weeks ago", desc: "Boosted post", receipt: false, deductible: false },
  { id: 6, category: "Permits and licenses", vendor: "AZ Dept of Ag", amount: 150.00, date: "1 month ago", desc: "Nursery annual renewal", receipt: true, deductible: true },
];

type ExpenseRow = (typeof INITIAL_EXPENSES)[number];

export default function Expenses() {
  const [expenses, setExpenses] = useState(INITIAL_EXPENSES);
  const { data, isLoading, isError, isEmpty } = useDataState(expenses);
  const { addToast } = useApp();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form State
  const [newVendor, setNewVendor] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCategory, setNewCategory] = useState("Supplies");
  const [newDesc, setNewDesc] = useState("");

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendor || !newAmount) return;

    const newExpense = {
      id: Date.now(),
      category: newCategory,
      vendor: newVendor,
      amount: parseFloat(newAmount),
      date: "Just now",
      desc: newDesc,
      receipt: false,
      deductible: true
    };

    setExpenses([newExpense, ...expenses]);
    setIsAddModalOpen(false);
    setNewVendor("");
    setNewAmount("");
    setNewDesc("");
    addToast({ title: "Expense Added", description: `Added $${newAmount} to ${newVendor}.`, status: "success" });
  };

  const columns = useMemo((): DataTableColumn<ExpenseRow>[] => [
    {
      key: "date",
      header: "Date",
      render: (row) => <span className="text-text-secondary">{row.date}</span>,
    },
    {
      key: "category",
      header: "Category",
      render: (row) => <Badge>{row.category}</Badge>,
    },
    {
      key: "vendor",
      header: "Vendor",
      render: (row) => <span className="font-medium">{row.vendor}</span>,
    },
    {
      key: "desc",
      header: "Description",
      render: (row) => <span className="text-text-secondary">{row.desc}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => <span className="font-medium tabular-nums">${row.amount.toFixed(2)}</span>,
    },
    {
      key: "flags",
      header: "Flags",
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.receipt && <Receipt className="w-4 h-4 text-text-secondary" />}
          {row.deductible && <Badge variant="brand">Tax Deductible</Badge>}
        </div>
      ),
    },
  ], []);

  const totalYtd = expenses.reduce((acc, exp) => acc + exp.amount, 0) + 3955.40; // Add previous sum for demo

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col relative">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Expenses</h1>
          <p className="text-sm text-text-secondary">Track operating costs and manage receipts.</p>
        </div>
        <Button variant="brand" onClick={() => setIsAddModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Expense
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 mt-2">
        <StatTile label="Spend (This Month)" value="$716.10" />
        <StatTile label="Total YTD" value={`$${totalYtd.toFixed(2)}`} />
        <StatTile label="Top Category" value="Shipping" />
        <StatTile label="Deductible YTD" value="$4,500.00" trend={{ direction: "up", value: "93%" }} />
      </div>

      <Card className="flex-1 overflow-auto flex flex-col mb-12">
        <StateRenderer
          state={resolveDataViewState(isLoading, isError, isEmpty)}
          data={data}
          loadingFallback={<LoadingTable cols={6} rows={8} />}
          errorFallback={<ErrorState />}
          emptyFallback={(
            <EmptyState
              icon={FileText}
              title="No expenses yet"
              description="Track operating costs and manage receipts."
              action={<Button variant="outline" onClick={() => setIsAddModalOpen(true)}>Add Expense</Button>}
            />
          )}
        >
          {(rows) => <DataTable columns={columns} data={rows} />}
        </StateRenderer>
      </Card>

      {/* Add Expense Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-bg-elevated border-border-strong shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
              <h2 className="text-lg font-semibold">Log Expense</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddExpense} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Amount</label>
                <Input 
                  type="number" 
                  step="0.01"
                  required
                  placeholder="0.00" 
                  className="w-full text-lg"
                  value={newAmount}
                  onChange={e => setNewAmount(e.target.value)}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Category</label>
                  <select 
                    className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong transition-colors"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                  >
                    <option>Soil and media</option>
                    <option>Packaging</option>
                    <option>Shipping</option>
                    <option>Utilities</option>
                    <option>Marketing</option>
                    <option>Permits and licenses</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Vendor / Merchant</label>
                  <Input 
                    type="text" 
                    required
                    placeholder="E.g. Home Depot" 
                    value={newVendor}
                    onChange={e => setNewVendor(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Description / Memo</label>
                <Input 
                  type="text" 
                  placeholder="Optional memo" 
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                />
              </div>

              <div className="mt-8 pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
                <Button type="submit">Save Expense</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
