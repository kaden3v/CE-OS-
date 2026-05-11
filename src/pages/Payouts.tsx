import { useEffect, useState } from 'react';
import { ChevronRight, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { Topbar } from '@/components/nav/Topbar';
import { PeriodPicker } from '@/components/finance/PeriodPicker';
import { ConnectBankButton } from '@/components/finance/ConnectBankButton';
import { defaultPeriod } from '@/lib/finance/period';
import { fetchPayouts, fetchBankFeed, type Payout, type BankLine } from '@/lib/api';
import { formatCents, type PeriodSelection } from '@/lib/finance/types';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';

/**
 * Stripe payouts — the third leg of the three-way match (Shopify order →
 * Stripe charge → Stripe payout → bank deposit).
 *
 * Today this page shows each payout's gross amount, the balance transactions
 * that fed into it, and the net deposited. Operator confirms the bank
 * deposit matches the payout amount. Pass 6 would auto-match against the
 * Plaid bank feed.
 */
export default function Payouts() {
  const { settings } = useApp();
  const [period, setPeriod] = useState<PeriodSelection>(() => defaultPeriod(settings.fiscalYearStartMonth));
  const [data, setData] = useState<{ payouts: Payout[]; source: 'stripe' | 'mock' } | null>(null);
  const [bank, setBank] = useState<{ lines: BankLine[]; source: 'plaid' | 'cache' | 'mock' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true); setError(null);
    Promise.all([
      fetchPayouts({ start: period.current.start, end: period.current.end }),
      // Pull a slightly-wider bank window — deposits arrive 1–2 days after the payout's arrival_date.
      fetchBankFeed({ start: period.current.start, end: addDays(period.current.end, 3) }),
    ])
      .then(([payouts, bankFeed]) => { setData(payouts); setBank(bankFeed); })
      .catch((e: any) => setError(e.message ?? 'Could not load payouts'))
      .finally(() => setLoading(false));
  }, [period]);

  // Match every payout to its likely bank line. Mutates a map keyed by payout id.
  const matches = (data?.payouts ?? []).reduce<Record<string, { line: BankLine | null; confidence: number }>>((acc, p) => {
    acc[p.id] = bestBankMatch(p, bank?.lines ?? []);
    return acc;
  }, {});

  const toggle = (id: string) => setExpanded(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const totalGross = (data?.payouts ?? []).reduce((s, p) => s + p.amountCents, 0);
  const totalFees  = (data?.payouts ?? []).flatMap(p => p.lines.filter(l => l.type === 'stripe_fee')).reduce((s, l) => s + Math.abs(l.amountCents), 0);

  return (
    <>
      <Topbar
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} accountingMethod={settings.accountingMethod} fiscalYearStartMonth={settings.fiscalYearStartMonth} />
            <ConnectBankButton />
            {data?.source === 'mock' && (
              <span className="h-7 px-2 inline-flex items-center rounded border border-status-warn/30 bg-status-warn/10 text-status-warn text-[11px]">
                Mock data — Stripe key not configured
              </span>
            )}
            {data?.source === 'stripe' && (
              <span className="h-7 px-2 inline-flex items-center rounded border border-status-ok/30 bg-status-ok/10 text-status-ok text-[11px]">
                Stripe · live
              </span>
            )}
          </>
        }
      />

      <div className="p-4 md:p-6 max-w-5xl space-y-4">
        <div>
          <h1 className="text-[18px] font-semibold text-text-primary">Stripe payouts</h1>
          <p className="text-[12px] text-text-secondary mt-1">
            Each payout is a bank deposit. Expand a row to see the charges that fed into it. Match the payout amount against your bank statement to close the loop on Shopify order → Stripe charge → Stripe payout → bank deposit.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Tile label="Payouts in range" value={String(data?.payouts.length ?? 0)} />
          <Tile label="Total deposited"  value={formatCents(totalGross)} tone="ok" />
          <Tile label="Stripe fees"      value={formatCents(totalFees)} tone="alert" />
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-[13px] text-text-tertiary p-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading payouts…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-status-alert/30 bg-status-alert/[0.06] p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-status-alert flex-shrink-0 mt-0.5" />
            <div className="text-[12px] text-text-secondary">{error}</div>
          </div>
        )}

        {!loading && !error && (data?.payouts.length === 0) && (
          <div className="rounded-lg border border-border-subtle border-dashed p-12 text-center">
            <p className="text-[14px] font-medium text-text-primary">No payouts in this period</p>
            <p className="text-[12px] text-text-secondary mt-1">Stripe payouts arrive once per day for sales on Shopify Payments.</p>
          </div>
        )}

        <div className="space-y-2">
          {(data?.payouts ?? []).map(p => (
            <PayoutCard key={p.id} payout={p} match={matches[p.id]} bankSource={bank?.source} expanded={expanded.has(p.id)} onToggle={() => toggle(p.id)} />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Match scoring (payout → bank deposit) ────────────────────────────────────
function bestBankMatch(payout: Payout, bank: BankLine[]): { line: BankLine | null; confidence: number } {
  const arrival = new Date(payout.arrivalDate * 1000);
  let best: { line: BankLine; score: number } | null = null;
  for (const line of bank) {
    // Exact amount match required as the gating signal.
    if (line.amountCents !== payout.amountCents) continue;
    const days = Math.abs(new Date(line.date).getTime() - arrival.getTime()) / 86_400_000;
    if (days > 5) continue;
    const score = 0.6 + 0.4 * (1 - Math.min(days, 5) / 5); // 1.0 same day, ~0.6 five days off
    if (!best || score > best.score) best = { line, score };
  }
  return { line: best?.line ?? null, confidence: best?.score ?? 0 };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso); d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function PayoutCard({ payout, match, bankSource, expanded, onToggle }: {
  payout: Payout;
  match?: { line: BankLine | null; confidence: number };
  bankSource?: 'plaid' | 'cache' | 'mock';
  expanded: boolean;
  onToggle: () => void;
}) {
  const arrival = new Date(payout.arrivalDate * 1000).toISOString().split('T')[0];
  const charges = payout.lines.filter(l => l.type === 'charge');
  const fees    = payout.lines.filter(l => l.type === 'stripe_fee').reduce((s, l) => s + Math.abs(l.amountCents), 0);
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-base overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 h-12 flex items-center justify-between gap-3 hover:bg-bg-hover transition-colors duration-[120ms] text-left"
        aria-expanded={expanded}
      >
        <ChevronRight className={cn('w-3.5 h-3.5 text-text-tertiary flex-shrink-0 transition-transform duration-[160ms]', expanded && 'rotate-90')} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-text-primary font-medium truncate">
            {payout.description ?? 'Stripe payout'}
            <span className="ml-2 text-[11px] text-text-tertiary">· {payout.id}</span>
          </div>
          <div className="text-[11px] text-text-tertiary tabular-nums">
            {arrival} · {charges.length} {charges.length === 1 ? 'charge' : 'charges'} · {formatCents(fees)} in fees · {payout.status}
          </div>
        </div>
        <BankMatchChip match={match} bankSource={bankSource} />
        <span className="text-[16px] font-semibold tabular-nums text-status-ok flex-shrink-0">{formatCents(payout.amountCents)}</span>
      </button>
      {expanded && (
        <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="border-t border-border-subtle">
              <th align="left"  className="px-4 h-8 text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Type</th>
              <th align="left"  className="px-4 h-8 text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Description</th>
              <th align="right" className="px-4 h-8 text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Gross</th>
              <th align="right" className="px-4 h-8 text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Fee</th>
              <th align="right" className="px-4 h-8 text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Net</th>
            </tr>
          </thead>
          <tbody>
            {payout.lines.map(l => (
              <tr key={l.id} className="border-t border-border-subtle/60">
                <td className="px-4 h-8 text-text-secondary">{l.type}</td>
                <td className="px-4 h-8 text-text-primary truncate max-w-[260px]">{l.description ?? '—'}</td>
                <td align="right" className="px-4 h-8 tabular-nums text-text-secondary">{formatCents(l.amountCents)}</td>
                <td align="right" className="px-4 h-8 tabular-nums text-status-alert">{l.feeCents > 0 ? formatCents(l.feeCents) : '—'}</td>
                <td align="right" className="px-4 h-8 tabular-nums text-text-primary font-medium">{formatCents(l.netCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BankMatchChip({ match, bankSource }: {
  match?: { line: BankLine | null; confidence: number };
  bankSource?: 'plaid' | 'cache' | 'mock';
}) {
  if (!match || !bankSource) return null;
  if (!match.line) {
    return (
      <span className="text-[11px] px-2 h-6 inline-flex items-center rounded border border-status-warn/30 bg-status-warn/[0.06] text-status-warn flex-shrink-0 mr-2">
        No bank match
      </span>
    );
  }
  const tone = match.confidence >= 0.9 ? 'ok' : match.confidence >= 0.7 ? 'info' : 'warn';
  const toneClasses = {
    ok:   'border-status-ok/30   bg-status-ok/[0.06]   text-status-ok',
    info: 'border-status-info/30 bg-status-info/[0.06] text-status-info',
    warn: 'border-status-warn/30 bg-status-warn/[0.06] text-status-warn',
  } as const;
  return (
    <span
      title={`Bank: ${match.line.description} on ${match.line.date}${bankSource === 'mock' ? ' (mock feed)' : ''}`}
      className={cn('text-[11px] px-2 h-6 inline-flex items-center gap-1 rounded border flex-shrink-0 mr-2 tabular-nums', toneClasses[tone])}
    >
      <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
      Bank match · {Math.round(match.confidence * 100)}%
    </span>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'alert' }) {
  const toneClass = tone === 'ok' ? 'text-status-ok' : tone === 'warn' ? 'text-status-warn' : tone === 'alert' ? 'text-status-alert' : 'text-text-primary';
  return (
    <div className="p-3 rounded-lg bg-bg-elevated border border-border-subtle">
      <div className="text-[11px] uppercase tracking-wider font-medium text-text-tertiary mb-1">{label}</div>
      <div className={cn('text-[22px] font-semibold tabular-nums', toneClass)}>{value}</div>
    </div>
  );
}
