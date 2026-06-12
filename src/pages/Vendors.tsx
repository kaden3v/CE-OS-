import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { Store, Plus, ArrowUp, ArrowDown, AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/Input";
import { useEntity } from "@/hooks/useEntity";
import { friendlyDbError } from "@/lib/dbErrors";
import { formatMoney } from "@/lib/format";
import { formatBusinessDate, isoYear, currentYear } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";

type Vendor = Tables<"vendors">;
type Expense = Tables<"expenses">;

const CATEGORIES = ["Plants/Wholesale", "Plants", "Seeds", "Media", "Supplies", "Shipping", "Software", "Other"];
const THRESHOLD_1099 = 600;

type SortKey = "name" | "category" | "ytd" | "last";
interface SortState { key: SortKey; dir: "asc" | "desc" }

const emptyForm = { name: "", category: "Plants/Wholesale", email: "", phone: "", website: "", notes: "", is_1099: false };

export default function Vendors() {
  const navigate = useNavigate();
  const { addToast } = useApp();
  const { data: vendors, add, isLoading } = useEntity<Vendor>("vendors", [], {
    toRow: (v) => ({
      name: v.name, category: v.category, contact_name: v.contact_name,
      contact_email: v.contact_email, contact_phone: v.contact_phone,
      url: v.url, website: v.website, address: v.address, notes: v.notes, is_1099: v.is_1099,
    }),
  });
  const { data: expenses } = useEntity<Expense>("expenses", [], { orderBy: "occurred_on" });

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [dup, setDup] = useState<Vendor | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "ytd", dir: "desc" });

  const spend = useMemo(() => {
    const yr = currentYear();
    const map = new Map<string, { ytd: number; lifetime: number; last: string | null }>();
    for (const e of expenses) {
      if (!e.vendor_id) continue;
      const cur = map.get(e.vendor_id) ?? { ytd: 0, lifetime: 0, last: null };
      const amt = Number(e.amount);
      cur.lifetime += amt;
      if (isoYear(e.occurred_on) === yr) cur.ytd += amt;
      if (!cur.last || e.occurred_on > cur.last) cur.last = e.occurred_on;
      map.set(e.vendor_id, cur);
    }
    return map;
  }, [expenses]);
  const sp = (id: string) => spend.get(id) ?? { ytd: 0, lifetime: 0, last: null as string | null };

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...vendors].sort((a, b) => {
      let c = 0;
      switch (sort.key) {
        case "category": c = (a.category ?? "").localeCompare(b.category ?? ""); break;
        case "ytd": c = sp(a.id).ytd - sp(b.id).ytd; break;
        case "last": c = (sp(a.id).last ?? "").localeCompare(sp(b.id).last ?? ""); break;
        default: c = a.name.localeCompare(b.name);
      }
      return c * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors, sort, spend]);

  const onSort = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "ytd" || k === "last" ? "desc" : "asc" }));

  const vendors1099 = useMemo(() => vendors.filter((v) => v.is_1099), [vendors]);

  const openAdd = () => { setForm(emptyForm); setDup(null); setIsOpen(true); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await create(false);
  };

  const create = async (force: boolean) => {
    const name = form.name.trim();
    if (!name) return;
    if (!force) {
      const existing = vendors.find((v) => v.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) { setDup(existing); return; }
    }
    const result = await add({
      id: crypto.randomUUID(),
      name,
      category: form.category,
      contact_email: form.email.trim() || null,
      contact_phone: form.phone.trim() || null,
      contact_name: null,
      url: null,
      website: form.website.trim() || null,
      address: null,
      notes: form.notes.trim() || null,
      is_1099: form.is_1099,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Vendor);
    if (result.ok === false) {
      addToast({ title: "Couldn't add vendor", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setIsOpen(false);
    setDup(null);
    addToast({ title: "Vendor added", description: `${name} is in your directory.`, status: "ok" });
  };

  const SortHeader = ({ label, k, align = "left" }: { label: string; k: SortKey; align?: "left" | "right" }) => (
    <th className={cn("px-3 py-2 font-medium select-none", align === "right" && "text-right")}>
      <button onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 hover:text-text-primary", sort.key === k && "text-text-primary")}>
        {label}
        {sort.key === k && (sort.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  const isEmpty = !isLoading && vendors.length === 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Vendors</h1>
          <p className="text-sm text-text-secondary">Suppliers and service providers — click a vendor to see its spend.</p>
        </div>
        <Button variant="brand" onClick={openAdd}>
          <Plus className="w-4 h-4" /> Add Vendor
        </Button>
      </div>

      {/* 1099 section */}
      {vendors1099.length > 0 && (
        <Card className="p-4 mb-6">
          <div className="text-xs uppercase tracking-wide text-text-secondary mb-3">1099 vendors · {currentYear()} payments</div>
          <div className="flex flex-wrap gap-2">
            {vendors1099.map((v) => {
              const ytd = sp(v.id).ytd;
              const met = ytd >= THRESHOLD_1099;
              return (
                <button
                  key={v.id}
                  onClick={() => navigate(`/finances/vendors/${v.id}`)}
                  className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm hover:bg-bg-hover transition-colors"
                >
                  <span className="font-medium">{v.name}</span>
                  <span className="tabular-nums text-text-secondary">{formatMoney(ytd)}</span>
                  <Badge variant="outline" className={met ? "text-status-warn border-status-warn/40" : "text-text-tertiary border-border-subtle"}>
                    {met ? "1099 required" : `${formatMoney(THRESHOLD_1099 - ytd)} to $600`}
                  </Badge>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="flex-1 flex flex-col min-h-0 mb-12 overflow-auto">
        {isLoading && <LoadingTable cols={5} rows={8} />}
        {isEmpty && (
          <EmptyState
            icon={Store}
            title="No vendors yet"
            description="Add suppliers, nurseries, and service providers to track spend."
            action={<Button variant="outline" onClick={openAdd}>Add Vendor</Button>}
          />
        )}
        {!isLoading && !isEmpty && (
          <table className="w-full min-w-max text-sm text-left">
            <thead className="text-[12px] uppercase tracking-wide text-text-secondary sticky top-0 bg-bg-base/95 backdrop-blur-md z-10 border-b border-border-subtle">
              <tr>
                <SortHeader label="Name" k="name" />
                <SortHeader label="Category" k="category" />
                <SortHeader label="YTD spend" k="ytd" align="right" />
                <SortHeader label="Last activity" k="last" />
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((v) => {
                const s = sp(v.id);
                return (
                  <tr key={v.id} onClick={() => navigate(`/finances/vendors/${v.id}`)} className="border-b border-border-subtle/50 last:border-0 hover:bg-bg-hover/50 cursor-pointer">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium">{v.name}</span>
                      {v.is_1099 && <Badge variant="outline" className="ml-2 text-status-info border-status-info/40">1099</Badge>}
                    </td>
                    <td className="px-3 py-2">{v.category ? <Badge>{v.category}</Badge> : <span className="text-text-tertiary">—</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(s.ytd)}</td>
                    <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{s.last ? formatBusinessDate(s.last) : "—"}</td>
                    <td className="px-3 py-2 text-right"><ChevronRight className="w-4 h-4 text-text-tertiary inline" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title="New Vendor" size="md">
        <form onSubmit={submit} className="p-4 space-y-4">
          {dup && (
            <div className="flex items-start gap-2 rounded-lg border border-status-warn/40 bg-status-warn/10 px-3 py-2.5 text-sm">
              <AlertTriangle className="w-4 h-4 text-status-warn shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-text-primary">A vendor named <span className="font-medium">{dup.name}</span> already exists.</div>
                <div className="mt-2 flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/finances/vendors/${dup.id}`)}>Open it</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => create(true)}>Create anyway</Button>
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Company name *</label>
            <Input required placeholder="E.g. Brad's Greenhouse" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setDup(null); }} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Category</label>
              <select className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Website</label>
              <Input placeholder="example.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Email</label>
              <Input type="email" placeholder="orders@vendor.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Phone</label>
              <Input type="tel" placeholder="555-0123" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Notes</label>
            <Input placeholder="Optional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5">
            <div>
              <div className="text-sm text-text-primary">1099 vendor</div>
              <div className="text-xs text-text-tertiary">Track payments for year-end 1099 reporting.</div>
            </div>
            <Toggle checked={form.is_1099} onChange={(v) => setForm({ ...form, is_1099: v })} ariaLabel="1099 vendor" />
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
            <Button variant="ghost" type="button" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit">Save Vendor</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
