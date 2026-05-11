import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Download, FileText, Lock, CheckCircle2 } from 'lucide-react';
import { Topbar } from '@/components/nav/Topbar';
import { resolve } from '@/lib/finance/period';
import {
  listRevenue, totalsByAccount, revenueTotalCents, totalCents, useFinanceStore,
} from '@/lib/finance/store';
import { accountByCode } from '@/lib/finance/accounts';
import { formatCents } from '@/lib/finance/types';
import { toCsv, downloadCsv } from '@/lib/finance/csv';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';

/**
 * Read-only snapshot of a closed fiscal year. Pulls from the same store as
 * TaxReport but with the period locked to the URL-param year. In Pass 3 this
 * page becomes the literal "closed period" view — entries are locked, the
 * UI displays a 🔒 chip, and CPA review status is editable above the data.
 */
export default function YearEndSnapshot() {
  const params = useParams<{ year?: string }>();
  const navigate = useNavigate();
  const { settings, addToast } = useApp();

  const year = Number(params.year) || new Date().getFullYear() - 1;
  const period = useMemo(() => resolve({ kind: 'year', year }), [year]);
  const periodArg = { start: period.current.start, end: period.current.end };
  const prevArg   = period.previous ? { start: period.previous.start, end: period.previous.end } : null;

  const revenueCents  = useFinanceStore(() => revenueTotalCents({ period: periodArg, method: settings.accountingMethod }));
  const expensesCents = useFinanceStore(() => totalCents({ period: periodArg, method: settings.accountingMethod }));
  const netCents      = revenueCents - expensesCents;
  const margin        = revenueCents > 0 ? (netCents / revenueCents) * 100 : 0;

  const prevRevenue   = useFinanceStore(() => prevArg ? revenueTotalCents({ period: prevArg, method: settings.accountingMethod }) : null);
  const prevExpenses  = useFinanceStore(() => prevArg ? totalCents({ period: prevArg, method: settings.accountingMethod }) : null);

  // Expense breakdown for the bar/legend
  const breakdown = useFinanceStore(() => {
    const totals = totalsByAccount({ period: periodArg, method: settings.accountingMethod });
    return Array.from(totals.values()).sort((a, b) => b.cents - a.cents).slice(0, 6);
  });

  const onDownloadPdf = () => addToast({
    title: `PDF for ${year}`,
    description: 'PDF generation lands in Pass 4 alongside the Schedule C export.',
    status: 'info',
  });

  const onExportCsv = () => {
    const txs = [
      ...listRevenue({ period: periodArg, method: settings.accountingMethod }),
    ];
    const csv = toCsv(txs, [
      { header: 'Date',      value: t => t.date },
      { header: 'Account',   value: t => t.account },
      { header: 'Name',      value: t => t.accountName },
      { header: 'Memo',      value: t => t.memo },
      { header: 'Amount',    value: t => (t.amountCents / 100).toFixed(2) },
      { header: 'Channel',   value: t => t.channel ?? '' },
    ]);
    downloadCsv(csv, `year-end-${year}-revenue.csv`);
    addToast({ title: `${year} revenue exported`, status: 'ok' });
  };

  // YoY change copy
  const yoyRevenue  = prevRevenue  != null && prevRevenue  > 0 ? ((revenueCents  - prevRevenue)  / prevRevenue)  * 100 : null;
  const yoyExpenses = prevExpenses != null && prevExpenses > 0 ? ((expensesCents - prevExpenses) / prevExpenses) * 100 : null;

  return (
    <>
      <Topbar
        actions={
          <>
            <span className="h-7 px-2 inline-flex items-center gap-1.5 rounded bg-bg-elevated border border-border-subtle text-[11px] text-text-tertiary">
              <Lock className="w-3 h-3" /> Locked
            </span>
            <button
              onClick={onDownloadPdf}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border-subtle text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
              PDF
            </button>
            <button
              onClick={onExportCsv}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-accent-brand text-bg-base text-[13px] font-medium hover:opacity-90 transition-opacity duration-[120ms]"
            >
              <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
              Export CSV
            </button>
          </>
        }
      />

      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        {/* Year switcher */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/finances/tax-report')}
            className="w-8 h-8 inline-flex items-center justify-center rounded border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
            aria-label="Back to tax report"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <div>
            <h1 className="text-[18px] font-semibold text-text-primary">{year} Year-End Snapshot</h1>
            <p className="text-[12px] text-text-secondary">Read-only — historical preservation of tax-year data.</p>
          </div>
          <div className="ml-auto flex items-center gap-1 text-[12px] text-text-tertiary">
            <YearSelector year={year} onChange={(y) => navigate(`/finances/tax-report/year-end/${y}`)} />
          </div>
        </div>

        {/* Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label="Fiscal year" value={String(year)} hint={`Jan 1 – Dec 31, ${year}`} />
          <Tile label="Total revenue" value={formatCents(revenueCents)} delta={yoyRevenue} tone={revenueCents > 0 ? 'ok' : undefined} />
          <Tile label="Total expenses" value={formatCents(expensesCents)} delta={yoyExpenses} positiveIsBad />
          <Tile label="Net profit" value={formatCents(netCents)} hint={`${margin.toFixed(1)}% margin`} tone={netCents >= 0 ? 'ok' : 'alert'} highlight />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Category breakdown */}
          <div className="rounded-lg border border-border-subtle bg-bg-base">
            <header className="h-10 px-4 flex items-center justify-between border-b border-border-subtle">
              <h2 className="text-[13px] font-semibold text-text-primary">Top expense categories</h2>
              <span className="text-[11px] text-text-tertiary">{breakdown.length} accounts</span>
            </header>
            {breakdown.length === 0 ? (
              <p className="px-4 py-6 text-[12px] text-text-tertiary text-center">No expenses in {year}.</p>
            ) : (
              <div className="p-4 space-y-3">
                {breakdown.map((b, i) => {
                  const pct = expensesCents > 0 ? (b.cents / expensesCents) * 100 : 0;
                  return (
                    <div key={b.code}>
                      <div className="flex items-baseline justify-between text-[12px] mb-1">
                        <span className="text-text-primary font-medium truncate flex items-center gap-2">
                          <span className="font-mono text-[11px] text-text-tertiary">{b.code}</span>
                          {b.name}
                        </span>
                        <span className="tabular-nums text-text-secondary flex-shrink-0">{formatCents(b.cents)}</span>
                      </div>
                      <div className="h-1 rounded-full bg-bg-elevated overflow-hidden">
                        <div className="h-full bg-accent-brand transition-all duration-[200ms]"
                             style={{ width: `${pct}%`, opacity: 1 - (i * 0.12) }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes & adjustments — placeholder for Pass 3 (editable, audit-logged) */}
          <div className="rounded-lg border border-border-subtle bg-bg-base">
            <header className="h-10 px-4 flex items-center justify-between border-b border-border-subtle">
              <h2 className="text-[13px] font-semibold text-text-primary">Notes & adjustments</h2>
            </header>
            <div className="p-3 space-y-2">
              <Note kind="info" title="Inventory valuation method"
                body="FIFO used through this year. Pass 3 will store the method on the locked period and validate any new adjustments against it." />
              <Note kind="info" title="1099-K reconciliation"
                body="Etsy and Shopify gross totals will be reconciled against the ledger in the 1099-K worksheet (Pass 4)." />
              <Note kind="ok" title="CPA reviewed"
                body="In a production system, this card would show the CPA reviewer + filing date once the period is signed off." />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border-subtle bg-bg-elevated p-3 text-[12px] text-text-tertiary">
          <strong className="text-text-secondary">About this snapshot.</strong>{' '}
          Pass 3 closes the period (no new entries allowed) and stamps the closing balances. Pass 4 generates a CPA-signable PDF.
          Today this is a read-only projection of the live ledger filtered to {year}.
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function YearSelector({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);
  return (
    <select
      value={year}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-7 px-2 rounded bg-bg-elevated border border-border-subtle text-[12px] text-text-primary focus:outline-none focus:border-accent-brand"
      aria-label="Snapshot year"
    >
      {years.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  );
}

function Tile({ label, value, delta, hint, tone, highlight, positiveIsBad }: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  tone?: 'ok' | 'warn' | 'alert';
  highlight?: boolean;
  positiveIsBad?: boolean;
}) {
  const toneClass = tone === 'ok' ? 'text-status-ok' : tone === 'warn' ? 'text-status-warn' : tone === 'alert' ? 'text-status-alert' : 'text-text-primary';
  const deltaTone = delta == null ? 'text-text-tertiary'
    : positiveIsBad ? (delta > 0 ? 'text-status-alert' : 'text-status-ok')
    : (delta > 0 ? 'text-status-ok' : 'text-status-alert');
  return (
    <div className={cn(
      'p-3 rounded-lg border',
      highlight ? 'bg-accent-brand/[0.06] border-accent-brand/30' : 'bg-bg-elevated border-border-subtle',
    )}>
      <div className="text-[11px] uppercase tracking-wider font-medium text-text-tertiary mb-1">{label}</div>
      <div className={cn('text-[22px] font-semibold tabular-nums', toneClass)}>{value}</div>
      {delta != null && (
        <div className={cn('text-[11px] mt-0.5 tabular-nums', deltaTone)}>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)}% YoY
        </div>
      )}
      {hint && <div className="text-[11px] mt-0.5 text-text-tertiary">{hint}</div>}
    </div>
  );
}

function Note({ kind, title, body }: { kind: 'ok' | 'info' | 'warn'; title: string; body: string }) {
  const cls = {
    ok:   { border: 'border-status-ok/30',   bg: 'bg-status-ok/[0.04]',   icon: 'text-status-ok', title: 'text-status-ok' },
    info: { border: 'border-border-subtle',  bg: 'bg-bg-elevated/40',     icon: 'text-text-tertiary', title: 'text-text-primary' },
    warn: { border: 'border-status-warn/30', bg: 'bg-status-warn/[0.04]', icon: 'text-status-warn', title: 'text-status-warn' },
  }[kind];
  return (
    <div className={cn('p-3 rounded border', cls.border, cls.bg)}>
      <div className={cn('text-[12px] font-medium mb-1 flex items-center gap-1.5', cls.title)}>
        {kind === 'ok' && <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
        {title}
      </div>
      <p className="text-[12px] text-text-secondary leading-[1.6]">{body}</p>
    </div>
  );
}
