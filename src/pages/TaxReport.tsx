import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Download, ChevronRight, Lock, AlertTriangle, FileText, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Topbar } from '@/components/nav/Topbar';
import { PeriodPicker } from '@/components/finance/PeriodPicker';
import { ClosePeriodButton } from '@/components/finance/ClosePeriodButton';
import { resolve, pctChange } from '@/lib/finance/period';
import {
  listRevenue, totalsByAccount, revenueTotalCents, totalCents, monthlyCashFlow, useFinanceStore,
} from '@/lib/finance/store';
import { CHART_OF_ACCOUNTS, accountByCode } from '@/lib/finance/accounts';
import { buildScheduleC, scheduleCCsvRows } from '@/lib/finance/scheduleC';
import { buildQuickBooksIIF } from '@/lib/finance/exports/quickbooks';
import { buildXeroCsv } from '@/lib/finance/exports/xero';
import { buildWaveCsv } from '@/lib/finance/exports/wave';
import { buildFreshBooksCsv } from '@/lib/finance/exports/freshbooks';
import { safeHarbor, annualizeYtd } from '@/lib/finance/tax';
import { formatCents, type PeriodSelection } from '@/lib/finance/types';
import { toCsv, downloadCsv, timestampedFilename } from '@/lib/finance/csv';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';

/**
 * The tax report is a projection of the ledger. Every number is computed,
 * and every line is a drill-down into Expenses (or Orders for revenue).
 * No more hand-typed "$24,560" string literals.
 */
export default function TaxReport() {
  const navigate = useNavigate();
  const { settings, addToast } = useApp();
  // Default to the current calendar year for the tax report.
  const currentYear = new Date().getFullYear();
  const [period, setPeriod] = useState<PeriodSelection>(resolve({ kind: 'year', year: currentYear }));

  const periodArg = { start: period.current.start, end: period.current.end };
  const prevArg   = period.previous ? { start: period.previous.start, end: period.previous.end } : null;

  // ── Reactive totals ────────────────────────────────────────────────────────
  const revenueCents  = useFinanceStore(() => revenueTotalCents({ period: periodArg, method: settings.accountingMethod }));
  const expensesCents = useFinanceStore(() => totalCents({ period: periodArg, method: settings.accountingMethod }));
  const netCents      = revenueCents - expensesCents;

  const prevRevenue  = useFinanceStore(() => prevArg ? revenueTotalCents({ period: prevArg, method: settings.accountingMethod }) : null);
  const prevExpenses = useFinanceStore(() => prevArg ? totalCents({ period: prevArg, method: settings.accountingMethod }) : null);
  const prevNet      = prevRevenue != null && prevExpenses != null ? prevRevenue - prevExpenses : null;

  const revenueBreakdown = useFinanceStore(() => {
    const map = new Map<string, number>();
    for (const r of listRevenue({ period: periodArg, method: settings.accountingMethod })) {
      map.set(r.account, (map.get(r.account) ?? 0) + r.amountCents);
    }
    return Array.from(map.entries())
      .map(([code, cents]) => ({ code, name: accountByCode(code)?.name ?? code, cents }))
      .sort((a, b) => b.cents - a.cents);
  });

  const expenseTotals = useFinanceStore(() => totalsByAccount({ period: periodArg, method: settings.accountingMethod }));

  // Group expense rows by Schedule C line for the deductions panel.
  const expenseBySchedC = useMemo(() => {
    const groups = new Map<string, Array<{ code: string; name: string; cents: number }>>();
    for (const t of expenseTotals.values()) {
      const sc = t.scheduleC ?? '—';
      if (!groups.has(sc)) groups.set(sc, []);
      groups.get(sc)!.push(t);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([scheduleC, items]) => ({
        scheduleC,
        items: items.sort((a, b) => b.cents - a.cents),
        subtotal: items.reduce((s, i) => s + i.cents, 0),
      }));
  }, [expenseTotals]);

  const chartData = useFinanceStore(() =>
    monthlyCashFlow({ period: periodArg, method: settings.accountingMethod }).map(m => ({
      month: m.month.slice(5) + '/' + m.month.slice(2, 4),
      income: m.income / 100,
      expense: m.expense / 100,
    })),
  );

  // ── Drill-down ─────────────────────────────────────────────────────────────
  const drillRevenue = (code: string) => {
    addToast({ title: `Revenue drill-down (${code}) → Orders by channel will live here`, status: 'info' });
    // Pass 4: navigate to Orders with channel filter
  };

  const drillExpense = (code: string) => {
    navigate(`/finances/expenses?account=${code}`);
  };

  // ── Quarterly estimated tax (federal SE + income, safe-harbor) ────────────
  const safeHarborResult = useMemo(() => safeHarbor({
    projectedNetProfitCents: annualizeYtd(netCents),
    priorYearTaxCents:        settings.priorYearTaxCents,
    priorYearAgiCents:        settings.priorYearAgiCents,
  }), [netCents, settings.priorYearTaxCents, settings.priorYearAgiCents]);
  const estimatedTaxCents = safeHarborResult.quarterlyPaymentCents;

  // ── CSV export ─────────────────────────────────────────────────────────────
  const onExportCsv = () => {
    const rows: Array<{ section: string; code: string; name: string; cents: number; scheduleC?: string }> = [];
    for (const r of revenueBreakdown) rows.push({ section: 'Revenue', code: r.code, name: r.name, cents: r.cents });
    for (const t of expenseTotals.values())   rows.push({ section: 'Expense', code: t.code, name: t.name, cents: t.cents, scheduleC: t.scheduleC });

    const csv = toCsv(rows, [
      { header: 'Section',     value: r => r.section },
      { header: 'GL Code',     value: r => r.code },
      { header: 'Account',     value: r => r.name },
      { header: 'Amount',      value: r => (r.cents / 100).toFixed(2) },
      { header: 'Schedule C',  value: r => r.scheduleC ?? '' },
    ]);
    downloadCsv(csv, timestampedFilename(`tax-report-${period.current.label.replace(/\s+/g, '-').toLowerCase()}`));
    addToast({ title: 'Tax report exported', status: 'ok' });
  };

  // Schedule C draft (every line + contributing GL accounts).
  const onExportScheduleC = () => {
    const sc = buildScheduleC({ period: periodArg, method: settings.accountingMethod });
    const csv = toCsv(scheduleCCsvRows(sc), [
      { header: 'Line',   value: r => r.line },
      { header: 'Label',  value: r => r.label },
      { header: 'Amount', value: r => r.amount },
      { header: 'Detail', value: r => r.detail },
    ]);
    downloadCsv(csv, `schedule-c-draft-${period.current.label.replace(/\s+/g, '-').toLowerCase()}.csv`);
    addToast({
      title: 'Schedule C draft exported',
      description: 'Always have a CPA review before filing.',
      status: 'ok',
    });
  };

  const onExportQuickBooks = () => {
    const iif = buildQuickBooksIIF({ period: periodArg, method: settings.accountingMethod });
    const blob = new Blob([iif], { type: 'application/x-qbo' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `canyon-exotics-${period.current.label.replace(/\s+/g, '-').toLowerCase()}.iif`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    addToast({ title: 'QuickBooks IIF exported', status: 'ok' });
  };
  const onExportXero = () => {
    const csv = buildXeroCsv({ period: periodArg, method: settings.accountingMethod });
    downloadCsv(csv, `canyon-exotics-xero-${period.current.label.replace(/\s+/g, '-').toLowerCase()}.csv`);
    addToast({ title: 'Xero manual journals exported', status: 'ok' });
  };
  const onExportWave = () => {
    const csv = buildWaveCsv({ period: periodArg, method: settings.accountingMethod });
    downloadCsv(csv, `canyon-exotics-wave-${period.current.label.replace(/\s+/g, '-').toLowerCase()}.csv`);
    addToast({ title: 'Wave transactions exported', status: 'ok' });
  };
  const onExportFreshBooks = () => {
    const csv = buildFreshBooksCsv({ period: periodArg, method: settings.accountingMethod });
    downloadCsv(csv, `canyon-exotics-freshbooks-${period.current.label.replace(/\s+/g, '-').toLowerCase()}.csv`);
    addToast({ title: 'FreshBooks expenses exported', status: 'ok' });
  };

  // Schedule C PDF — opens a print-ready view in a new tab.
  const onPrintScheduleC = () => {
    if (!snapshotYear) {
      addToast({ title: 'Pick a full year', description: 'Schedule C is a yearly form. Select a year in the period picker.', status: 'warn' });
      return;
    }
    window.open(`/finances/tax-report/schedule-c-print/${snapshotYear}?print=1`, '_blank');
  };

  // ── Year-end snapshot link ─────────────────────────────────────────────────
  const isFullYear = period.current.label === String(currentYear) || /^\d{4}$/.test(period.current.label);
  const snapshotYear = isFullYear ? Number(period.current.label) : null;

  return (
    <>
      <Topbar
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} accountingMethod={settings.accountingMethod} fiscalYearStartMonth={settings.fiscalYearStartMonth} />
            <ClosePeriodButton period={period} />
            {snapshotYear && (
              <button
                onClick={() => navigate(`/finances/tax-report/year-end/${snapshotYear}`)}
                className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border-subtle text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
              >
                <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
                Year-end snapshot
              </button>
            )}
            <button
              onClick={() => navigate('/finances/tax-report/1099k')}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border-subtle text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
            >
              1099-K
            </button>
            <ExportMenu
              items={[
                { label: 'Schedule C — PDF',            onClick: onPrintScheduleC, hint: snapshotYear ? undefined : 'pick a full year' },
                { label: 'Schedule C — CSV',            onClick: onExportScheduleC },
                { label: 'Full tax report — CSV',       onClick: onExportCsv },
                { label: 'QuickBooks Desktop — IIF',    onClick: onExportQuickBooks },
                { label: 'Xero — Manual Journals CSV',  onClick: onExportXero },
                { label: 'Wave — Transactions CSV',     onClick: onExportWave },
                { label: 'FreshBooks — Expenses CSV',   onClick: onExportFreshBooks },
              ]}
            />
          </>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        {/* Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Gross income" value={formatCents(revenueCents)} delta={prevRevenue != null ? pctChange(revenueCents, prevRevenue) : null} deltaLabel={period.previous?.label} positiveIsGood />
          <Tile label="Deductible expenses" value={formatCents(expensesCents)} delta={prevExpenses != null ? pctChange(expensesCents, prevExpenses) : null} deltaLabel={period.previous?.label} positiveIsGood={false} />
          <Tile label="Net profit" value={formatCents(netCents)} delta={prevNet != null ? pctChange(netCents, prevNet) : null} deltaLabel={period.previous?.label} tone={netCents >= 0 ? 'ok' : 'alert'} positiveIsGood />
          <Tile label="Quarterly est. tax" value={formatCents(estimatedTaxCents)} tone="warn" hint={
            settings.priorYearTaxCents === 0
              ? 'Enter last year\'s tax in Settings for safe-harbor calc'
              : `${safeHarborResult.basis === 'prior-year' ? 'Safe harbor: prior year' : 'Safe harbor: current year 90%'}`
          } />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Income breakdown */}
          <div className="lg:col-span-2 rounded-lg border border-border-subtle bg-bg-base">
            <header className="h-10 px-4 flex items-center justify-between border-b border-border-subtle">
              <h2 className="text-[13px] font-semibold text-text-primary">Income</h2>
              <span className="text-[11px] text-text-tertiary tabular-nums">{revenueBreakdown.length} {revenueBreakdown.length === 1 ? 'account' : 'accounts'}</span>
            </header>
            {revenueBreakdown.length === 0 ? (
              <p className="px-4 py-6 text-[12px] text-text-tertiary text-center">No revenue posted in this period.</p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {revenueBreakdown.map(r => (
                  <LineRow key={r.code} code={r.code} name={r.name} cents={r.cents} onClick={() => drillRevenue(r.code)} positive />
                ))}
                <li className="h-10 px-4 flex items-center justify-between bg-bg-elevated/40">
                  <span className="text-[13px] font-medium text-text-primary">Total revenue</span>
                  <span className="tabular-nums font-semibold text-status-ok">{formatCents(revenueCents)}</span>
                </li>
              </ul>
            )}
          </div>

          {/* Deductions grouped by Schedule C */}
          <div className="lg:col-span-3 rounded-lg border border-border-subtle bg-bg-base">
            <header className="h-10 px-4 flex items-center justify-between border-b border-border-subtle">
              <h2 className="text-[13px] font-semibold text-text-primary">Deductible expenses — by Schedule C line</h2>
              <span className="text-[11px] text-text-tertiary tabular-nums">{expenseTotals.size} {expenseTotals.size === 1 ? 'account' : 'accounts'}</span>
            </header>
            {expenseBySchedC.length === 0 ? (
              <p className="px-4 py-6 text-[12px] text-text-tertiary text-center">No expenses in this period.</p>
            ) : (
              <ul>
                {expenseBySchedC.map(group => (
                  <li key={group.scheduleC} className="border-b border-border-subtle last:border-0">
                    <div className="px-4 h-8 flex items-center justify-between bg-bg-elevated/40 border-b border-border-subtle">
                      <span className="text-[11px] uppercase tracking-wider font-medium text-text-tertiary">
                        {group.scheduleC === '—' ? 'Uncategorized' : `Schedule C — Line ${group.scheduleC}`}
                      </span>
                      <span className="tabular-nums text-[12px] text-text-secondary">{formatCents(group.subtotal)}</span>
                    </div>
                    <ul className="divide-y divide-border-subtle/60">
                      {group.items.map(t => (
                        <LineRow key={t.code} code={t.code} name={t.name} cents={t.cents} onClick={() => drillExpense(t.code)} />
                      ))}
                    </ul>
                  </li>
                ))}
                <li className="h-10 px-4 flex items-center justify-between bg-bg-elevated/40">
                  <span className="text-[13px] font-medium text-text-primary">Total deductions</span>
                  <span className="tabular-nums font-semibold text-status-alert">{formatCents(expensesCents)}</span>
                </li>
              </ul>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-lg border border-border-subtle bg-bg-base">
          <header className="h-10 px-4 flex items-center justify-between border-b border-border-subtle">
            <h2 className="text-[13px] font-semibold text-text-primary">Monthly cash flow</h2>
            <span className="text-[11px] text-text-tertiary">{period.current.label}</span>
          </header>
          <div className="p-3 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={60} />
                <Tooltip
                  cursor={{ fill: 'var(--color-bg-active)' }}
                  contentStyle={{ backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-subtle)', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(v: number) => `$${v.toFixed(2)}`}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Bar dataKey="income"  name="Income"   fill="var(--color-status-ok)"    radius={[2, 2, 0, 0]} maxBarSize={40} />
                <Bar dataKey="expense" name="Expenses" fill="var(--color-status-alert)" radius={[2, 2, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Caveat banner */}
        <div className="rounded-lg border border-status-warn/30 bg-status-warn/[0.06] p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-status-warn flex-shrink-0 mt-0.5" strokeWidth={1.5} />
          <div className="text-[12px] text-text-secondary leading-[1.6]">
            <strong className="text-text-primary">Draft only.</strong> Numbers come from the in-memory ledger and are not CPA-reviewed.{' '}
            {safeHarborResult.notes}
            {' '}Use this as a planning view, not a filing document.
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function Tile({ label, value, delta, deltaLabel, tone, hint, positiveIsGood }: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  tone?: 'ok' | 'warn' | 'alert';
  hint?: string;
  positiveIsGood?: boolean;
}) {
  const toneClass = tone === 'ok' ? 'text-status-ok' : tone === 'warn' ? 'text-status-warn' : tone === 'alert' ? 'text-status-alert' : 'text-text-primary';
  const deltaTone = delta == null ? 'text-text-tertiary'
    : positiveIsGood
      ? (delta > 0 ? 'text-status-ok' : 'text-status-alert')
      : (delta > 0 ? 'text-status-alert' : 'text-status-ok');
  return (
    <div className="p-3 rounded-lg bg-bg-elevated border border-border-subtle">
      <div className="text-[11px] uppercase tracking-wider font-medium text-text-tertiary mb-1">{label}</div>
      <div className={cn('text-[22px] font-semibold tabular-nums', toneClass)}>{value}</div>
      {delta != null && deltaLabel && (
        <div className={cn('text-[11px] mt-0.5 tabular-nums', deltaTone)}>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)}% vs {deltaLabel}
        </div>
      )}
      {hint && <div className="text-[11px] mt-0.5 text-text-tertiary italic">{hint}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function ExportMenu({ items }: { items: Array<{ label: string; onClick: () => void; hint?: string }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border-subtle text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
      >
        <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
        Export
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 mt-1 z-30 min-w-[240px] bg-bg-elevated border border-border-subtle rounded-md shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-[120ms]">
          {items.map(it => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => { setOpen(false); it.onClick(); }}
              className="w-full px-3 h-8 flex items-center justify-between text-[13px] text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
            >
              <span>{it.label}</span>
              {it.hint && <span className="text-[11px] text-text-tertiary ml-3">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LineRow({ code, name, cents, onClick, positive }: {
  code: string;
  name: string;
  cents: number;
  onClick: () => void;
  positive?: boolean;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          'w-full h-9 px-4 flex items-center justify-between gap-2 hover:bg-bg-hover transition-colors duration-[120ms] group/r',
          'text-left',
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] text-text-tertiary flex-shrink-0">{code}</span>
          <span className="text-[13px] text-text-primary truncate">{name}</span>
        </span>
        <span className="flex items-center gap-1.5 flex-shrink-0">
          <span className={cn('tabular-nums text-[13px]', positive ? 'text-status-ok' : 'text-text-primary')}>
            {formatCents(cents)}
          </span>
          <ChevronRight className="w-3 h-3 text-text-tertiary opacity-0 group-hover/r:opacity-100 transition-opacity duration-[120ms]" />
        </span>
      </button>
    </li>
  );
}
