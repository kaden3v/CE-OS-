import React, { useState, useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { Plus, X, Store, ShoppingBag, ExternalLink } from "lucide-react";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { CultivarName } from "@/components/ui/CultivarName";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/Input";
import { useEntity } from "@/hooks/useEntity";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

type Listing = Tables<"listings">;
type Cultivar = Tables<"cultivars">;
type InventoryRow = Tables<"inventory">;

const SEED: Listing[] = [];

const channelIcon = (c: string) => (c === "shopify" ? <Store className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />);

/** Vela-style listing completeness: each missing field costs points. */
const TITLE_MIN_LENGTH = 25;
function scoreListing(l: Listing): { score: number; missing: string[] } {
  const checks: Array<[boolean, string]> = [
    [(l.title?.length ?? 0) >= TITLE_MIN_LENGTH, "descriptive title (25+ chars)"],
    [!!l.cultivar_id, "linked cultivar"],
    [Number(l.price) > 0, "price"],
    [Number(l.stock) > 0, "stock quantity"],
    [!!l.url, "channel URL"],
    [!!l.external_id, "channel ID (published)"],
  ];
  const passed = checks.filter(([ok]) => ok).length;
  return {
    score: Math.round((passed / checks.length) * 100),
    missing: checks.filter(([ok]) => !ok).map(([, label]) => label),
  };
}
const scoreTone = (s: number) => (s >= 80 ? "ok" : s >= 50 ? "warn" : "alert");

const renderStatus = (s: string) => {
  switch (s) {
    case "active":
      return <div className="flex items-center gap-2"><StatusDot status="ok" /> Active</div>;
    case "draft":
      return <div className="flex items-center gap-2"><StatusDot status="warn" /> Draft</div>;
    case "archived":
      return <div className="flex items-center gap-2"><StatusDot status="alert" /> Archived</div>;
    case "sold-out":
      return <div className="flex items-center gap-2"><StatusDot status="warn" /> Sold out</div>;
    default:
      return s;
  }
};

export default function Listings() {
  const { data: listings, add, isLoading } = useEntity<Listing>("listings", SEED, {
    toRow: (l) => ({
      cultivar_id: l.cultivar_id,
      channel: l.channel,
      external_id: l.external_id,
      title: l.title,
      status: l.status,
      price: l.price,
      stock: l.stock,
      url: l.url,
    }),
  });
  const { data: cultivars } = useEntity<Cultivar>("cultivars", [], {
    toRow: (c) => ({ name: c.name }),
  });
  const { data: inventoryRows } = useEntity<InventoryRow>("inventory", [], {
    toRow: (r) => ({ name: r.name }),
  });
  const { addToast } = useApp();

  // Real stock on hand per cultivar, from inventory — listings' own "stock"
  // field is just the quantity listed on the channel, not the truth.
  const onHandByCultivar = useMemo(() => {
    const map = new Map<string, number>();
    inventoryRows.forEach((r) => {
      if (!r.cultivar_id) return;
      // Listings can only be backed by sellable stock — grow-out plants don't count.
      map.set(r.cultivar_id, (map.get(r.cultivar_id) ?? 0) + r.stock_juv + r.stock_mat);
    });
    return map;
  }, [inventoryRows]);

  const [channelFilter, setChannelFilter] = useState<"all" | "shopify" | "etsy">("all");
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ cultivar_id: "", channel: "shopify", title: "", price: 0, stock: 0, url: "" });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) return;
    const result = await add({
      id: crypto.randomUUID(),
      cultivar_id: form.cultivar_id || null,
      channel: form.channel,
      external_id: null,
      title,
      status: "draft",
      price: Number(form.price) || 0,
      stock: Number(form.stock) || 0,
      url: form.url.trim() || null,
      last_synced_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Listing);
    if (result.ok === false) {
      addToast({ title: "Couldn't add listing", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    setIsOpen(false);
    setForm({ cultivar_id: "", channel: "shopify", title: "", price: 0, stock: 0, url: "" });
    addToast({ title: "Listing drafted", description: title, status: "ok" });
  };

  const filtered = useMemo(
    () => listings.filter((l) => channelFilter === "all" || l.channel === channelFilter),
    [listings, channelFilter],
  );

  const cultivarName = (id: string | null) => (id ? cultivars.find((c) => c.id === id)?.name ?? "—" : "—");

  const columns = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: (info: any) => {
          const url = info.row.original.url as string | null;
          if (!url) return <span className="font-medium">{info.getValue()}</span>;
          return (
            <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="font-medium inline-flex items-center gap-1 hover:underline" title="Open live listing">
              {info.getValue()}
              <ExternalLink className="w-3 h-3 text-text-tertiary shrink-0" />
            </a>
          );
        },
      },
      { accessorKey: "cultivar_id", header: "Cultivar", cell: (info: any) => <CultivarName name={cultivarName(info.getValue())} className="text-text-secondary" /> },
      { accessorKey: "channel", header: "Channel", cell: (info: any) => <div className="flex items-center gap-2 text-text-secondary capitalize">{channelIcon(info.getValue())}{info.getValue()}</div> },
      { accessorKey: "price", header: "Price", cell: (info: any) => <span className="tabular-nums">${Number(info.getValue()).toFixed(2)}</span> },
      { accessorKey: "stock", header: "Listed qty", cell: (info: any) => <span className="tabular-nums">{info.getValue()}</span> },
      {
        id: "on_hand",
        header: "On hand",
        cell: (info: any) => {
          const cid = info.row.original.cultivar_id as string | null;
          if (!cid) return <span className="text-text-tertiary">—</span>;
          const onHand = onHandByCultivar.get(cid) ?? 0;
          const listed = Number(info.row.original.stock) || 0;
          return (
            <span className={`tabular-nums ${onHand < listed ? "text-status-warn" : "text-text-secondary"}`} title={onHand < listed ? "Listed more than you have in inventory" : undefined}>
              {onHand}
            </span>
          );
        },
      },
      { accessorKey: "status", header: "Status", cell: (info: any) => renderStatus(info.getValue()) },
      {
        accessorKey: "last_synced_at",
        header: "Synced",
        cell: (info: any) => {
          const v = info.getValue() as string | null;
          if (!v) return <span className="text-text-tertiary text-xs">manual</span>;
          const mins = Math.floor((Date.now() - new Date(v).getTime()) / 60000);
          const label = mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
          return <span className="text-text-secondary text-xs" title={new Date(v).toLocaleString()}>{label}</span>;
        },
      },
      {
        id: "quality",
        header: "Quality",
        cell: (info: any) => {
          const { score, missing } = scoreListing(info.row.original);
          return (
            <div
              className="flex items-center gap-2"
              title={missing.length ? `Missing: ${missing.join(", ")}` : "Complete listing"}
            >
              <StatusDot status={scoreTone(score) as any} />
              <span className="tabular-nums text-text-secondary">{score}%</span>
            </div>
          );
        },
      },
    ],
    [cultivars, onHandByCultivar],
  );

  const isEmpty = !isLoading && filtered.length === 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Listings</h1>
          <p className="text-sm text-text-secondary">Track availability across Shopify, Etsy, and wholesale.</p>
        </div>
        <Button variant="brand" onClick={() => setIsOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Listing
        </Button>
      </div>

      <div className="flex gap-2 mb-4">
        {(["all", "shopify", "etsy"] as const).map((c) => (
          <Button key={c} size="sm" variant={channelFilter === c ? "brand" : "outline"} onClick={() => setChannelFilter(c)} className="capitalize">
            {c}
          </Button>
        ))}
      </div>

      <Card className="flex-1 overflow-auto flex flex-col">
        {isLoading ? (
          <LoadingTable cols={6} rows={8} />
        ) : isEmpty ? (
          <EmptyState
            title="No listings yet"
            description="Drafts you create here can later sync to Shopify/Etsy."
            action={<Button variant="outline" onClick={() => setIsOpen(true)}>Add listing</Button>}
          />
        ) : (
          <DataTable columns={columns} data={filtered} />
        )}
      </Card>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title="New Listing" size="lg">
            <form onSubmit={handleAdd} className="p-4 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Title *</label>
                <Input required placeholder='Pinguicula "Pirouette" — Mature' value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Cultivar</label>
                  <select
                    className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong"
                    value={form.cultivar_id}
                    onChange={(e) => setForm({ ...form, cultivar_id: e.target.value })}
                  >
                    <option value="">— Unlinked —</option>
                    {cultivars.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Channel</label>
                  <select
                    className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong"
                    value={form.channel}
                    onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  >
                    <option value="shopify">Shopify</option>
                    <option value="etsy">Etsy</option>
                    <option value="wholesale">Wholesale</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Price</label>
                  <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Stock</label>
                  <Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">URL</label>
                  <Input placeholder="https://..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit">Save Draft</Button>
              </div>
            </form>
      </Modal>
    </div>
  );
}
