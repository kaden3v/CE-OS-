import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { ArrowLeft, Pencil, Check, X, ChevronRight, Store } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { EmptyState, LoadingTable } from "@/components/ui/StateRenderer";
import { useEntity } from "@/hooks/useEntity";
import { useApp } from "@/contexts/AppContext";
import { friendlyDbError } from "@/lib/dbErrors";
import { formatMoney } from "@/lib/format";
import { formatBusinessDate, isoYear, currentYear } from "@/lib/dates";
import type { Tables } from "@/lib/database.types";

type Vendor = Tables<"vendors">;
type Expense = Tables<"expenses">;

const SOURCE_META: Record<string, { label: string; to: string; variant?: "brand" | "outline" | "default" }> = {
  manual: { label: "Expense", to: "/finances/expenses" },
  supply_purchase: { label: "Supply", to: "/finances/supplies" },
  subscription: { label: "Subscription", to: "/finances/subscriptions" },
  mileage: { label: "Mileage", to: "/finances/mileage" },
};
const sourceMeta = (src: string | null) => SOURCE_META[src ?? "manual"] ?? SOURCE_META.manual;

const labelCls = "block text-xs uppercase tracking-wide text-text-secondary mb-1.5";

export default function VendorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useApp();
  const { data: vendors, update, isLoading: vendorsLoading } = useEntity<Vendor>("vendors", []);
  const { data: expenses, isLoading: expensesLoading } = useEntity<Expense>("expenses", [], { orderBy: "occurred_on" });

  const vendor = vendors.find((v) => v.id === id) ?? null;

  const activity = useMemo(
    () =>
      expenses
        .filter((e) => e.vendor_id === id)
        .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)),
    [expenses, id],
  );

  const stats = useMemo(() => {
    const yr = currentYear();
    let ytd = 0;
    let lifetime = 0;
    let last: string | null = null;
    for (const e of activity) {
      const amt = Number(e.amount);
      lifetime += amt;
      if (isoYear(e.occurred_on) === yr) ytd += amt;
      if (!last || e.occurred_on > last) last = e.occurred_on;
    }
    return { ytd, lifetime, last };
  }, [activity]);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", contact_email: "", contact_phone: "", website: "", notes: "", is_1099: false });

  const startEdit = () => {
    if (!vendor) return;
    setForm({
      name: vendor.name,
      category: vendor.category ?? "",
      contact_email: vendor.contact_email ?? "",
      contact_phone: vendor.contact_phone ?? "",
      website: vendor.website ?? "",
      notes: vendor.notes ?? "",
      is_1099: vendor.is_1099 ?? false,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!vendor) return;
    const name = form.name.trim();
    if (!name) return;
    const r = await update(vendor.id, {
      name,
      category: form.category.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      website: form.website.trim() || null,
      notes: form.notes.trim() || null,
      is_1099: form.is_1099,
    } as Partial<Vendor>);
    if (!r.ok) {
      addToast({ title: "Couldn't save", description: friendlyDbError({ code: r.code } as any), status: "alert" });
      return;
    }
    setEditing(false);
    addToast({ title: "Vendor updated", status: "ok" });
  };

  if (vendorsLoading && !vendor) {
    return <div className="p-4 md:p-8 max-w-5xl mx-auto"><LoadingTable cols={4} rows={6} /></div>;
  }

  if (!vendor) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <Link to="/finances/vendors" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6"><ArrowLeft className="w-4 h-4" /> Vendors</Link>
        <EmptyState icon={Store} title="Vendor not found" description="This vendor may have been deleted." action={<Button variant="outline" onClick={() => navigate("/finances/vendors")}>Back to Vendors</Button>} />
      </div>
    );
  }

  const info = (label: string, value: string | null) => (
    <div>
      <div className="text-xs uppercase tracking-wide text-text-secondary mb-1">{label}</div>
      <div className="text-sm text-text-primary">{value || "—"}</div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto h-full flex flex-col">
      <Link to="/finances/vendors" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-4"><ArrowLeft className="w-4 h-4" /> Vendors</Link>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold">{vendor.name}</h1>
        {vendor.category && <Badge variant="outline">{vendor.category}</Badge>}
        {vendor.is_1099 && <Badge variant="outline" className="text-status-info border-status-info/40">1099</Badge>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-6 mb-6">
        <StatTile label="YTD spend" value={formatMoney(stats.ytd)} />
        <StatTile label="Lifetime spend" value={formatMoney(stats.lifetime)} />
        <StatTile label="Last transaction" value={stats.last ? formatBusinessDate(stats.last) : "—"} />
      </div>

      {/* Contact block */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium">Contact</h2>
          {editing ? (
            <div className="flex items-center gap-1">
              <button onClick={saveEdit} aria-label="Save" className="p-1.5 rounded text-status-ok hover:bg-bg-active"><Check className="w-4 h-4" /></button>
              <button onClick={() => setEditing(false)} aria-label="Cancel" className="p-1.5 rounded text-text-secondary hover:bg-bg-active"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <button onClick={startEdit} aria-label="Edit" className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-active"><Pencil className="w-4 h-4" /></button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelCls}>Name</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className={labelCls}>Category</label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
              <div><label className={labelCls}>Email</label><Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
              <div><label className={labelCls}>Phone</label><Input type="tel" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
              <div><label className={labelCls}>Website</label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
              <div><label className={labelCls}>Notes</label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5">
              <div>
                <div className="text-sm text-text-primary">1099 vendor</div>
                <div className="text-xs text-text-tertiary">Track payments for year-end 1099 reporting.</div>
              </div>
              <Toggle checked={form.is_1099} onChange={(v) => setForm({ ...form, is_1099: v })} ariaLabel="1099 vendor" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {info("Email", vendor.contact_email)}
            {info("Phone", vendor.contact_phone)}
            {info("Website", vendor.website)}
            {info("Address", vendor.address)}
            {info("Notes", vendor.notes)}
            {info("1099", vendor.is_1099 ? "Yes" : "No")}
          </div>
        )}
      </Card>

      {/* Activity */}
      <Card className="flex-1 flex flex-col min-h-0 mb-12 overflow-auto">
        <div className="px-4 py-3 border-b border-border-subtle text-sm font-medium shrink-0">Activity</div>
        {expensesLoading ? (
          <LoadingTable cols={4} rows={6} />
        ) : activity.length === 0 ? (
          <EmptyState icon={Store} title="No activity yet" description="Expenses, supply purchases, and subscription charges against this vendor show here." />
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-[12px] uppercase tracking-wide text-text-secondary sticky top-0 bg-bg-base/95 backdrop-blur-md z-10 border-b border-border-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Memo</th>
                <th className="px-4 py-2 font-medium text-right">Amount</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {activity.map((e) => {
                const m = sourceMeta(e.source);
                return (
                  <tr key={e.id} onClick={() => navigate(m.to)} className="border-b border-border-subtle/50 last:border-0 hover:bg-bg-hover/50 cursor-pointer">
                    <td className="px-4 py-2 whitespace-nowrap text-text-secondary">{formatBusinessDate(e.occurred_on)}</td>
                    <td className="px-4 py-2"><Badge variant="outline">{m.label}</Badge></td>
                    <td className="px-4 py-2 text-text-secondary max-w-[18rem] truncate">{e.description ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{formatMoney(e.amount)}</td>
                    <td className="px-4 py-2 text-right"><ChevronRight className="w-4 h-4 text-text-tertiary inline" /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-bg-elevated/95 backdrop-blur-md border-t border-border-strong">
              <tr>
                <td className="px-4 py-2.5 text-text-secondary" colSpan={3}>{activity.length} {activity.length === 1 ? "entry" : "entries"}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatMoney(stats.lifetime)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </Card>
    </div>
  );
}
