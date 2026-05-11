import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { ConfirmModal } from '@/components/record/ConfirmModal';
import { ReasonModal } from '@/components/record/ReasonModal';
import { closePeriod, reopenPeriod, periodFor, useFinanceStore } from '@/lib/finance/store';
import { useApp } from '@/contexts/AppContext';
import type { PeriodSelection } from '@/lib/finance/types';

/**
 * Single button that does close or reopen depending on current state.
 * Lives in the TaxReport topbar.
 *
 * Close → type-to-confirm dialog (period id must be typed). Locks the range.
 * Reopen → reason dialog (audit-logged). Returns the period to "open".
 */
export function ClosePeriodButton({ period }: { period: PeriodSelection }) {
  const { addToast } = useApp();
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);

  // Subscribe so the button label flips immediately after close/reopen.
  const current = useFinanceStore(() => periodFor(period.current.start));

  const periodId = period.current.label.replace(/\s+/g, '-');

  if (current?.status === 'closed' || current?.status === 'locked') {
    return (
      <>
        <button
          onClick={() => setConfirmReopen(true)}
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-status-warn/30 bg-status-warn/[0.06] text-status-warn text-[13px] hover:bg-status-warn/10 transition-colors duration-[120ms]"
        >
          <Unlock className="w-3.5 h-3.5" strokeWidth={1.5} />
          Reopen {current.id}
        </button>
        <ReasonModal
          open={confirmReopen}
          title="Reopen this period?"
          body={<p>Reopening allows new posts and corrections. The reason is recorded in the audit log.</p>}
          fieldLabel="Period"
          originalValue={`${current.id} (closed)`}
          nextValue={`${current.id} (open)`}
          minLength={10}
          onCommit={async (reason) => {
            try { reopenPeriod(current.id, reason); addToast({ title: `${current.id} reopened`, status: 'ok' }); }
            catch (e: any) { addToast({ title: 'Reopen failed', description: e.message, status: 'alert' }); }
            finally { setConfirmReopen(false); }
          }}
          onCancel={() => setConfirmReopen(false)}
        />
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setConfirmClose(true)}
        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border-subtle text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
      >
        <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
        Close period
      </button>
      <ConfirmModal
        open={confirmClose}
        title={`Close ${period.current.label}?`}
        typeToConfirm={periodId}
        confirmLabel="Close period"
        body={
          <div className="space-y-2">
            <p>After closing, new posts to this range require a reopen (audit-logged). Use this when you've reconciled the period and signed off on the numbers.</p>
            <p className="text-text-tertiary text-[12px]">Type <code className="font-mono">{periodId}</code> to confirm.</p>
          </div>
        }
        onCancel={() => setConfirmClose(false)}
        onConfirm={async () => {
          try {
            closePeriod({
              kind: period.current.label.length === 4 ? 'year' : period.current.label.startsWith('Q') ? 'quarter' : 'month',
              start: period.current.start,
              end: period.current.end,
              id: periodId,
            });
            addToast({ title: `${periodId} closed`, status: 'ok' });
            setConfirmClose(false);
          } catch (e: any) {
            addToast({ title: 'Close failed', description: e.message, status: 'alert' });
          }
        }}
      />
    </>
  );
}
