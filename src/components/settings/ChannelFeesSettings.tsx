import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { Info } from "lucide-react";
import { useEntity } from "@/hooks/useEntity";
import { useApp } from "@/contexts/AppContext";
import { friendlyDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";

type Rule = Tables<"channel_fee_rules">;

const FIELDS: { key: keyof Rule; label: string; suffix: string }[] = [
  { key: "percent_fee", label: "Transaction %", suffix: "%" },
  { key: "payment_percent", label: "Payment %", suffix: "%" },
  { key: "fixed_fee", label: "Fixed", suffix: "$" },
  { key: "payment_fixed", label: "Payment fixed", suffix: "$" },
  { key: "listing_fee", label: "Listing / item", suffix: "$" },
];

export function ChannelFeesSettings() {
  const { data: rules, update } = useEntity<Rule>("channel_fee_rules", [], { orderBy: "channel", ascending: true });
  const { addToast } = useApp();
  const [drafts, setDrafts] = useState<Record<string, Partial<Rule>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const val = (r: Rule, k: keyof Rule): number => Number((drafts[r.id]?.[k] as number | undefined) ?? r[k] ?? 0);
  const isDirty = (id: string) => !!drafts[id] && Object.keys(drafts[id]).length > 0;
  const setField = (id: string, k: keyof Rule, v: number | boolean) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [k]: v } }));

  const save = async (r: Rule) => {
    const patch = drafts[r.id];
    if (!patch) return;
    setSaving(r.id);
    const res = await update(r.id, patch as Partial<Rule>);
    setSaving(null);
    if (!res.ok) {
      addToast({ title: "Couldn't save", description: friendlyDbError({ code: res.code } as any), status: "alert" });
      return;
    }
    setDrafts((d) => { const next = { ...d }; delete next[r.id]; return next; });
    addToast({ title: "Fee rule saved", description: r.channel, status: "ok" });
  };

  return (
    <Card className="p-6">
      <div className="mb-2">
        <h3 className="text-base font-medium">Channel fees</h3>
        <p className="text-sm text-text-secondary">Editable estimates used to approximate net proceeds across the app.</p>
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 mb-4 text-xs text-text-secondary">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-status-info" />
        <span>These are your best-guess marketplace rates, not authoritative — adjust to match your statements.</span>
      </div>

      <div className="space-y-4">
        {rules.map((r) => (
          <div key={r.id} className="rounded-lg border border-border-subtle p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">{r.channel}</span>
                <Toggle checked={!!val(r, "active")} onChange={(v) => setField(r.id, "active", v)} ariaLabel="Active" />
                <span className="text-xs text-text-tertiary">{val(r, "active") ? "active" : "off"}</span>
              </div>
              <Button size="sm" variant={isDirty(r.id) ? "brand" : "ghost"} disabled={!isDirty(r.id) || saving === r.id} onClick={() => save(r)}>
                {saving === r.id ? "Saving…" : "Save"}
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {FIELDS.map((f) => (
                <div key={String(f.key)} className="min-w-0">
                  <label className="block text-[10px] uppercase tracking-wide text-text-tertiary mb-1">{f.label}</label>
                  <div className="relative">
                    {f.suffix === "$" && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-text-tertiary">$</span>}
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className={`w-full ${f.suffix === "$" ? "pl-5" : ""}`}
                      value={String(val(r, f.key))}
                      onChange={(e) => setField(r.id, f.key, Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
