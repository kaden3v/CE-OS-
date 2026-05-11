import { useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { resolve } from '@/lib/finance/period';
import { buildScheduleC } from '@/lib/finance/scheduleC';
import { useFinanceStore } from '@/lib/finance/store';
import { formatCents } from '@/lib/finance/types';
import { useApp } from '@/contexts/AppContext';

/**
 * Schedule C draft — printable view.
 *
 * Visit `/finances/tax-report/schedule-c-print/:year` (or `?print=1` to auto-
 * open the OS print dialog). The page is styled to print cleanly at Letter
 * size and includes a hidden screen-only banner reminding you it's a draft.
 *
 * No PDF library — the browser's "Save as PDF" in the print dialog is the
 * artifact. Cheap, dependable, no new deps.
 */
export default function ScheduleCPrint() {
  const { year: yearParam } = useParams<{ year?: string }>();
  const [searchParams] = useSearchParams();
  const { settings } = useApp();
  const year = Number(yearParam) || new Date().getFullYear();
  const period = useMemo(() => resolve({ kind: 'year', year }), [year]);

  const sc = useFinanceStore(() => buildScheduleC({
    period: { start: period.current.start, end: period.current.end },
    method: settings.accountingMethod,
  }));

  // Auto-print when ?print=1
  useEffect(() => {
    if (searchParams.get('print') === '1') {
      const t = window.setTimeout(() => window.print(), 250);
      return () => window.clearTimeout(t);
    }
  }, [searchParams]);

  return (
    <div className="schedule-c-print bg-white text-black mx-auto" style={{ maxWidth: '800px', padding: '48px 56px', fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif' }}>
      <div className="screen-only no-print mb-6 -mt-2 rounded-lg border border-status-warn/40 bg-status-warn/10 p-3 text-[12px] text-status-warn">
        <strong>Draft only.</strong> This page is styled for print. Use your browser's File → Print (⌘P / Ctrl+P) and choose "Save as PDF". CPA review required before filing.
      </div>

      <header className="mb-6 pb-4 border-b border-black/20">
        <h1 className="text-[22px] font-semibold">Schedule C — Profit or Loss From Business (Sole Proprietorship)</h1>
        <div className="mt-2 text-[13px] flex justify-between">
          <div>
            <div><strong>Tax year:</strong> {year}</div>
            <div><strong>Period:</strong> {period.current.label}</div>
            <div><strong>Method:</strong> {settings.accountingMethod}</div>
          </div>
          <div className="text-right">
            <div><strong>Generated:</strong> {new Date().toLocaleString()}</div>
            <div className="text-black/60">Canyon Exotics OS</div>
          </div>
        </div>
      </header>

      <section className="mb-6">
        <h2 className="text-[14px] font-semibold mb-2">Part I — Income</h2>
        <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <Row line="1" label="Gross receipts or sales" amount={sc.revenueCents} bold />
            <Row line="2" label="Returns and allowances" amount={0} muted />
            <Row line="3" label="Subtract line 2 from line 1" amount={sc.revenueCents} />
            <Row line="7" label="Gross income" amount={sc.revenueCents} bold />
          </tbody>
        </table>
      </section>

      <section className="mb-6">
        <h2 className="text-[14px] font-semibold mb-2">Part II — Expenses</h2>
        <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.2)' }}>
              <th align="left"   style={{ padding: '4px 6px', width: '60px' }}>Line</th>
              <th align="left"   style={{ padding: '4px 6px' }}>Description</th>
              <th align="right"  style={{ padding: '4px 6px', width: '110px' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {sc.lines.length === 0 ? (
              <tr><td colSpan={3} style={{ padding: '12px 6px' }} className="text-black/60 text-center">No expenses recorded.</td></tr>
            ) : sc.lines.map(l => (
              <>
                <Row key={l.line} line={l.line} label={l.label} amount={l.cents} />
                {l.accounts.length > 1 && (
                  <tr key={`${l.line}-detail`}>
                    <td></td>
                    <td colSpan={2} style={{ padding: '0 6px 4px 6px' }} className="text-[11px] text-black/55">
                      {l.accounts.map(a => `${a.code} ${a.name} ${formatCents(a.cents)}`).join('  ·  ')}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid rgba(0,0,0,0.2)' }}>
              <td style={{ padding: '6px' }}>28</td>
              <td style={{ padding: '6px' }} className="font-semibold">Total expenses</td>
              <td align="right" style={{ padding: '6px' }} className="font-semibold tabular-nums">{formatCents(sc.totalDeductionsCents)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="mb-6">
        <h2 className="text-[14px] font-semibold mb-2">Net profit</h2>
        <table className="w-full text-[14px]" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <Row line="31" label="Net profit or (loss)" amount={sc.netProfitCents} bold large />
          </tbody>
        </table>
      </section>

      <footer className="mt-10 pt-4 border-t border-black/20 text-[11px] text-black/60 leading-[1.6]">
        Generated by Canyon Exotics OS from the in-application ledger. Numbers are <strong>unaudited</strong>. Verify with a CPA before filing. Line numbers reference the 2024 Schedule C form; review for the tax year being filed.
      </footer>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print, .screen-only { display: none !important; }
          @page { size: Letter; margin: 0.5in; }
          body { background: white; }
          .schedule-c-print { box-shadow: none; padding: 0 !important; }
        }
        @media screen {
          .schedule-c-print { box-shadow: 0 4px 24px rgba(0,0,0,0.15); margin: 24px auto; border-radius: 4px; }
        }
      `}</style>
    </div>
  );
}

function Row({ line, label, amount, bold, muted, large }: {
  line: string;
  label: string;
  amount: number;
  bold?: boolean;
  muted?: boolean;
  large?: boolean;
}) {
  return (
    <tr style={{ borderBottom: '1px dotted rgba(0,0,0,0.1)' }}>
      <td style={{ padding: '4px 6px', width: '60px' }} className={muted ? 'text-black/55' : ''}>{line}</td>
      <td style={{ padding: '4px 6px' }} className={`${bold ? 'font-semibold' : ''} ${muted ? 'text-black/55' : ''}`}>{label}</td>
      <td align="right" style={{ padding: '4px 6px' }} className={`tabular-nums ${bold ? 'font-semibold' : ''} ${large ? 'text-[16px]' : ''} ${muted ? 'text-black/55' : ''}`}>{formatCents(amount)}</td>
    </tr>
  );
}
