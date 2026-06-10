import { useState, useMemo, useEffect, FormEvent } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Store, ShoppingBag, X, Mail, Plus, Users } from "lucide-react";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useEntity } from "@/hooks/useEntity";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

type Customer = Tables<"customers">;
type Subscription = Tables<"subscriptions">;

const SEED: Customer[] = [];

export default function Customers() {
  const { data: customers, add, isLoading } = useEntity<Customer>("customers", SEED, {
    toRow: (c) => ({
      name: c.name,
      email: c.email,
      etsy_handle: c.etsy_handle,
      shopify_id: c.shopify_id,
      phone: c.phone,
      notes: c.notes,
    }),
  });
  const { addToast } = useApp();
  const { user, activeOrgId } = useAuth();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => customers.find((c) => c.id === selectedId) ?? null, [customers, selectedId]);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", etsy_handle: "", phone: "" });

  // Per-customer subscription map (only loaded for the selected one)
  const [activeSub, setActiveSub] = useState<Subscription | null>(null);
  useEffect(() => {
    if (!selectedId || !user || !supabase || !activeOrgId) {
      setActiveSub(null);
      return;
    }
    supabase
      .from("subscriptions")
      .select("*")
      .eq("customer_id", selectedId)
      .eq("org_id", activeOrgId)
      .eq("status", "active")
      .maybeSingle()
      .then(({ data }) => setActiveSub(data));
  }, [selectedId, user?.id, activeOrgId]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const result = await add({
      id: crypto.randomUUID(),
      name,
      email: form.email.trim() || null,
      etsy_handle: form.etsy_handle.trim() || null,
      phone: form.phone.trim() || null,
      shopify_id: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Customer);
    if (result.ok === false) {
      addToast({ title: "Couldn't add customer", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setIsAddOpen(false);
    setForm({ name: "", email: "", etsy_handle: "", phone: "" });
    addToast({ title: "Customer added", description: name, status: "ok" });
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: (info: any) => <span className="font-medium text-text-primary">{info.getValue()}</span>,
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: (info: any) => <span className="text-text-secondary">{info.getValue() ?? "—"}</span>,
      },
      {
        accessorKey: "etsy_handle",
        header: "Channel",
        cell: (info: any) => (
          <div className="flex items-center gap-2 text-text-secondary">
            {info.getValue() ? (
              <>
                <ShoppingBag className="w-3.5 h-3.5" /> Etsy
              </>
            ) : info.row.original.shopify_id ? (
              <>
                <Store className="w-3.5 h-3.5" /> Shopify
              </>
            ) : (
              "—"
            )}
          </div>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Added",
        cell: (info: any) => <span className="text-text-secondary">{new Date(info.getValue()).toLocaleDateString()}</span>,
      },
    ],
    [],
  );

  const isEmpty = !isLoading && customers.length === 0;

  return (
    <div className="flex h-full relative">
      <div className={cn("flex-1 p-4 md:p-8 flex flex-col h-full transition-all", selected ? "md:pr-[480px] duration-200 ease-out" : "duration-150 ease-in")}>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold mb-2">Customers</h1>
            <p className="text-sm text-text-secondary">Directory of buyers across channels.</p>
          </div>
          <Button variant="brand" onClick={() => setIsAddOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Customer
          </Button>
        </div>

        <Card className="flex-1 overflow-auto flex flex-col">
          {isLoading ? (
            <LoadingTable cols={4} rows={10} />
          ) : isEmpty ? (
            <EmptyState
              icon={Users}
              title="No customers yet"
              description="Add one manually or wait for orders to sync."
              action={<Button variant="outline" onClick={() => setIsAddOpen(true)}>Add Customer</Button>}
            />
          ) : (
            <DataTable columns={columns} data={customers} onRowClick={(row) => setSelectedId(row.id)} />
          )}
        </Card>
      </div>

      {/* Detail panel */}
      <div
        className={cn(
          "fixed inset-0 md:inset-auto md:top-[56px] md:right-0 md:bottom-0 w-full md:w-[480px] bg-bg-base md:bg-[rgba(255,255,255,0.04)] backdrop-blur-md md:border-l border-border-subtle shadow-2xl transition-transform z-50 md:z-20 flex flex-col",
          selected ? "translate-x-0 duration-200 ease-out" : "translate-x-full duration-150 ease-in",
        )}
      >
        {selected && (
          <>
            <div className="p-4 md:p-6 border-b border-border-subtle flex items-start justify-between bg-bg-elevated md:bg-transparent">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-accent-brand/20 text-accent-brand flex items-center justify-center text-lg font-medium border border-accent-brand/30">
                  {selected.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-xl font-semibold">{selected.name}</h2>
                    {activeSub && <Badge variant="brand">{activeSub.tier}</Badge>}
                  </div>
                  {selected.email && (
                    <div className="text-sm text-text-secondary flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5" />
                      {selected.email}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedId(null)} className="hidden md:flex p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
              <section>
                <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Contact</h3>
                <div className="space-y-2 text-sm">
                  {selected.phone && <div className="text-text-secondary">📞 {selected.phone}</div>}
                  {selected.etsy_handle && <div className="text-text-secondary">🛍 Etsy: {selected.etsy_handle}</div>}
                  {selected.shopify_id && <div className="text-text-secondary">🛒 Shopify ID: {selected.shopify_id}</div>}
                </div>
              </section>

              {activeSub && (
                <section>
                  <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Subscription</h3>
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{activeSub.tier}</span>
                      <Badge variant="brand">{activeSub.status}</Badge>
                    </div>
                    <div className="text-xs text-text-secondary">
                      {activeSub.billing_cycle} · started {new Date(activeSub.started_at).toLocaleDateString()}
                      {activeSub.current_period_end && ` · renews ${new Date(activeSub.current_period_end).toLocaleDateString()}`}
                    </div>
                  </Card>
                </section>
              )}

              {selected.notes && (
                <section>
                  <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Notes</h3>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{selected.notes}</p>
                </section>
              )}
            </div>

            <div className="md:hidden p-4 border-t border-border-subtle pb-safe">
              <Button variant="outline" className="w-full" onClick={() => setSelectedId(null)}>Close</Button>
            </div>
          </>
        )}
      </div>

      {isAddOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <h2 className="text-lg font-semibold">New Customer</h2>
              <button onClick={() => setIsAddOpen(false)} aria-label="Close" className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Name *</label>
                <Input required placeholder="Jane Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Email</label>
                <Input type="email" placeholder="jane@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Etsy handle</label>
                <Input placeholder="janeplants" value={form.etsy_handle} onChange={(e) => setForm({ ...form, etsy_handle: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Phone</label>
                <Input type="tel" placeholder="555-0123" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button type="submit">Save Customer</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
