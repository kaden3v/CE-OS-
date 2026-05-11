import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Download, AlertTriangle, CheckCircle2, RefreshCcw, Loader2 } from 'lucide-react';
import { Topbar } from '@/components/nav/Topbar';
import { PeriodPicker } from '@/components/finance/PeriodPicker';
import { resolve } from '@/lib/finance/period';
import { listRevenue, useFinanceStore } from '@/lib/finance/store';
import { formatCents, type PeriodSelection } from '@/lib/finance/types';
import { toCsv, downloadCsv, timestampedFilename } from '@/lib/finance/csv';
import { fetchProcessorGross } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';

/**
 * 1099-K reconciliation worksheet.
 *
 * Payment processors (Etsy, Shopify Payments / Stripe) issue a 1099-K showing
 * **gross** payment volume. Your ledger revenue is **net of refunds and fees**.
 * The delta is real and needs explanation — a CPA will ask for this worksheet
 * at year-end.
 *
 * Pass 4 will pull the reported numbers from a Shopify/Etsy API or a CSV
 * upload. For now they're operator-entered.
 */

type ReportedTotal = { channel: 'Shopify' | 'Etsy'; reportedCents: number };

export default function Form1099K() {
  const navigate = useNavigate();
  const { settings, addToast } = useApp();
  const currentYear = new Date().getFullYear();
  const [period, setPeriod] = useState<PeriodSelection>(resolve({ kind: 'year', year: currentYear }));

  // Editable "as reported" totals. Localized state; in Pass 4 these come from
  // a sync against Shopify Payments and Etsy.
  const [reported, setReported] = useState<ReportedTotal[]>([
    { channel: 'Shopify', reportedCents: 0 },
    { channel: 'Etsy',    reportedCents: 0 },
  ]);
  const updateReported = (channel: ReportedTotal['channel'], dollars: string) => {
    const cents = Math.max(0, Math.round(parseFloat(dollars || '0') * 100));
    setReported(prev => prev.map(r => r.channel === channel ? { ...r, reportedCents: cents } : r));
  };

  const [syncing, setSyncing] = useState<null | ReportedTotal['channel']>(null);
  const onSync = async (channel: ReportedTotal['channel']) => {
    setSyncing(channel);
    try {
      const { grossCents, source, note } = await fetchProcessorGross({
        channel,
        start: period.current.start,
        end: period.current.end,
      });
      if (source === 'unavailable') {
        addToast({ title: `${channel} sync unavailable`, description: note, status: 'warn' });
      } else {
        setReported(prev => prev.map(r => r.channel === channel ? { ...r, reportedCents: grossCents } : r));
        addToast({ title: `${channel}: synced gross from ${source}`, status: 'ok' });
      }
    } catch (e: any) {
      addToast({ title: `${channel} sync failed`, description: e.message, status: 'alert' });
    } finally {
      setSyncing(null);
    }
  };

  // Ledger revenue per channel for the same period.
  const periodArg = { start: period.current.start, end: period.current.end };
  const channelLedger = useFinanceStore(() => {
    const out: Record<'Shopify' | 'Etsy', number> = { Shopify: 0, Etsy: 0 };
    for (const r of listRevenue({ period: periodArg, method: settings.accountingMethod })) {
      if (r.channel === 'Shopify' || r.channel === 'Etsy') out[r.channel] += r.amountCents;
    }
    return out;
  });

  const rows = reported.map(r => {
    const ledger = channelLedger[r.channel];
    const delta = r.reportedCents - ledger;
    return { ...r, ledgerCents: ledger, deltaCents: delta };
  });

  const totalReported = rows.reduce((s, r) => s + r.reportedCents, 0);
  const totalLedger   = rows.reduce((s, r) => s + r.ledgerCents,   0);
  const totalDelta    = totalReported - totalLedger;

  const onExportCsv = () => {
    const csv = toCsv(rows, [
      { header: 'Channel',      value: r => r.channel },
      { header: 'Reported 1099-K', value: r => (r.reportedCents / 100).toFixed(2) },
      { header: 'Ledger revenue',  value: r => (r.ledgerCents / 100).toFixed(2) },
      { header: 'Delta',           value: r => (r.deltaCents / 100).toFixed(2) },
    ]);
    downloadCsv(csv, timestampedFilename(`1099k-reconciliation-${period.current.label.replace(/\s+/g, '-').toLowerCase()}`));
    addToast({ title: '1099-K worksheet exported', status: 'ok' });
  };

  return (
    <>
      <Topbar
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} accountingMethod={settings.accountingMethod} fiscalYearStartMonth={settings.fiscalYearStartMonth} />
            <button
              onClick={onExportCsv}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border-subtle text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
              Export CSV
            </button>
          </>
        }
      />

      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/finances/tax-report')}
            className="w-8 h-8 inline-flex items-center justify-center rounded border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
            aria-label="Back to tax report"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <div>
            <h1 className="text-[18px] font-semibold text-text-primary">1099-K reconciliation</h1>
            <p className="text-[12px] text-text-secondary">{period.current.label} · {settings.accountingMethod}</p>
          </div>
        </div>

        <div className="rounded-lg border border-status-info/30 bg-status-info/[0.06] p-3 text-[12px] text-text-secondary leading-[1.6]">
          <strong className="text-text-primary">Why this exists.</strong>{' '}
          Payment processors report <em>gross</em> volume on Form 1099-K — every dollar that entered your account before refunds, chargebacks, or platform fees. Your ledger shows the <em>net</em> revenue actually earned. The delta is real and a CPA will ask for it. Enter the reported totals below; ledger revenue is computed.
        </div>

        <div className="rounded-lg border border-border-subtle bg-bg-base overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="h-9 px-4 text-left text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Channel</th>
                <th className="h-9 px-4 text-right text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Reported (1099-K)</th>
                <th className="h-9 px-4 text-right text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Ledger revenue</th>
                <th className="h-9 px-4 text-right text-[11px] uppercase tracking-wider font-medium text-text-tertiary">Delta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const direction = r.deltaCents === 0 ? 'match' : r.deltaCents > 0 ? 'reported-higher' : 'ledger-higher';
                return (
                  <tr key={r.channel} className="border-b border-border-subtle last:border-0">
                    <td className="h-12 px-4 text-text-primary font-medium">{r.channel}</td>
                    <td className="h-12 px-4 text-right">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => onSync(r.channel)}
                          disabled={syncing === r.channel}
                          aria-label={`Auto-sync ${r.channel}`}
                          className="w-7 h-7 rounded flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover disabled:opacity-50 transition-colors duration-[120ms]"
                          title={r.channel === 'Etsy' ? 'Etsy OAuth pending — enter manually for now' : `Sync ${r.channel} gross from API`}
                        >
                          {syncing === r.channel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                        </button>
                        <span className="text-text-tertiary">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={(r.reportedCents / 100).toFixed(2)}
                          onChange={(e) => updateReported(r.channel, e.target.value)}
                          className="w-28 h-8 px-2 rounded bg-bg-elevated border border-border-subtle text-[13px] text-text-primary tabular-nums text-right focus:outline-none focus:border-accent-brand transition-colors duration-[120ms]"
                          aria-label={`${r.channel} reported amount`}
                        />
                      </div>
                    </td>
                    <td className="h-12 px-4 text-right tabular-nums text-text-secondary">{formatCents(r.ledgerCents)}</td>
                    <td className="h-12 px-4 text-right">
                      <DeltaBadge direction={direction} cents={r.deltaCents} />
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-bg-elevated/40">
                <td className="h-10 px-4 font-medium text-text-primary">Total</td>
                <td className="h-10 px-4 text-right tabular-nums font-semibold text-text-primary">{formatCents(totalReported)}</td>
                <td className="h-10 px-4 text-right tabular-nums font-semibold text-text-primary">{formatCents(totalLedger)}</td>
                <td className="h-10 px-4 text-right">
                  <DeltaBadge direction={totalDelta === 0 ? 'match' : totalDelta > 0 ? 'reported-higher' : 'ledger-higher'} cents={totalDelta} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border-subtle bg-bg-base p-4 space-y-3">
          <h2 className="text-[13px] font-semibold text-text-primary">Common explanations for a positive delta</h2>
          <ul className="space-y-2 text-[12px] text-text-secondary leading-[1.6]">
            <li className="flex gap-2"><span className="text-text-tertiary">·</span> Platform fees deducted from the 1099-K but expensed separately in the ledger (look at 6030 Commissions & Fees).</li>
            <li className="flex gap-2"><span className="text-text-tertiary">·</span> Refunds processed in the calendar year — the gross 1099-K never subtracts them.</li>
            <li className="flex gap-2"><span className="text-text-tertiary">·</span> Sales tax collected and remitted — passes through your account but isn't revenue.</li>
            <li className="flex gap-2"><span className="text-text-tertiary">·</span> Timing differences if you use accrual: a December sale paid in January shifts the year.</li>
          </ul>
        </div>
      </div>
    </>
  );
}

function DeltaBadge({ direction, cents }: { direction: 'match' | 'reported-higher' | 'ledger-higher'; cents: number }) {
  if (direction === 'match' || cents === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-status-ok">
        <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        Match
      </span>
    );
  }
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[12px] tabular-nums',
      direction === 'reported-higher' ? 'text-status-warn' : 'text-status-info',
    )}>
      <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
      {cents > 0 ? '+' : ''}{formatCents(cents)}
    </span>
  );
}
