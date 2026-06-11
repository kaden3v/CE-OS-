import { useMemo } from "react";
import { Link } from "react-router";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useEntity } from "@/hooks/useEntity";
import { usePersistedState } from "@/hooks/usePersistedState";
import type { Tables } from "@/lib/database.types";

type Batch = Tables<"propagation_batches">;

const STAGES = [
  { id: "mother", label: "Mother Plants" },
  { id: "division", label: "Division & Pullings" },
  { id: "establishment", label: "Establishment" },
  { id: "ready", label: "Ready for Sale" },
] as const;

type StageId = (typeof STAGES)[number]["id"];

interface CapacityConfig {
  totalSlots: number;
  /** Bench slots one plant occupies at each stage. */
  footprint: Record<StageId, number>;
}

const DEFAULT_CONFIG: CapacityConfig = {
  totalSlots: 2000,
  footprint: { mother: 4, division: 1, establishment: 2, ready: 2 },
};

export default function Capacity() {
  const { data: batches } = useEntity<Batch>("propagation_batches", []);
  const [config, setConfig] = usePersistedState<CapacityConfig>("capacity-config", DEFAULT_CONFIG);

  const usage = useMemo(() => {
    const byStage: Record<string, { plants: number; slots: number }> = {};
    let usedSlots = 0;
    for (const b of batches) {
      const fp = config.footprint[b.stage as StageId] ?? 1;
      const slots = b.count * fp;
      usedSlots += slots;
      const cur = byStage[b.stage] ?? { plants: 0, slots: 0 };
      byStage[b.stage] = { plants: cur.plants + b.count, slots: cur.slots + slots };
    }
    const remaining = Math.max(0, config.totalSlots - usedSlots);
    const pct = config.totalSlots > 0 ? Math.min(100, (usedSlots / config.totalSlots) * 100) : 0;
    return { byStage, usedSlots, remaining, pct };
  }, [batches, config]);

  const setFootprint = (stage: StageId, v: number) =>
    setConfig((c) => ({ ...c, footprint: { ...c.footprint, [stage]: Math.max(0, v) } }));

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/propagation">
          <Button variant="outline" className="w-10 px-0" aria-label="Back to propagation">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-text-secondary" /> Bench Capacity
          </h1>
          <p className="text-sm text-text-secondary">How much greenhouse space your active batches occupy — and what's left.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">In use</div>
          <div className="text-3xl font-semibold tabular-nums">{usage.usedSlots.toLocaleString()}</div>
          <div className="text-xs text-text-tertiary mt-1">of {config.totalSlots.toLocaleString()} slots</div>
        </Card>
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Available</div>
          <div className="text-3xl font-semibold tabular-nums">{usage.remaining.toLocaleString()}</div>
          <div className="text-xs text-text-tertiary mt-1">
            ≈ {Math.floor(usage.remaining / (config.footprint.division || 1)).toLocaleString()} more divisions
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Utilization</div>
          <div className="text-3xl font-semibold tabular-nums">{usage.pct.toFixed(0)}%</div>
          <div className="h-2 rounded bg-bg-active overflow-hidden mt-3">
            <div className={usage.pct >= 90 ? "h-full bg-status-alert" : usage.pct >= 70 ? "h-full bg-status-warn" : "h-full bg-accent-brand"} style={{ width: `${usage.pct}%` }} />
          </div>
        </Card>
      </div>

      <Card className="p-6 mb-6">
        <h3 className="text-sm font-medium mb-4">By Stage</h3>
        <div className="space-y-3">
          {STAGES.map((s) => {
            const u = usage.byStage[s.id] ?? { plants: 0, slots: 0 };
            const pct = usage.usedSlots > 0 ? (u.slots / usage.usedSlots) * 100 : 0;
            return (
              <div key={s.id} className="grid grid-cols-[1fr_auto] gap-4 items-center">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{s.label}</span>
                    <span className="text-text-secondary tabular-nums">{u.plants} plants · {u.slots.toLocaleString()} slots</span>
                  </div>
                  <div className="h-1.5 rounded bg-bg-active overflow-hidden">
                    <div className="h-full bg-accent-brand" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-text-tertiary">
                  slots/plant
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={config.footprint[s.id]}
                    onChange={(e) => setFootprint(s.id, Number(e.target.value) || 0)}
                    className="w-16 px-2 py-1 text-xs"
                  />
                </label>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-medium mb-2">Greenhouse capacity</h3>
        <p className="text-xs text-text-tertiary mb-3">Total bench slots available. Adjust footprints above to match how you actually use space (saved on this device).</p>
        <label className="flex items-center gap-2 text-sm">
          Total slots
          <Input
            type="number"
            min="0"
            value={config.totalSlots}
            onChange={(e) => setConfig((c) => ({ ...c, totalSlots: Math.max(0, Number(e.target.value) || 0) }))}
            className="w-32"
          />
        </label>
      </Card>
    </div>
  );
}
