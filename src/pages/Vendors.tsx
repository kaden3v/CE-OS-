import React, { useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LoadingTable, ErrorState, EmptyState } from "@/components/ui/StateRenderer";
import { Store, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/Input";
import { useEntity } from "@/hooks/useEntity";
import type { Tables } from "@/lib/database.types";
import { friendlyDbError } from "@/lib/dbErrors";

type Vendor = Tables<"vendors">;

const SEED: Vendor[] = [];

const CATEGORIES = ["Plants", "Seeds", "Media", "Supplies", "Shipping", "Other"];

export default function Vendors() {
  const { data: vendors, add, isLoading } = useEntity<Vendor>("vendors", SEED, {
    toRow: (v) => ({
      name: v.name,
      category: v.category,
      contact_name: v.contact_name,
      contact_email: v.contact_email,
      contact_phone: v.contact_phone,
      url: v.url,
      notes: v.notes,
    }),
  });
  const { addToast } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form, setForm] = useState({ name: "", category: "Supplies", email: "", phone: "" });
  const reset = () => setForm({ name: "", category: "Supplies", email: "", phone: "" });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const result = await add({
      id: crypto.randomUUID(),
      name,
      category: form.category,
      contact_email: form.email.trim() || null,
      contact_phone: form.phone.trim() || null,
      contact_name: null,
      url: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Vendor);
    if (result.ok === false) {
      addToast({ title: "Couldn't add vendor", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setIsModalOpen(false);
    reset();
    addToast({ title: "Vendor added", description: `${name} is in your directory.`, status: "ok" });
  };

  const columns = useMemo(
    () => [
      { accessorKey: "name", header: "Name", cell: (info: any) => <span className="font-medium">{info.getValue()}</span> },
      { accessorKey: "category", header: "Category", cell: (info: any) => info.getValue() ? <Badge>{info.getValue()}</Badge> : null },
      { accessorKey: "contact_email", header: "Email", cell: (info: any) => <span className="text-text-secondary">{info.getValue() ?? "—"}</span> },
      { accessorKey: "contact_phone", header: "Phone", cell: (info: any) => <span className="text-text-secondary">{info.getValue() ?? "—"}</span> },
      { accessorKey: "created_at", header: "Added", cell: (info: any) => <span className="text-text-secondary">{new Date(info.getValue()).toLocaleDateString()}</span> },
    ],
    [],
  );

  const isEmpty = !isLoading && vendors.length === 0;

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col relative">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Vendors</h1>
          <p className="text-sm text-text-secondary">Directory of suppliers, nurseries, and service providers.</p>
        </div>
        <Button variant="brand" onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      <Card className="flex-1 overflow-auto flex flex-col">
        {isLoading && <LoadingTable cols={5} rows={8} />}
        {!isLoading && isEmpty && (
          <EmptyState
            icon={Store}
            title="No vendors yet"
            description="Directory of suppliers, nurseries, and service providers."
            action={<Button variant="outline" onClick={() => setIsModalOpen(true)}>Add Vendor</Button>}
          />
        )}
        {!isLoading && !isEmpty && <DataTable columns={columns} data={vendors} />}
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
              <h2 className="text-lg font-semibold">New Vendor</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-text-secondary hover:text-text-primary" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdd} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Company Name</label>
                <Input required placeholder="E.g. XYZ Nursery" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Category</label>
                <select
                  className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong transition-colors"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Email</label>
                <Input type="email" placeholder="orders@vendor.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Phone</label>
                <Input type="tel" placeholder="555-0123" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="mt-8 pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit">Save Vendor</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
