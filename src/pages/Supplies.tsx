import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, ShoppingCart, AlertTriangle } from 'lucide-react';
import { Topbar } from '@/components/nav/Topbar';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';

/**
 * Supplies is physical inventory, not finance. It deliberately doesn't read
 * from the journal — supply counts aren't transactions. But "Reorder" posts
 * a placeholder expense via Expenses with the vendor + GL category pre-filled,
 * so the two surfaces stay connected.
 *
 * Future: connect to a real inventory store. Today: in-memory + seed.
 */

type Supply = {
  id: string;
  name: string;
  unit: string;
  /** Current count in `unit`s. */
  stock: number;
  /** Reorder at this level. */
  threshold: number;
  vendor: string;
  /** Pre-fill GL code on reorder. */
  glCode: string;
  lastOrdered: string;
};

const INITIAL: Supply[] = [
  { id: 'lfs',       name: 'Long-fiber Sphagnum', unit: 'bales',  stock: 2,    threshold: 3,   vendor: 'Sphagnum Moss Co.', glCode: '5010', lastOrdered: '2025-03-01' },
  { id: 'perlite',   name: 'Perlite',             unit: 'bags',   stock: 10,   threshold: 2,   vendor: 'Home Depot',        glCode: '5010', lastOrdered: '2025-02-12' },
  { id: 'pumice',    name: 'Pumice',              unit: 'bags',   stock: 5,    threshold: 2,   vendor: 'Local Nursery',     glCode: '5010', lastOrdered: '2025-04-04' },
  { id: 'pots2',     name: '2-inch Nursery Pots', unit: 'pcs',    stock: 450,  threshold: 100, vendor: 'Amazon Business',   glCode: '5020', lastOrdered: '2025-01-20' },
  { id: 'pots3',     name: '3-inch Nursery Pots', unit: 'pcs',    stock: 80,   threshold: 100, vendor: 'Amazon Business',   glCode: '5020', lastOrdered: '2025-01-20' },
  { id: 'tags',      name: 'Plant Tags',          unit: 'pcs',    stock: 1500, threshold: 500, vendor: 'Etsy Print Shop',   glCode: '6090', lastOrdered: '2024-11-02' },
  { id: 'boxes',     name: 'Priority Mail Boxes', unit: 'pcs',    stock: 20,   threshold: 50,  vendor: 'USPS',              glCode: '6170', lastOrdered: '2025-04-22' },
  { id: 'icepacks',  name: 'Ice Packs (Phase 22)',unit: 'pcs',    stock: 120,  threshold: 50,  vendor: 'Amazon Business',   glCode: '5020', lastOrdered: '2024-05-10' },
];

export default function Supplies() {
  const navigate = useNavigate();
  const { addToast } = useApp();
  const [supplies, setSupplies] = useState<Supply[]>(INITIAL);
  const [addOpen, setAddOpen] = useState(false);

  const lowStock = useMemo(() => supplies.filter(s => s.stock <= s.threshold), [supplies]);

  const reorder = (s: Supply) => {
    // In Pass 4, this would create a draft PO and a pending expense. For now,
    // jump to the Expenses page with the form pre-filled via query string.
    addToast({
      title: `Drafting reorder for ${s.name}`,
      description: `Vendor pre-filled: ${s.vendor}`,
      status: 'info',
      action: { label: 'Open Expenses', run: () => navigate(`/finances/expenses?vendor=${encodeURIComponent(s.vendor)}`) },
    });
  };

  return (
    <>
      <Topbar
        actions={
          <>
            {lowStock.length > 0 && (
              <span className="h-7 px-2 inline-flex items-center gap-1.5 rounded-full bg-status-warn/10 border border-status-warn/30 text-status-warn text-[12px]">
                <AlertTriangle className="w-3 h-3" /> {lowStock.length} low
              </span>
            )}
            <button
              onClick={() => setAddOpen(true)}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-accent-brand text-bg-base text-[13px] font-medium hover:opacity-90 transition-opacity duration-[120ms]"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              Add supply
            </button>
          </>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        <p className="text-[12px] text-text-tertiary">
          Physical inventory. Reordering opens the Expenses form with the vendor and GL category pre-filled — the two surfaces stay in sync.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {supplies.map(s => (
            <SupplyCard key={s.id} supply={s} onReorder={() => reorder(s)} />
          ))}
        </div>

        {supplies.length === 0 && (
          <div className="rounded-lg border border-border-subtle border-dashed p-12 text-center">
            <p className="text-[14px] font-medium text-text-primary">No supplies tracked</p>
            <p className="text-[12px] text-text-secondary mt-1">Add the materials you reorder regularly to surface low-stock warnings.</p>
            <button
              onClick={() => setAddOpen(true)}
              className="mt-4 h-8 px-3 rounded bg-accent-brand text-bg-base text-[13px] font-medium hover:opacity-90 transition-opacity duration-[120ms]"
            >
              Add first supply
            </button>
          </div>
        )}
      </div>

      {addOpen && (
        <AddSupplyDialog
          onClose={() => setAddOpen(false)}
          onCreate={(s) => { setSupplies(prev => [...prev, s]); setAddOpen(false); addToast({ title: `Added ${s.name}`, status: 'ok' }); }}
        />
      )}
    </>
  );
}

function SupplyCard({ supply, onReorder }: { supply: Supply; onReorder: () => void }) {
  const low = supply.stock <= supply.threshold;
  const pct = Math.min(100, Math.round((supply.stock / Math.max(supply.threshold * 2, 1)) * 100));
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elevated p-3 hover:border-border-strong transition-colors duration-[120ms]">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-medium text-text-primary truncate">{supply.name}</h3>
          <p className="text-[11px] text-text-tertiary truncate mt-0.5">{supply.vendor}</p>
        </div>
        {low && (
          <span className="text-[11px] uppercase tracking-wider font-medium px-1.5 h-5 inline-flex items-center rounded border border-status-warn/30 bg-status-warn/10 text-status-warn flex-shrink-0">
            Low
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className={cn('text-[22px] font-semibold tabular-nums', low ? 'text-status-warn' : 'text-text-primary')}>
          {supply.stock}
        </span>
        <span className="text-[12px] text-text-tertiary">{supply.unit}</span>
        <span className="text-[11px] text-text-tertiary ml-auto tabular-nums">reorder at {supply.threshold}</span>
      </div>

      <div className="h-1 rounded-full bg-bg-base overflow-hidden">
        <div className={cn('h-full transition-all duration-[200ms]', low ? 'bg-status-warn' : 'bg-status-ok')} style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-text-tertiary tabular-nums">Ordered {supply.lastOrdered}</span>
        {low && (
          <button
            onClick={onReorder}
            className="h-7 px-2 inline-flex items-center gap-1 rounded text-[12px] font-medium text-accent-brand hover:bg-accent-brand/10 transition-colors duration-[120ms]"
          >
            <ShoppingCart className="w-3 h-3" strokeWidth={1.5} />
            Reorder
          </button>
        )}
      </div>
    </div>
  );
}

function AddSupplyDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (s: Supply) => void }) {
  const [name, setName] = useState('');
  const [vendor, setVendor] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [stock, setStock] = useState('');
  const [threshold, setThreshold] = useState('');
  const [glCode, setGlCode] = useState('6120');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name: name.trim(),
      vendor: vendor.trim() || '—',
      unit,
      stock: Number(stock),
      threshold: Number(threshold),
      glCode,
      lastOrdered: new Date().toISOString().split('T')[0],
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-supply-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-[120ms]"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[480px] rounded-xl bg-bg-elevated border border-border-subtle shadow-2xl overflow-hidden">
        <header className="h-12 px-4 flex items-center justify-between border-b border-border-subtle">
          <h2 id="add-supply-title" className="text-[14px] font-semibold text-text-primary">Add supply</h2>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]">✕</button>
        </header>
        <form onSubmit={submit} className="p-4 space-y-3">
          <Field label="Name">
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Long-fiber Sphagnum" className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-brand" />
          </Field>
          <Field label="Default vendor">
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Optional" className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-brand" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="On hand">
              <input required type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary tabular-nums focus:outline-none focus:border-accent-brand" />
            </Field>
            <Field label="Reorder at">
              <input required type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary tabular-nums focus:outline-none focus:border-accent-brand" />
            </Field>
            <Field label="Unit">
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary focus:outline-none focus:border-accent-brand">
                <option>pcs</option><option>bales</option><option>bags</option><option>lbs</option><option>oz</option>
              </select>
            </Field>
          </div>
          <Field label="GL category">
            <select value={glCode} onChange={(e) => setGlCode(e.target.value)} className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary focus:outline-none focus:border-accent-brand">
              <option value="5010">5010 — Growing Media</option>
              <option value="5020">5020 — Packaging Materials</option>
              <option value="6090">6090 — Office Expense</option>
              <option value="6120">6120 — Supplies</option>
              <option value="6170">6170 — Shipping & Postage</option>
            </select>
          </Field>
          <footer className="flex justify-end gap-2 pt-3 border-t border-border-subtle">
            <button type="button" onClick={onClose} className="h-8 px-3 rounded text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]">Cancel</button>
            <button type="submit" className="h-8 px-3 rounded bg-accent-brand text-bg-base text-[13px] font-medium hover:opacity-90 transition-opacity duration-[120ms]">Add</button>
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
