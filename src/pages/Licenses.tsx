import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { FileBadge, Plus, AlertTriangle, Calendar, Building2, Search, ShieldCheck, FileText, Trash2, Edit } from "lucide-react";
import { EmptyState } from "@/components/ui/StateRenderer";
import { cn } from "@/lib/utils";
import { useEntity } from "@/hooks/useEntity";
import { useApp } from "@/contexts/AppContext";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";
import { formatDate } from "@/lib/format";

type License = Tables<"licenses">;

const SEED: License[] = [];

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function statusInfo(days: number | null) {
  if (days === null) return { label: "—", class: "text-text-secondary" };
  if (days < 0) return { label: "Expired", class: "text-status-alert" };
  if (days <= 60) return { label: "Expiring Soon", class: "text-status-warn" };
  return { label: "Active", class: "text-status-ok" };
}

export default function Licenses() {
  const { data: licenses, add, update, remove, isLoading } = useEntity<License>("licenses", SEED, {
    toRow: (l) => ({
      name: l.name,
      issuer: l.issuer,
      reference_number: l.reference_number,
      status: l.status,
      issued_on: l.issued_on,
      expires_on: l.expires_on,
      notes: l.notes,
    }),
  });
  const { addToast } = useApp();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | License["status"]>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<License | null>(null);

  const empty = { name: "", issuer: "", reference_number: "", status: "active" as License["status"], expires_on: "", notes: "" };
  const [form, setForm] = useState(empty);

  const openAdd = () => {
    setEditing(null);
    setForm(empty);
    setIsOpen(true);
  };
  const openEdit = (l: License) => {
    setEditing(l);
    setForm({
      name: l.name,
      issuer: l.issuer ?? "",
      reference_number: l.reference_number ?? "",
      status: l.status as License["status"],
      expires_on: l.expires_on ?? "",
      notes: l.notes ?? "",
    });
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    if (editing) {
      const result = await update(editing.id, {
        name,
        issuer: form.issuer.trim() || null,
        reference_number: form.reference_number.trim() || null,
        status: form.status,
        expires_on: form.expires_on || null,
        notes: form.notes.trim() || null,
      } as Partial<License>);
      if (result.ok === false) {
        addToast({ title: "Save failed", description: friendlyDbError({ code: result.code } as any), status: "alert" });
        return;
      }
      addToast({ title: "License updated", status: "ok" });
    } else {
      const result = await add({
        id: crypto.randomUUID(),
        name,
        issuer: form.issuer.trim() || null,
        reference_number: form.reference_number.trim() || null,
        status: form.status,
        issued_on: null,
        expires_on: form.expires_on || null,
        notes: form.notes.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as License);
      if (result.ok === false) {
        addToast({ title: "Add failed", description: friendlyDbError({ code: result.code } as any), status: "alert" });
        return;
      }
      addToast({ title: "License added", description: name, status: "ok" });
    }
    setIsOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this license?")) return;
    const result = await remove(id);
    if (result.ok === false) {
      addToast({ title: "Delete failed", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    addToast({ title: "License removed", status: "ok" });
  };

  const filtered = useMemo(() => {
    return licenses
      .filter((l) => {
        const q = search.toLowerCase();
        const matchSearch = !q || l.name.toLowerCase().includes(q) || (l.issuer ?? "").toLowerCase().includes(q) || (l.reference_number ?? "").toLowerCase().includes(q);
        const matchStatus = filterStatus === "all" || l.status === filterStatus;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => (daysUntil(a.expires_on) ?? Infinity) - (daysUntil(b.expires_on) ?? Infinity));
  }, [licenses, search, filterStatus]);

  const metrics = useMemo(() => {
    let active = 0, expiring = 0, expired = 0;
    licenses.forEach((l) => {
      const d = daysUntil(l.expires_on);
      if (d === null) return;
      if (d < 0) expired++;
      else if (d <= 60) expiring++;
      else active++;
    });
    return { active, expiring, expired, total: licenses.length };
  }, [licenses]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Licenses & Permits</h1>
          <p className="text-sm text-text-secondary">Track regulatory expirations and compliance documents.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add License
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-bg-hover rounded-lg text-text-primary"><FileBadge className="w-5 h-5" /></div>
          <div><div className="text-2xl font-semibold">{metrics.total}</div><div className="text-xs text-text-secondary uppercase tracking-wider">Total</div></div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-status-ok/10 text-status-ok rounded-lg"><ShieldCheck className="w-5 h-5" /></div>
          <div><div className="text-2xl font-semibold">{metrics.active}</div><div className="text-xs text-text-secondary uppercase tracking-wider">Active</div></div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-status-warn/10 text-status-warn rounded-lg"><AlertTriangle className="w-5 h-5" /></div>
          <div><div className="text-2xl font-semibold">{metrics.expiring}</div><div className="text-xs text-text-secondary uppercase tracking-wider">Expiring &lt;60d</div></div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-status-alert/10 text-status-alert rounded-lg"><Calendar className="w-5 h-5" /></div>
          <div><div className="text-2xl font-semibold">{metrics.expired}</div><div className="text-xs text-text-secondary uppercase tracking-wider">Expired</div></div>
        </Card>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border-subtle flex flex-col sm:flex-row gap-4 items-center justify-between bg-bg-elevated/50">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <Input placeholder="Search licenses..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-full" />
          </div>
          <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            {(["all", "active", "pending", "expired", "revoked"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s as typeof filterStatus)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors border capitalize",
                  filterStatus === s ? "bg-text-primary text-bg-base border-text-primary font-medium" : "bg-transparent border-border-strong text-text-secondary hover:text-text-primary hover:border-text-primary",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-bg-base/30">
          {isLoading ? (
            <div className="text-text-secondary text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={FileText}
                title="No licenses found"
                description={search ? "Try adjusting your search or filters." : "You haven't added any licenses yet."}
                action={!search ? <Button variant="outline" className="mt-4" onClick={openAdd}>Add License</Button> : undefined}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filtered.map((lic) => {
                const days = daysUntil(lic.expires_on);
                const info = statusInfo(days);
                return (
                  <Card key={lic.id} className="relative group overflow-hidden border-border-subtle hover:border-border-strong transition-all duration-200">
                    {info.class === "text-status-alert" && <div className="absolute top-0 left-0 w-1 h-full bg-status-alert"></div>}
                    {info.class === "text-status-warn" && <div className="absolute top-0 left-0 w-1 h-full bg-status-warn"></div>}
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wider bg-purple-500/10 text-purple-400">{lic.status}</span>
                            {lic.notes && <span className="text-xs italic text-status-warn bg-status-warn/10 px-2 py-0.5 rounded">{lic.notes}</span>}
                          </div>
                          <h3 className="font-semibold text-lg text-text-primary leading-tight">{lic.name}</h3>
                          {lic.issuer && (
                            <div className="text-sm text-text-secondary flex items-center gap-1.5 mt-1">
                              <Building2 className="w-3.5 h-3.5" />
                              {lic.issuer}
                            </div>
                          )}
                        </div>
                        <div className="text-right pl-4">
                          {days !== null && (
                            <>
                              <span className={cn("block text-2xl font-bold tabular-nums leading-none mb-1", info.class)}>{days < 0 ? "0" : days}</span>
                              <span className="text-[10px] uppercase tracking-wider text-text-tertiary">Days Left</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border-subtle mt-4">
                        <div>
                          <div className="text-xs text-text-tertiary mb-1">Reference No.</div>
                          <div className="text-sm font-medium font-mono text-text-primary">{lic.reference_number ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-text-tertiary mb-1">Expiration Date</div>
                          <div className={cn("text-sm font-medium", info.class)}>{formatDate(lic.expires_on)}</div>
                        </div>
                      </div>
                      {/* Desktop: hover-reveal over the corner. */}
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex gap-2">
                        <button onClick={() => openEdit(lic)} aria-label="Edit" className="p-1.5 bg-bg-elevated border border-border-subtle rounded-md text-text-secondary hover:text-text-primary shadow-sm">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(lic.id)} aria-label="Delete" className="p-1.5 bg-bg-elevated border border-border-subtle rounded-md text-text-secondary hover:text-status-alert hover:border-status-alert/50 shadow-sm">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {/* Mobile: always-visible action row (hover doesn't exist on touch). */}
                      <div className="flex md:hidden gap-2 mt-4 pt-4 border-t border-border-subtle">
                        <button onClick={() => openEdit(lic)} className="flex-1 flex items-center justify-center gap-2 py-2 bg-bg-elevated border border-border-subtle rounded-md text-sm text-text-secondary active:bg-bg-hover">
                          <Edit className="w-4 h-4" /> Edit
                        </button>
                        <button onClick={() => handleDelete(lic.id)} className="flex-1 flex items-center justify-center gap-2 py-2 bg-bg-elevated border border-border-subtle rounded-md text-sm text-status-alert active:bg-bg-hover">
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Dialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title={editing ? "Edit License" : "Add License"}
        description={editing ? "Update the details of your tracking entry." : "Add a new regulatory permit or license to track."}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">License Name *</label>
            <Input required placeholder="e.g. Nursery License" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Issuer</label>
            <Input placeholder="e.g. USDA APHIS" value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Reference No.</label>
              <Input placeholder="Permit / registration #" value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as License["status"] })}
                className="w-full bg-[rgba(0,0,0,0.2)] border border-border-strong rounded-md py-2 px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-text-primary"
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Expiration Date</label>
              <Input type="date" value={form.expires_on} onChange={(e) => setForm({ ...form, expires_on: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Note</label>
              <Input placeholder="Optional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle mt-6">
            <Button variant="ghost" type="button" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit">{editing ? "Save Changes" : "Add License"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
