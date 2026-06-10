import { useState, useMemo, useEffect, FormEvent } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Store, ShoppingBag, X, Mail, Plus, Users, Pencil, Trash2 } from "lucide-react";
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
  const { data: customers, add, update, remove, isLoading } = useEntity<Customer>("customers", SEED, {
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

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", etsy_handle: "", phone: "", notes: "" });

  const openEdit = () => {
    if (!selected) return;
    setEditForm({
      name: selected.name,
      email: selected.email ?? "",
      etsy_handle: selected.etsy_handle ?? "",
      phone: selected.phone ?? "",
      notes: selected.notes ?? "",
    });
    setIsEditOpen(true);
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const name = editForm.name.trim();
    if (!name) return;
    const result = await update(selected.id, {
      name,
      email: editForm.email.trim() || null,
      etsy_handle: editForm.etsy_handle.trim() || null,
      phone: editForm.phone.trim() || null,
      notes: editForm.notes.trim() || null,
    } as Partial<Customer>);
    if (!result.ok) {
      addToast({ title: "Couldn't save changes", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setIsEditOpen(false);
    addToast({ title: "Customer updated", description: name, status: "ok" });
  };

  // Subscription management (Rosette+ tiers)
  const [subForm, setSubForm] = useState({ tier: "Rosette+", billing_cycle: "monthly", price: "" });
  const [isSubFormOpen, setIsSubFormOpen] = useState(false);

  const startSubscription = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !supabase || !user || !activeOrgId) return;
    const { data, error } = await (supabase as any)
      .from("subscriptions")
      .insert({
        user_id: user.id,
        org_id: activeOrgId,
        customer_id: selected.id,
        tier: subForm.tier.trim() || "Rosette+",
        status: "active",
        billing_cycle: subForm.billing_cycle,
        price: subForm.price === "" ? null : Number(subForm.price) || null,
      })
      .select()
      .single();
    if (error || !data) {
      addToast({ title: "Couldn't start subscription", description: friendlyDbError(error), status: "alert" });
      return;
    }
    setActiveSub(data as Subscription);
    setIsSubFormOpen(false);
    addToast({ title: "Subscription started", description: `${selected.name} · ${subForm.tier}`, status: "ok" });
  };

  const cancelSubscription = async () => {
    if (!activeSub || !supabase || !activeOrgId) return;
    if (!confirm(`Cancel ${selected?.name}'s ${activeSub.tier} subscription?`)) return;
    const { error } = await (supabase as any)
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", activeSub.id)
      .eq("org_id", activeOrgId);
    if (error) {
      addToast({ title: "Couldn't cancel", description: friendlyDbError(error), status: "alert" });
      return;
    }
    setActiveSub(null);
    addToast({ title: "Subscription cancelled", status: "info" });
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Delete ${selected.name}? Their orders are kept but unlinked.`)) return;
    const result = await remove(selected.id);
    if (!result.ok) {
      addToast({ title: "Couldn't delete", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setSelectedId(null);
    addToast({ title: "Customer deleted", status: "info" });
  };

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

              <section>
                <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Subscription</h3>
                {activeSub ? (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{activeSub.tier}</span>
                      <Badge variant="brand">{activeSub.status}</Badge>
                    </div>
                    <div className="text-xs text-text-secondary mb-3">
                      {activeSub.billing_cycle} · started {new Date(activeSub.started_at).toLocaleDateString()}
                      {activeSub.price != null && ` · $${Number(activeSub.price).toFixed(2)}`}
                      {activeSub.current_period_end && ` · renews ${new Date(activeSub.current_period_end).toLocaleDateString()}`}
                    </div>
                    <Button variant="ghost" size="sm" className="text-text-tertiary hover:text-status-alert" onClick={cancelSubscription}>
                      Cancel subscription
                    </Button>
                  </Card>
                ) : isSubFormOpen ? (
                  <Card className="p-4">
                    <form onSubmit={startSubscription} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-text-tertiary mb-1">Tier</label>
                          <Input value={subForm.tier} onChange={(e) => setSubForm({ ...subForm, tier: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-xs text-text-tertiary mb-1">Billing</label>
                          <select
                            value={subForm.billing_cycle}
                            onChange={(e) => setSubForm({ ...subForm, billing_cycle: e.target.value })}
                            className="w-full bg-bg-elevated border border-border-strong rounded-[8px] px-2 py-2 text-sm focus:outline-none focus:border-accent-brand"
                          >
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="yearly">Yearly</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Price (optional)</label>
                        <Input type="number" step="0.01" min="0" placeholder="29.99" value={subForm.price} onChange={(e) => setSubForm({ ...subForm, price: e.target.value })} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" type="button" onClick={() => setIsSubFormOpen(false)}>Cancel</Button>
                        <Button size="sm" type="submit">Start</Button>
                      </div>
                    </form>
                  </Card>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setIsSubFormOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Start subscription
                  </Button>
                )}
              </section>

              {selected.notes && (
                <section>
                  <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Notes</h3>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{selected.notes}</p>
                </section>
              )}
            </div>

            <div className="p-4 md:p-6 border-t border-border-subtle bg-bg-base/50 flex gap-2 pb-safe">
              <Button variant="outline" className="flex-1" onClick={openEdit}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button variant="outline" className="flex-1 hover:text-status-alert" onClick={handleDelete}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
            <div className="md:hidden p-4 border-t border-border-subtle pb-safe">
              <Button variant="outline" className="w-full" onClick={() => setSelectedId(null)}>Close</Button>
            </div>
          </>
        )}
      </div>

      {isEditOpen && selected && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <h2 className="text-lg font-semibold">Edit Customer</h2>
              <button onClick={() => setIsEditOpen(false)} aria-label="Close" className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEdit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Name *</label>
                <Input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Email</label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Etsy handle</label>
                  <Input value={editForm.etsy_handle} onChange={(e) => setEditForm({ ...editForm, etsy_handle: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Phone</label>
                  <Input type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                  className="w-full bg-bg-elevated border border-border-strong rounded-[8px] px-2 py-2 text-sm focus:outline-none focus:border-accent-brand resize-y"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button type="submit">Save Changes</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

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
