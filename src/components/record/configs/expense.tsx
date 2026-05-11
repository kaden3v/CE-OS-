import { useState } from 'react';
import { CheckCircle, AlertTriangle, FileText, Trash2, Paperclip, ExternalLink, Upload, Loader2 } from 'lucide-react';
import type { RecordDrawerConfig } from '../types';
import type { TransactionView } from '@/lib/finance/types';
import { formatCents } from '@/lib/finance/types';
import { expenseAccounts, accountByCode } from '@/lib/finance/accounts';
import { ActivityFeed, type ActivityEntry } from '../ActivityFeed';
import { uploadReceipt } from '@/lib/api';

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
        id: 'amount', label: 'Amount', type: 'number',
        value: (t) => (t.amountCents / 100).toFixed(2),
        onCommit: (t, v) => onCorrect(t, 'amount', String(v)),
      },
      {
        id: 'cashDate', label: 'Cash date', type: 'date',
        value: (t) => t.date,
        onCommit: (t, v) => onCorrect(t, 'cashDate', String(v)),
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
        id: 'createdBy', label: 'Posted by', type: 'readonly',
        value: (t) => `${t.createdBy} · ${new Date(t.createdAt).toLocaleDateString()}`,
      },
    ],
    overviewBody: (t) => (
      <div className="space-y-4">
        <section>
          <h3 className="text-[12px] uppercase tracking-wider font-medium text-text-tertiary mb-2">Reconciliation</h3>
          <ReconciliationPanel tx={t} />
        </section>
        <section>
          <h3 className="text-[12px] uppercase tracking-wider font-medium text-text-tertiary mb-2">Receipt</h3>
          <ReceiptPanel tx={t} />
        </section>
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

function ReceiptPanel({ tx }: { tx: TransactionView }) {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<{ url: string; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setUploading(true); setError(null);
    try {
      const res = await uploadReceipt({ journalId: tx.journalId, file });
      setUploaded({ url: res.url, filename: res.filename });
    } catch (e: any) {
      setError(e.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (uploaded || tx.hasReceipt) {
    const url = uploaded?.url ?? '#';
    const filename = uploaded?.filename ?? `receipt-${tx.journalId.slice(-6).toLowerCase()}.pdf`;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-2 p-3 rounded border border-border-subtle bg-bg-elevated hover:bg-bg-hover transition-colors duration-[120ms] group/r"
      >
        <span className="flex items-center gap-2 text-[13px] text-text-primary min-w-0">
          <Paperclip className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" strokeWidth={1.5} />
          <span className="truncate">{filename}</span>
        </span>
        <ExternalLink className="w-3.5 h-3.5 text-text-tertiary group-hover/r:text-text-primary flex-shrink-0" strokeWidth={1.5} />
      </a>
    );
  }

  return (
    <div>
      <label
        className={`w-full flex items-center justify-center gap-2 p-3 rounded border border-dashed transition-colors duration-[120ms] text-[12px] cursor-pointer ${
          uploading
            ? 'border-accent-brand/40 bg-accent-brand/[0.06] text-accent-brand'
            : 'border-border-subtle bg-bg-elevated/40 hover:border-border-strong hover:bg-bg-hover text-text-secondary'
        }`}
      >
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />}
        {uploading ? 'Uploading…' : 'Attach receipt (image or PDF)'}
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />
      </label>
      {error && <p className="mt-1 text-[11px] text-status-alert">{error}</p>}
    </div>
  );
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
