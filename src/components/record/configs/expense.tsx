import { CheckCircle, AlertTriangle, FileText, Trash2 } from 'lucide-react';
import type { RecordDrawerConfig } from '../types';
import type { TransactionView } from '@/lib/finance/types';
import { formatCents } from '@/lib/finance/types';
import { expenseAccounts, accountByCode } from '@/lib/finance/accounts';
import { ActivityFeed, type ActivityEntry } from '../ActivityFeed';

/**
 * Drawer config for a transaction (expense projection of a journal entry).
 *
 * Note the editing semantics: PropertyGrid edits call `onCommit`, but
 * because journal entries are immutable, every commit creates a correcting
 * entry via `correctExpense`. The caller wires that up and is expected to
 * surface a "reason" prompt for material changes.
 */
export function expenseConfig({
  onCorrect, onReconcile, onDelete, getActivity,
}: {
  onCorrect: (tx: TransactionView, field: string, next: string) => void;
  onReconcile: (tx: TransactionView, state: 'reviewed' | 'unreconciled' | 'disputed') => void;
  onDelete: (tx: TransactionView) => void;
  getActivity: (journalId: string) => ActivityEntry[];
}): RecordDrawerConfig<TransactionView> {
  return {
    type: 'expense',
    title: (t) => `${t.vendor} — ${formatCents(t.amountCents)}`,
    status: (t) => {
      switch (t.reconciliation) {
        case 'matched':      return { label: 'Reconciled',   tone: 'ok' };
        case 'reviewed':     return { label: 'Reviewed',     tone: 'info' };
        case 'disputed':     return { label: 'Disputed',     tone: 'alert' };
        case 'unreconciled': return { label: 'Unreconciled', tone: 'warn' };
      }
    },
    properties: [
      {
        id: 'date', label: 'Date', type: 'date',
        value: (t) => t.date,
        onCommit: (t, v) => onCorrect(t, 'serviceDate', String(v)),
      },
      {
        id: 'vendor', label: 'Vendor', type: 'text',
        value: (t) => t.vendor,
        onCommit: (t, v) => onCorrect(t, 'vendor', String(v)),
      },
      {
        id: 'account', label: 'GL Account', type: 'select',
        value: (t) => t.account,
        options: expenseAccounts().map(a => ({ value: a.code, label: `${a.code} — ${a.name}` })),
        onCommit: (t, v) => onCorrect(t, 'accountCode', String(v)),
      },
      {
        id: 'schedC', label: 'Schedule C',  type: 'readonly',
        value: (t) => {
          const sc = accountByCode(t.account)?.scheduleC;
          return sc ? `Line ${sc}` : '—';
        },
      },
      {
        id: 'amount', label: 'Amount', type: 'readonly',
        value: (t) => formatCents(t.amountCents),
      },
      {
        id: 'channel', label: 'Channel', type: 'readonly',
        value: (t) => t.channel ?? 'Manual',
      },
      {
        id: 'memo', label: 'Memo', type: 'text',
        value: (t) => t.memo,
        onCommit: (t, v) => onCorrect(t, 'memo', String(v)),
      },
      {
        id: 'receipt', label: 'Receipt', type: 'readonly',
        value: (t) => t.hasReceipt ? 'Attached' : '— (no receipt)',
      },
      {
        id: 'createdBy', label: 'Posted by', type: 'readonly',
        value: (t) => `${t.createdBy} · ${new Date(t.createdAt).toLocaleDateString()}`,
      },
    ],
    overviewBody: (t) => (
      <div>
        <h3 className="text-[12px] uppercase tracking-wider font-medium text-text-tertiary mb-2">Reconciliation</h3>
        <ReconciliationPanel tx={t} />
      </div>
    ),
    tabs: [
      {
        id: 'activity', label: 'Activity',
        content: (t) => <ActivityFeed entries={getActivity(t.journalId)} />,
      },
    ],
    actions: [
      {
        id: 'mark-reviewed', label: 'Mark reviewed', icon: CheckCircle, primary: true,
        applies: (t) => t.reconciliation === 'unreconciled',
        run: (t) => onReconcile(t, 'reviewed'),
      },
      {
        id: 'dispute', label: 'Flag as disputed', icon: AlertTriangle,
        applies: (t) => t.reconciliation !== 'disputed',
        run: (t) => onReconcile(t, 'disputed'),
      },
      {
        id: 'unreconcile', label: 'Reset to unreconciled', icon: FileText,
        applies: (t) => t.reconciliation !== 'unreconciled',
        run: (t) => onReconcile(t, 'unreconciled'),
      },
      {
        id: 'delete', label: 'Delete expense', icon: Trash2, destructive: true,
        confirm: {
          title: 'Delete this expense?',
          typeToConfirm: 'DELETE',
          confirmLabel: 'Delete expense',
        },
        run: (t) => onDelete(t),
      },
    ],
  };
}

function ReconciliationPanel({ tx }: { tx: TransactionView }) {
  const states: Record<TransactionView['reconciliation'], { tone: string; copy: string }> = {
    matched:      { tone: 'text-status-ok',     copy: 'Matched to a bank-feed transaction. Numbers will flow through to the tax report cleanly.' },
    reviewed:     { tone: 'text-status-info',   copy: "You've eyeballed this one. Hasn't been auto-matched to a bank line yet." },
    disputed:     { tone: 'text-status-alert',  copy: 'Flagged for follow-up. Excluded from "ready for filing" totals.' },
    unreconciled: { tone: 'text-status-warn',   copy: 'Sitting in limbo. Either match it to a bank line or mark it reviewed.' },
  };
  const s = states[tx.reconciliation];
  return (
    <div className="p-3 rounded border border-border-subtle bg-bg-elevated">
      <div className={`text-[13px] font-medium ${s.tone} mb-1 capitalize`}>{tx.reconciliation}</div>
      <p className="text-[12px] text-text-secondary leading-[1.6]">{s.copy}</p>
    </div>
  );
}
