import { useEffect, useMemo, useState, FormEvent } from "react";
import { Repeat, Plus, X, Trash2, Pencil, Receipt, RotateCcw, TrendingUp, TrendingDown, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { useEntity } from "@/hooks/useEntity";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase, rpcCall } from "@/lib/supabase";
import { friendlyDbError } from "@/lib/dbErrors";
import { formatMoney } from "@/lib/format";
import { formatBusinessDate, todayISO } from "@/lib/dates";
import type { Tables } from "@/lib/database.types";

type Recurring = Tables<"recurring_expenses">;
type Vendor = Tables<"vendors">;
type PriceHistory = Tables<"subscription_price_history">;

const CYCLES = ["monthly", "quarterly", "yearly"] as const;
const CYCLE_DIVISOR: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };
const cycleAbbr = (c: string) => (c === "monthly" ? "mo" : c === "yearly" ? "yr" : "qtr");

const emptyForm = { name: "", website: "", vendor_id: "", category: "Software", amount: 0, billing_cycle: "monthly", next_renewal: "", notes: "" };

const monthlyEquiv = (r: Recurring) => Number(r.amount) / (CYCLE_DIVISOR[r.billing_cycle] ?? 1);

const isoShift = (iso: string, days = 0, years = 0): string => {
  const d = new Date(`${iso}T00:00:00`);
  if (days) d.setDate(d.getDate() + days);
  if (years) d.setFullYear(d.getFullYear() + years);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function Subscriptions() {
  const { user, activeOrgId } = useAuth();
  const { data: subs, add, update, remove, isLoading, refresh } = useEntity<Recurring>("recurring_expenses", [], {
    orderBy: "created_at",
    toRow: (s) => ({
      name: s.name, website: s.website, vendor_id: s.vendor_id, category: s.category,
      amount: s.amount, billing_cycle: s.billing_cycle, status: s.status,
      next_renewal: s.next_renewal, cancelled_at: s.cancelled_at, notes: s.notes, auto_log: s.auto_log,
    }),
  });
  const { data: vendors } = useEntity<Vendor>("vendors", [], { toRow: (v) => ({ name: v.name }) });
  const { data: priceHistory, refresh: refreshPrices } = useEntity<PriceHistory>("subscription_price_history", [], { orderBy: "effective_date" });
  const { addToast } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const today = todayISO();
  const in30 = isoShift(today, 30);
  const yearAgo = isoShift(today, 0, -1);

  const vendorName = (id: string | null) => (id ? vendors.find((v) => v.id === id)?.name ?? "—" : "—");
  const isOverdue = (s: Recurring) => s.status === "active" && !!s.next_renewal && s.next_renewal < today;

  const upcoming = useMemo(
    () =>
      subs
        .filter((s) => s.status === "active" && s.next_renewal && s.next_renewal >= today && s.next_renewal <= in30)
        .sort((a, b) => (a.next_renewal ?? "").localeCompare(b.next_renewal ?? "")),
    [subs, today, in30],
  );

  const totals = useMemo(() => {
    const active = subs.filter((s) => s.status === "active");
    const monthly = active.reduce((sum, s) => sum + monthlyEquiv(s), 0);
    const next30 = upcoming.reduce((sum, s) => sum + Number(s.amount), 0);
    return { count: active.length, monthly, annual: monthly * 12, next30 };
  }, [subs, upcoming]);

  const priceBySub = useMemo(() => {
    const map = new Map<string, PriceHistory[]>();
    for (const h of priceHistory) {
      if (!h.subscription_id) continue;
      map.set(h.subscription_id, [...(map.get(h.subscription_id) ?? []), h]);
    }
    return map;
  }, [priceHistory]);

  const priceChange = (s: Recurring) => {
    const hist = (priceBySub.get(s.id) ?? [])
      .filter((h) => h.effective_date >= yearAgo)
      .sort((a, b) => b.effective_date.localeCompare(a.effective_date));
    if (hist.length === 0) return null;
    const prev = Number(hist[0].amount);
    const cur = Number(s.amount);
    if (cur === prev) return null;
    const tip = ["Price history:", `now: ${formatMoney(cur)}`, ...hist.map((h) => `${formatBusinessDate(h.effective_date)}: ${formatMoney(h.amount)}`)].join("\n");
    return { dir: cur > prev ? ("up" as const) : ("down" as const), tip };
  };

  const previewMonthly = (Number(form.amount) || 0) / (CYCLE_DIVISOR[form.billing_cycle] ?? 1);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const openAdd = () => { setEditId(null); setForm(emptyForm); setIsOpen(true); };
  const openEdit = (s: Recurring) => {
    setEditId(s.id);
    setForm({
      name: s.name, website: s.website ?? "", vendor_id: s.vendor_id ?? "", category: s.category ?? "",
      amount: Number(s.amount), billing_cycle: s.billing_cycle, next_renewal: s.next_renewal ?? "", notes: s.notes ?? "",
    });
    setIsOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const payload = {
      name,
      website: form.website.trim() || null,
      vendor_id: form.vendor_id || null,
      category: form.category.trim() || null,
      amount: Number(form.amount) || 0,
      billing_cycle: form.billing_cycle,
      next_renewal: form.next_renewal || null,
      notes: form.notes.trim() || null,
    };

    const old = editId ? subs.find((x) => x.id === editId) : null;
    const priceChanged = !!(old && Number(old.amount) !== payload.amount);

    const result = editId
      ? await update(editId, payload as Partial<Recurring>)
      : await add({
          id: crypto.randomUUID(), status: "active", started_on: today, cancelled_at: null, auto_log: false,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: "", org_id: null,
          ...payload,
        } as Recurring);
    if (result.ok === false) {
      addToast({ title: "Couldn't save", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }

    // Record the prior price only after the change actually persisted.
    if (priceChanged && old && editId && supabase && activeOrgId && user) {
      await supabase.from("subscription_price_history").insert({
        org_id: activeOrgId, user_id: user.id, subscription_id: editId,
        amount: Number(old.amount), effective_date: today,
      });
      await refreshPrices();
    }

    setIsOpen(false);
    addToast({ title: editId ? "Subscription updated" : "Subscription added", description: name, status: "ok" });
  };

  const toggleStatus = async (s: Recurring) => {
    const cancelling = s.status === "active";
    const result = await update(s.id, { status: cancelling ? "cancelled" : "active", cancelled_at: cancelling ? new Date().toISOString() : null } as Partial<Recurring>);
    if (result.ok === false) { addToast({ title: "Couldn't update", description: friendlyDbError({ code: result.code } as any), status: "alert" }); return; }
    addToast({ title: cancelling ? "Subscription cancelled" : "Subscription reactivated", description: s.name, status: "info" });
  };

  const toggleAutoLog = async (s: Recurring) => {
    const result = await update(s.id, { auto_log: !s.auto_log } as Partial<Recurring>);
    if (result.ok === false) { addToast({ title: "Couldn't update", description: friendlyDbError({ code: result.code } as any), status: "alert" }); return; }
    addToast({ title: !s.auto_log ? "Auto-log enabled" : "Auto-log disabled", description: s.name, status: "info" });
  };

  const handleDelete = async (s: Recurring) => {
    if (!confirm(`Delete "${s.name}"? Past payments already logged as expenses are kept.`)) return;
    const result = await remove(s.id);
    if (result.ok === false) { addToast({ title: "Couldn't delete", description: friendlyDbError({ code: result.code } as any), status: "alert" }); return; }
    addToast({ title: "Subscription removed", status: "info" });
  };

  // Log a charge: creates the expense AND advances next_renewal (atomic RPC).
  const logPayment = async (s: Recurring) => {
    try {
      const newDate = await rpcCall<string>("log_subscription_charge", { p_id: s.id });
      await refresh();
      addToast({ title: "Charge logged", description: `${s.name} · ${formatMoney(s.amount)} · renews ${formatBusinessDate(newDate)}`, status: "ok" });
    } catch (err) {
      addToast({ title: "Couldn't log charge", description: err instanceof Error ? err.message : "Try again", status: "alert" });
    }
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Subscription",
        cell: (info: any) => {
          const s: Recurring = info.row.original;
          return (
            <div className="flex items-center gap-2.5">
              <CompanyLogo name={s.name} website={s.website} size={26} />
              <span className="font-medium">{s.name}</span>
            </div>
          );
        },
      },
      { accessorKey: "vendor_id", header: "Vendor", cell: (info: any) => <span className="text-text-secondary">{vendorName(info.getValue())}</span> },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: (info: any) => {
          const s: Recurring = info.row.original;
          const pc = priceChange(s);
          return (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              {formatMoney(info.getValue())}<span className="text-text-tertiary">/{cycleAbbr(s.billing_cycle)}</span>
              {pc && (
                <span title={pc.tip} className={pc.dir === "up" ? "text-status-alert" : "text-status-ok"} aria-label="price changed">
                  {pc.dir === "up" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                </span>
              )}
            </span>
          );
        },
      },
      { id: "monthly", header: "Monthly", cell: (info: any) => <span className="tabular-nums text-text-secondary">{formatMoney(monthlyEquiv(info.row.original))}</span> },
      { accessorKey: "next_renewal", header: "Next renewal", cell: (info: any) => <span className="text-text-secondary">{info.getValue() ? formatBusinessDate(info.getValue()) : "—"}</span> },
      {
        id: "auto",
        header: "Auto-log",
        cell: (info: any) => {
          const s: Recurring = info.row.original;
          return <Toggle checked={!!s.auto_log} onChange={() => toggleAutoLog(s)} ariaLabel="Auto-log on renewal" />;
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: (info: any) => {
          const s: Recurring = info.row.original;
          if (isOverdue(s)) return <Badge variant="outline" className="text-status-warn border-status-warn/40">Overdue</Badge>;
          return <Badge variant={s.status === "active" ? "brand" : "default"} className="capitalize">{s.status}</Badge>;
        },
      },
      {
        id: "actions",
        header: "",
        cell: (info: any) => {
          const s: Recurring = info.row.original;
          return (
            <div className="flex items-center gap-1 justify-end">
              {s.status === "active" && (
                <Button size="sm" variant="outline" onClick={() => logPayment(s)} title="Log a charge and advance the renewal date">
                  <Receipt className="w-3.5 h-3.5 mr-1" /> Log
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => openEdit(s)} aria-label="Edit"><Pencil className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => toggleStatus(s)} aria-label={s.status === "active" ? "Cancel" : "Reactivate"} title={s.status === "active" ? "Cancel" : "Reactivate"}>
                {s.status === "active" ? <X className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => handleDelete(s)} aria-label="Delete" className="text-text-tertiary hover:text-status-alert"><Trash2 className="w-4 h-4" /></Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendors, priceBySub, today],
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2">
            <Repeat className="w-6 h-6 text-text-secondary" /> Subscriptions
          </h1>
          <p className="text-sm text-text-secondary">Recurring bills the business pays. Logging a charge records the expense and advances the renewal.</p>
        </div>
        <Button variant="brand" onClick={openAdd}>
          <Plus className="w-4 h-4" /> Add Subscription
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6">
        <StatTile label="Active" value={String(totals.count)} />
        <StatTile label="Monthly burn" value={formatMoney(totals.monthly)} />
        <StatTile label="Annualized" value={formatMoney(totals.annual)} />
        <StatTile label="Next 30 days" value={formatMoney(totals.next30)} />
      </div>

      {/* Upcoming strip */}
      {upcoming.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wide text-text-secondary">
            <CalendarClock className="w-3.5 h-3.5" /> Renewing in the next 30 days
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            {upcoming.map((s) => (
              <div key={s.id} className="shrink-0 w-48 rounded-xl border border-border-subtle bg-bg-elevated p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CompanyLogo name={s.name} website={s.website} size={22} />
                  <span className="text-sm font-medium truncate">{s.name}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">{formatBusinessDate(s.next_renewal)}</span>
                  <span className="tabular-nums font-medium">{formatMoney(s.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Card className="flex-1 overflow-auto flex flex-col mb-12">
        {isLoading ? (
          <LoadingTable cols={8} rows={6} />
        ) : subs.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="No subscriptions tracked"
            description="Add recurring costs like Shopify, QuickBooks, or hosting to see your monthly burn."
            action={<Button variant="outline" onClick={openAdd}>Add Subscription</Button>}
          />
        ) : (
          <DataTable columns={columns} data={subs} />
        )}
      </Card>

      {isOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}>
          <Card className="w-full max-w-lg bg-bg-elevated border-border-strong shadow-2xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-border-subtle">
              <div className="flex items-center gap-3">
                {form.name.trim() ? (
                  <CompanyLogo name={form.name} website={form.website} size={40} className="rounded-lg" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-bg-base border border-border-subtle flex items-center justify-center shrink-0">
                    <Repeat className="w-5 h-5 text-accent-brand" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-semibold leading-tight">{editId ? "Edit subscription" : "Add subscription"}</h2>
                  <p className="text-xs text-text-secondary mt-0.5">A recurring bill the business pays.</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} aria-label="Close" className="-mr-1 text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Name <span className="text-accent-brand">*</span></label>
                <Input autoFocus required className="w-full" placeholder="e.g. Shopify" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Website</label>
                <Input className="w-full" placeholder="shopify.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Vendor</label>
                  <select className="w-full bg-bg-elevated border border-border-strong rounded-[8px] px-2.5 py-2 text-sm focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors" value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}>
                    <option value="">— None —</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Category</label>
                  <Input className="w-full" placeholder="Software" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Amount</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-text-secondary pointer-events-none">$</span>
                    <Input type="number" step="0.01" min="0" inputMode="decimal" className="w-full pl-6" value={form.amount} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Billing</label>
                  <select className="w-full bg-bg-elevated border border-border-strong rounded-[8px] px-2.5 py-2 text-sm capitalize focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors" value={form.billing_cycle} onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}>
                    {CYCLES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                </div>
              </div>
              {form.billing_cycle !== "monthly" && (Number(form.amount) || 0) > 0 && (
                <div className="flex items-center justify-between text-xs bg-bg-base border border-border-subtle rounded-lg px-3 py-2">
                  <span className="text-text-tertiary">Counts toward monthly burn as</span>
                  <span className="font-medium text-text-primary tabular-nums">{formatMoney(previewMonthly)}/mo</span>
                </div>
              )}
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Next renewal</label>
                <Input type="date" className="w-full" value={form.next_renewal} onChange={(e) => setForm({ ...form, next_renewal: e.target.value })} />
                <p className="text-xs text-text-tertiary mt-1">When the next charge is expected. Logging a charge advances this automatically.</p>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Notes</label>
                <Input className="w-full" placeholder="Optional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit" variant="brand">{editId ? "Save Changes" : "Add Subscription"}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
