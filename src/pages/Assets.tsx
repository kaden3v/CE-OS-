import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Trash2 } from 'lucide-react';
import { Topbar } from '@/components/nav/Topbar';
import {
  addAsset, removeAsset, depreciationSchedule, listAssets, useAssetStore, totalDepreciationForYear,
  type Asset,
} from '@/lib/finance/assets';
import { formatCents } from '@/lib/finance/types';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';

/**
 * Capitalized assets + their depreciation schedules.
 *
 * Anything > $2,500 with a useful life beyond one year goes here, not in
 * Expenses. The schedule projects straight-line depreciation through the
 * useful life. A future pass will auto-post each year's depreciation entry
 * to the journal at year-end close.
 */
export default function Assets() {
  const navigate = useNavigate();
  const { addToast } = useApp();
  const [addOpen, setAddOpen] = useState(false);

  const assets = useAssetStore(() => listAssets());
  const currentYear = new Date().getFullYear();
  const thisYearDep = useAssetStore(() => totalDepreciationForYear(currentYear));

  return (
    <>
      <Topbar
        actions={
          <button
            onClick={() => setAddOpen(true)}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-accent-brand text-bg-base text-[13px] font-medium hover:opacity-90 transition-opacity duration-[120ms]"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Capitalize asset
          </button>
        }
      />

      <div className="p-4 md:p-6 max-w-4xl space-y-4">
        <p className="text-[12px] text-text-tertiary">
          Purchases over <strong className="text-text-secondary">$2,500</strong> with a useful life beyond one year live here, not in Expenses. The schedule below projects straight-line depreciation through the useful life of each item.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label="Assets on the books" value={String(assets.length)} />
          <Tile label="Cost basis (total)" value={formatCents(assets.reduce((s, a) => s + a.costCents, 0))} />
          <Tile label={`Depreciation ${currentYear}`} value={formatCents(thisYearDep.totalCents)} hint="Will post at year-end close" />
          <Tile label="Net book value (today)" value={formatCents(netBookToday(assets))} />
        </div>

        {assets.length === 0 ? (
          <div className="rounded-lg border border-border-subtle border-dashed p-12 text-center">
            <p className="text-[14px] font-medium text-text-primary">No capitalized assets yet</p>
            <p className="text-[12px] text-text-secondary mt-1">Add equipment, fixtures, or vehicles that need to depreciate over multiple tax years.</p>
            <button
              onClick={() => setAddOpen(true)}
              className="mt-4 h-8 px-3 rounded bg-accent-brand text-bg-base text-[13px] font-medium hover:opacity-90 transition-opacity duration-[120ms]"
            >
              Add first asset
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {assets.map(a => <AssetCard key={a.id} asset={a} onDelete={() => { removeAsset(a.id); addToast({ title: `Removed ${a.name}`, status: 'info' }); }} />)}
          </div>
        )}
      </div>

      {addOpen && (
        <AddAssetDialog
          onClose={() => setAddOpen(false)}
          onCreate={(input) => {
            const a = addAsset(input);
            setAddOpen(false);
            addToast({ title: `Capitalized ${a.name}`, status: 'ok' });
          }}
        />
      )}
    </>
  );
}

function netBookToday(assets: Asset[]): number {
  const y = new Date().getFullYear();
  let sum = 0;
  for (const a of assets) {
    const s = depreciationSchedule(a);
    const row = s.rows.find(r => r.year === y);
    if (row) sum += row.closingNetBookCents;
    else if (y < s.rows[0].year) sum += a.costCents;
  }
  return sum;
}

function AssetCard({ asset, onDelete }: { asset: Asset; onDelete: () => void }) {
  const schedule = depreciationSchedule(asset);
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-base overflow-hidden">
      <header className="px-4 h-12 flex items-center justify-between border-b border-border-subtle">
        <div>
          <h3 className="text-[14px] font-medium text-text-primary">{asset.name}</h3>
          <p className="text-[11px] text-text-tertiary tabular-nums">
            {asset.id} · acquired {asset.acquiredOn} · {asset.usefulLifeYears}-year SL · cost {formatCents(asset.costCents)} · annual {formatCents(schedule.annualDepreciationCents)}
          </p>
        </div>
        <button
          onClick={onDelete}
          aria-label="Remove asset"
          className="w-7 h-7 rounded flex items-center justify-center text-text-tertiary hover:text-status-alert hover:bg-status-alert/10 transition-colors duration-[120ms]"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </header>
      <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr className="border-b border-border-subtle">
            <th align="left"  className="px-4 h-8 text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Year</th>
            <th align="right" className="px-4 h-8 text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Opening book</th>
            <th align="right" className="px-4 h-8 text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Depreciation</th>
            <th align="right" className="px-4 h-8 text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Accumulated</th>
            <th align="right" className="px-4 h-8 text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Closing book</th>
          </tr>
        </thead>
        <tbody>
          {schedule.rows.map(r => {
            const isCurrent = r.year === new Date().getFullYear();
            return (
              <tr key={r.year} className={cn('border-b border-border-subtle/60 last:border-0', isCurrent && 'bg-accent-brand/[0.04]')}>
                <td className="px-4 h-9 tabular-nums text-text-primary">{r.year}{isCurrent && <span className="ml-2 text-[11px] text-accent-brand uppercase tracking-wider">current</span>}</td>
                <td align="right" className="px-4 h-9 tabular-nums text-text-secondary">{formatCents(r.openingNetBookCents)}</td>
                <td align="right" className="px-4 h-9 tabular-nums text-status-alert">{formatCents(r.depreciationCents)}</td>
                <td align="right" className="px-4 h-9 tabular-nums text-text-secondary">{formatCents(r.accumulatedDepreciationCents)}</td>
                <td align="right" className="px-4 h-9 tabular-nums text-text-primary font-medium">{formatCents(r.closingNetBookCents)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-3 rounded-lg bg-bg-elevated border border-border-subtle">
      <div className="text-[11px] uppercase tracking-wider font-medium text-text-tertiary mb-1">{label}</div>
      <div className="text-[22px] font-semibold tabular-nums text-text-primary">{value}</div>
      {hint && <div className="text-[11px] mt-0.5 text-text-tertiary italic">{hint}</div>}
    </div>
  );
}

function AddAssetDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (input: Omit<Asset, 'id'>) => void }) {
  const [name, setName] = useState('');
  const [acquiredOn, setAcquiredOn] = useState(new Date().toISOString().split('T')[0]);
  const [cost, setCost] = useState('');
  const [life, setLife] = useState('5');
  const [notes, setNotes] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      name: name.trim(),
      acquiredOn,
      costCents: Math.round(parseFloat(cost) * 100),
      usefulLifeYears: Number(life),
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-asset-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-[120ms]"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[520px] rounded-xl bg-bg-elevated border border-border-subtle shadow-2xl overflow-hidden">
        <header className="h-12 px-4 flex items-center justify-between border-b border-border-subtle">
          <h2 id="add-asset-title" className="text-[14px] font-semibold text-text-primary">Capitalize an asset</h2>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]">✕</button>
        </header>
        <form onSubmit={submit} className="p-4 space-y-3">
          <Field label="Name">
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. LED grow lights" className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-brand" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Cost (USD)">
              <input required type="number" min="0.01" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary tabular-nums focus:outline-none focus:border-accent-brand" />
            </Field>
            <Field label="Acquired">
              <input required type="date" value={acquiredOn} onChange={(e) => setAcquiredOn(e.target.value)} className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary focus:outline-none focus:border-accent-brand" />
            </Field>
            <Field label="Useful life">
              <select value={life} onChange={(e) => setLife(e.target.value)} className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary focus:outline-none focus:border-accent-brand">
                <option value="3">3 years</option>
                <option value="5">5 years (equipment, vehicles)</option>
                <option value="7">7 years (furniture, fixtures)</option>
                <option value="15">15 years (land improvements)</option>
                <option value="27.5">27.5 years (residential rental)</option>
                <option value="39">39 years (non-res. real property)</option>
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-brand" />
          </Field>
          <footer className="flex justify-end gap-2 pt-3 border-t border-border-subtle">
            <button type="button" onClick={onClose} className="h-8 px-3 rounded text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]">Cancel</button>
            <button type="submit" className="h-8 px-3 rounded bg-accent-brand text-bg-base text-[13px] font-medium hover:opacity-90 transition-opacity duration-[120ms]">Capitalize</button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-medium text-text-tertiary mb-1">{label}</div>
      {children}
    </div>
  );
}
