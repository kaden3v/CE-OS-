import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, Download, CheckCircle, AlertTriangle, Trash2, Lock, Link2, Sparkles, Loader2 } from 'lucide-react';
import { DataTable } from '@/components/data/DataTable';
import { RecordDrawer } from '@/components/record/RecordDrawer';
import { ReasonModal } from '@/components/record/ReasonModal';
import { Topbar } from '@/components/nav/Topbar';
import { PeriodPicker } from '@/components/finance/PeriodPicker';
import { ReconcileModal } from '@/components/finance/ReconcileModal';
import { expenseConfig } from '@/components/record/configs/expense';
import type { ColumnDef } from '@/components/data/types';
import type { ActivityEntry } from '@/components/record/ActivityFeed';
import {
  listTransactions, totalCents, correctExpense, updateReconciliation, postExpense,
  useFinanceStore, periodFor, getEntryChain, listAuditEntries,
} from '@/lib/finance/store';
import { defaultPeriod, pctChange } from '@/lib/finance/period';
import { expenseAccounts, suggestAccountForVendor, accountByCode } from '@/lib/finance/accounts';
import { formatCents, type PeriodSelection, type TransactionView } from '@/lib/finance/types';
import { toCsv, downloadCsv, timestampedFilename } from '@/lib/finance/csv';
import { ocrReceiptFile } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';

export default function Expenses() {
  const { settings, addToast } = useApp();
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState<PeriodSelection>(() => defaultPeriod(settings.fiscalYearStartMonth));
  const [addOpen, setAddOpen] = useState(false);
  const [reconcileTxs, setReconcileTxs] = useState<TransactionView[] | null>(null);
  const [reasonPending, setReasonPending] = useState<null | {
    tx: TransactionView;
    field: string;
    /** Raw value submitted to correctExpense. */
    next: string;
    /** Display strings for the modal. */
    originalDisplay: string;
    nextDisplay: string;
  }>(null);

  // ── Filters from URL (for drill-down support) ─────────────────────────────
  const accountFilter = params.get('account') ?? null;
  const reconFilter   = params.get('recon') ?? null;
  const vendorFilter  = params.get('vendor') ?? null;

  // ── Reactive data ─────────────────────────────────────────────────────────
  const transactions = useFinanceStore(() => listTransactions({
    period: { start: period.current.start, end: period.current.end },
    method: settings.accountingMethod,
    accounts: accountFilter ? [accountFilter] : undefined,
    vendors:  vendorFilter ? [vendorFilter] : undefined,
    reconciliation: reconFilter as any,
  }));

  const prevTotalCents = useFinanceStore(() => period.previous ? totalCents({
    period: period.previous,
    method: settings.accountingMethod,
  }) : null);

  const lockedPeriod = useFinanceStore(() => periodFor(period.current.start));

  const currTotalCents = useMemo(() => transactions.reduce((s, t) => s + t.amountCents, 0), [transactions]);

  const unreconciledCount = useMemo(
    () => transactions.filter(t => t.reconciliation === 'unreconciled' || t.reconciliation === 'disputed').length,
    [transactions],
  );

  // ── Drill-down: URL ?id={journalId} opens the drawer ─────────────────────
  const openId = params.get('id');
  const openIndex = useMemo(() => transactions.findIndex(t => t.id === openId), [transactions, openId]);
  const openTx = openIndex >= 0 ? transactions[openIndex] : null;
  const openRecord = (id: string) => { const n = new URLSearchParams(params); n.set('id', id); setParams(n, { replace: false }); };
  const closeRecord = () => { const n = new URLSearchParams(params); n.delete('id'); setParams(n, { replace: true }); };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const onCorrect = useCallback((tx: TransactionView, field: string, next: string) => {
    const originalDisplay =
      field === 'serviceDate' ? tx.date :
      field === 'cashDate'    ? tx.date :
      field === 'vendor'      ? tx.vendor :
      field === 'memo'        ? tx.memo :
      field === 'accountCode' ? `${tx.account} — ${tx.accountName}` :
      field === 'amount'      ? formatCents(tx.amountCents) :
      '—';
    const nextDisplay =
      field === 'accountCode' ? `${next} — ${accountByCode(next)?.name ?? '?'}` :
      field === 'amount'      ? `$${Number(next).toFixed(2)}` :
      next;
    setReasonPending({ tx, field, next, originalDisplay, nextDisplay });
  }, []);

  const submitCorrection = useCallback(async (reason: string) => {
    if (!reasonPending) return;
    const { tx, field, next } = reasonPending;
    try {
      correctExpense({
        originalId: tx.journalId,
        reason,
        next: {
          serviceDate: field === 'serviceDate' ? next : tx.date,
          cashDate:    field === 'cashDate'    ? next : tx.date,
          vendor:      field === 'vendor' ? next : tx.vendor,
          memo:        field === 'memo'   ? next : tx.memo,
          accountCode: field === 'accountCode' ? next : tx.account,
          amountCents: field === 'amount' ? Math.round(parseFloat(next) * 100) : tx.amountCents,
          channel:     tx.channel,
          hasReceipt:  tx.hasReceipt,
        },
      });
      addToast({ title: 'Correction posted', description: 'Original entry preserved; new version is now active.', status: 'ok' });
    } catch (e: any) {
      addToast({ title: 'Correction failed', description: e.message, status: 'alert' });
    } finally {
      setReasonPending(null);
    }
  }, [reasonPending, addToast]);

  const onReconcile = useCallback((tx: TransactionView, state: 'reviewed' | 'unreconciled' | 'disputed') => {
    try {
      if (state === 'reviewed')      updateReconciliation(tx.journalId, { state: 'reviewed', reviewedAt: new Date().toISOString(), reviewedBy: 'Kaden' });
      else if (state === 'disputed') updateReconciliation(tx.journalId, { state: 'disputed', reason: 'Manually flagged', flaggedAt: new Date().toISOString(), flaggedBy: 'Kaden' });
      else                            updateReconciliation(tx.journalId, { state: 'unreconciled' });
      addToast({ title: `Marked ${state}`, status: 'ok' });
    } catch (e: any) {
      addToast({ title: 'Update failed', description: e.message, status: 'alert' });
    }
  }, [addToast]);

  const onDelete = useCallback((tx: TransactionView) => {
    addToast({
      title: 'Soft-deleted',
      description: 'In a real ledger, deletes post a reversing entry. This placeholder only logs the intent.',
      status: 'warn',
      action: { label: 'Undo', run: () => addToast({ title: 'Restored', status: 'info' }) },
    });
    closeRecord();
  }, [addToast]);

  const getActivity = useCallback((journalId: string): ActivityEntry[] => {
    const chain = getEntryChain(journalId);
    const audits = listAuditEntries({ entryId: journalId });
    const fromChain: ActivityEntry[] = chain.map((e, i) => ({
      id: `chain-${e.id}`,
      kind: 'system',
      actor: { name: e.createdBy, initials: initialsOf(e.createdBy) },
      at: e.createdAt,
      text: i === chain.length - 1
        ? `Posted ${e.vendor}: ${e.memo || '—'}`
        : e.correctionReason
          ? `Corrected — reason: "${e.correctionReason}"`
          : `Corrected (no reason recorded)`,
    }));
    const fromAudit: ActivityEntry[] = audits
      .filter(a => a.kind === 'reconcile')
      .map(a => ({
        id: `audit-${a.id}`,
        kind: 'system',
        actor: { name: a.actor, initials: initialsOf(a.actor) },
        at: a.at,
        text: a.summary,
      }));
    return [...fromChain, ...fromAudit].sort((a, b) => a.at.localeCompare(b.at));
  }, []);

  const config = useMemo(() => expenseConfig({ onCorrect, onReconcile, onDelete, getActivity }), [onCorrect, onReconcile, onDelete, getActivity]);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns: ColumnDef<TransactionView>[] = useMemo(() => [
    {
      id: 'date', accessor: 'date', header: 'Date', width: 110, pin: 'left',
      cell: (r) => <span className="tabular-nums text-text-primary">{r.date}</span>,
    },
    {
      id: 'vendor', accessor: 'vendor', header: 'Vendor', width: 200, filterable: true,
      cell: (r) => <span className="font-medium text-text-primary">{r.vendor}</span>,
    },
    {
      id: 'account', accessor: 'account', header: 'GL Account', width: 220, filterable: true, groupable: true,
      options: expenseAccounts().map(a => ({ value: a.code, label: a.code })),
      cell: (r) => (
        <span className="text-text-secondary">
          <span className="font-mono text-text-tertiary text-[11px] mr-2">{r.account}</span>
          {r.accountName}
        </span>
      ),
    },
    {
      id: 'memo', accessor: 'memo', header: 'Memo', width: 240,
      cell: (r) => <span className="text-text-secondary truncate">{r.memo}</span>,
    },
    {
      id: 'amount', accessor: 'amountCents', header: 'Amount', width: 110, numeric: true,
      cell: (r) => <span className="tabular-nums text-text-primary font-medium">{formatCents(r.amountCents)}</span>,
    },
    {
      id: 'recon', accessor: 'reconciliation', header: 'Status', width: 130, filterable: true, groupable: true,
      options: [
        { value: 'matched',      label: 'Reconciled' },
        { value: 'reviewed',     label: 'Reviewed' },
        { value: 'unreconciled', label: 'Unreconciled' },
        { value: 'disputed',     label: 'Disputed' },
      ],
      cell: (r) => <ReconciliationCell state={r.reconciliation} />,
    },
    {
      id: 'deductible', accessor: 'deductible', header: 'Sch. C', width: 80, filterable: true,
      cell: (r) => r.deductible
        ? <span className="text-[11px] font-mono text-status-ok">Line {accountByCode(r.account)?.scheduleC}</span>
        : <span className="text-[11px] text-text-tertiary">—</span>,
    },
  ], []);

  // ── CSV export ────────────────────────────────────────────────────────────
  const onExportCsv = () => {
    const csv = toCsv(transactions, [
      { header: 'Date',         value: r => r.date },
      { header: 'Vendor',       value: r => r.vendor },
      { header: 'GL Code',      value: r => r.account },
      { header: 'Account',      value: r => r.accountName },
      { header: 'Memo',         value: r => r.memo },
      { header: 'Amount',       value: r => (r.amountCents / 100).toFixed(2) },
      { header: 'Status',       value: r => r.reconciliation },
      { header: 'Schedule C',   value: r => accountByCode(r.account)?.scheduleC ?? '' },
      { header: 'Receipt',      value: r => r.hasReceipt ? 'yes' : 'no' },
      { header: 'Posted By',    value: r => r.createdBy },
      { header: 'Posted At',    value: r => r.createdAt },
      { header: 'Journal ID',   value: r => r.journalId },
    ]);
    downloadCsv(csv, timestampedFilename(`expenses-${period.current.label.replace(/\s+/g, '-').toLowerCase()}`));
    addToast({ title: `Exported ${transactions.length} expenses`, status: 'ok' });
  };

  // ── Active drill-down chip ────────────────────────────────────────────────
  const activeFilter = accountFilter
    ? { label: `Filtered to ${accountFilter} ${accountByCode(accountFilter)?.name ?? ''}`, clear: () => { const n = new URLSearchParams(params); n.delete('account'); setParams(n, { replace: true }); } }
    : reconFilter
    ? { label: `Status: ${reconFilter}`, clear: () => { const n = new URLSearchParams(params); n.delete('recon'); setParams(n, { replace: true }); } }
    : null;

  const delta = prevTotalCents != null ? pctChange(currTotalCents, prevTotalCents) : null;

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
            <button
              onClick={() => setAddOpen(true)}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-accent-brand text-bg-base text-[13px] font-medium hover:opacity-90 transition-opacity duration-[120ms]"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              New expense
            </button>
          </>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        {/* Stat tiles — computed, not hardcoded */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            label={`Spend · ${period.current.label}`}
            value={formatCents(currTotalCents)}
            delta={delta}
            deltaLabel={period.previous?.label}
          />
          <StatTile
            label="Transactions"
            value={String(transactions.length)}
          />
          <StatTile
            label="Unreconciled"
            value={String(unreconciledCount)}
            tone={unreconciledCount === 0 ? 'ok' : 'warn'}
          />
          <StatTile
            label="Deductible"
            value={formatCents(transactions.filter(t => t.deductible).reduce((s, t) => s + t.amountCents, 0))}
            tone="ok"
          />
        </div>

        {/* Closed-period banner */}
        {lockedPeriod && lockedPeriod.status !== 'open' && (
          <div className="rounded-lg border border-status-warn/30 bg-status-warn/[0.06] p-3 flex items-start gap-2">
            <Lock className="w-4 h-4 text-status-warn flex-shrink-0 mt-0.5" strokeWidth={1.5} />
            <div className="text-[12px] text-text-secondary leading-[1.6]">
              <strong className="text-text-primary">{lockedPeriod.id} is {lockedPeriod.status}.</strong> Closed on {lockedPeriod.closedAt ? new Date(lockedPeriod.closedAt).toLocaleDateString() : '—'} by {lockedPeriod.closedBy ?? '—'}. New posts and corrections are blocked. Reopen from the Tax Report if you need to make changes.
            </div>
          </div>
        )}

        {/* Active drill-down chip */}
        {activeFilter && (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-text-tertiary">Drill-down active:</span>
            <button
              onClick={activeFilter.clear}
              className="h-7 px-2 rounded-full bg-accent-brand/10 border border-accent-brand/30 text-accent-brand hover:bg-accent-brand/15 transition-colors duration-[120ms]"
            >
              {activeFilter.label} ✕
            </button>
          </div>
        )}

        {/* Totals row — pinned beneath the table while it sits on the page */}
        {transactions.length > 0 && (
          <div className="rounded-lg border border-border-subtle bg-bg-elevated px-4 h-10 flex items-center justify-between text-[12px]">
            <span className="text-text-tertiary">
              {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'} · {transactions.filter(t => t.deductible).length} deductible
            </span>
            <span className="flex items-center gap-4 tabular-nums">
              <span className="text-text-tertiary">Deductible: <span className="text-status-ok">{formatCents(transactions.filter(t => t.deductible).reduce((s, t) => s + t.amountCents, 0))}</span></span>
              <span className="text-text-primary font-semibold">Total: {formatCents(currTotalCents)}</span>
            </span>
          </div>
        )}

        <DataTable<TransactionView>
          storageKey="expenses.v2"
          rows={transactions}
          columns={columns}
          getRowId={(t) => t.id}
          onRowOpen={(t) => openRecord(t.id)}
          onSelectionChange={() => { /* bulk actions wired below */ }}
          bulkActions={[
            { id: 'reconcile', label: 'Reconcile against bank…', icon: Link2,
              run: (rows) => setReconcileTxs(rows) },
            { id: 'review', label: 'Mark reviewed', icon: CheckCircle,
              run: (rows) => { rows.forEach(r => onReconcile(r, 'reviewed')); } },
            { id: 'dispute', label: 'Flag disputed', icon: AlertTriangle,
              run: (rows) => { rows.forEach(r => onReconcile(r, 'disputed')); } },
            { id: 'delete', label: 'Delete', icon: Trash2, destructive: true,
              run: (rows) => addToast({ title: `Soft-deleted ${rows.length} expenses (placeholder)`, status: 'warn' }) },
          ]}
          emptyState={{
            title: 'No expenses in this period',
            description: 'Adjust the period above or log a new expense.',
            action: { label: 'New expense', onClick: () => setAddOpen(true) },
          }}
          rowLabel={(t) => `${t.date}, ${t.vendor}, ${formatCents(t.amountCents)}, ${t.reconciliation}`}
        />
      </div>

      <RecordDrawer
        open={!!openTx}
        record={openTx}
        config={config}
        onClose={closeRecord}
        onPrev={openIndex > 0 ? () => openRecord(transactions[openIndex - 1].id) : undefined}
        onNext={openIndex >= 0 && openIndex < transactions.length - 1 ? () => openRecord(transactions[openIndex + 1].id) : undefined}
      />

      {addOpen && (
        <NewExpenseModal
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); addToast({ title: 'Expense posted', status: 'ok' }); }}
        />
      )}

      <ReconcileModal
        open={!!reconcileTxs}
        transactions={reconcileTxs ?? []}
        onClose={() => setReconcileTxs(null)}
        onDone={(matched) => { setReconcileTxs(null); addToast({ title: `Reconciled ${matched} transactions`, status: 'ok' }); }}
      />

      <ReasonModal
        open={!!reasonPending}
        title="Post a correction"
        body={<p>Journal entries are immutable. Saving here posts a new entry that supersedes the original. Both stay in the audit log.</p>}
        fieldLabel={reasonPending ? fieldLabelFor(reasonPending.field) : ''}
        originalValue={reasonPending?.originalDisplay ?? ''}
        nextValue={reasonPending?.nextDisplay ?? ''}
        onCommit={submitCorrection}
        onCancel={() => setReasonPending(null)}
      />
    </>
  );
}

function fieldLabelFor(field: string): string {
  switch (field) {
    case 'serviceDate': return 'Service date';
    case 'vendor':      return 'Vendor';
    case 'memo':        return 'Memo';
    case 'accountCode': return 'GL Account';
    case 'amount':      return 'Amount';
    case 'cashDate':    return 'Cash date';
    default:            return field;
  }
}

function initialsOf(name: string): string {
  return name.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || 'U';
}

// ─────────────────────────────────────────────────────────────────────────────
// Tile
// ─────────────────────────────────────────────────────────────────────────────
function StatTile({ label, value, delta, deltaLabel, tone }: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  tone?: 'ok' | 'warn' | 'alert';
}) {
  const toneClass = tone === 'ok' ? 'text-status-ok' : tone === 'warn' ? 'text-status-warn' : tone === 'alert' ? 'text-status-alert' : 'text-text-primary';
  const deltaTone = delta == null ? 'text-text-tertiary' : delta > 0 ? 'text-status-alert' : 'text-status-ok'; // for expenses, up is bad
  return (
    <div className="p-3 rounded-lg bg-bg-elevated border border-border-subtle">
      <div className="text-[11px] uppercase tracking-wider font-medium text-text-tertiary mb-1">{label}</div>
      <div className={cn('text-[22px] font-semibold tabular-nums', toneClass)}>{value}</div>
      {delta != null && deltaLabel && (
        <div className={cn('text-[11px] mt-0.5 tabular-nums', deltaTone)}>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)}% vs {deltaLabel}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation cell
// ─────────────────────────────────────────────────────────────────────────────
function ReconciliationCell({ state }: { state: TransactionView['reconciliation'] }) {
  const cls = {
    matched:      { dot: 'bg-status-ok',    text: 'text-status-ok',    label: 'Reconciled' },
    reviewed:     { dot: 'bg-status-info',  text: 'text-status-info',  label: 'Reviewed' },
    unreconciled: { dot: 'bg-status-warn',  text: 'text-status-warn',  label: 'Unreconciled' },
    disputed:     { dot: 'bg-status-alert', text: 'text-status-alert', label: 'Disputed' },
  }[state];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('w-2 h-2 rounded-full', cls.dot)} />
      <span className={cn('text-[12px]', cls.text)}>{cls.label}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New expense modal
// ─────────────────────────────────────────────────────────────────────────────
function NewExpenseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [vendor, setVendor]   = useState('');
  const [amount, setAmount]   = useState('');
  const [account, setAccount] = useState('6120');
  const [memo, setMemo]       = useState('');
  const [date, setDate]       = useState(() => new Date().toISOString().split('T')[0]);
  const [hasReceipt, setHasReceipt] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrNotes, setOcrNotes] = useState<string | null>(null);

  const onVendorBlur = () => {
    const suggestion = suggestAccountForVendor(vendor);
    if (suggestion) setAccount(suggestion);
  };

  const onReceiptDrop = async (file: File) => {
    setOcrRunning(true); setOcrError(null); setOcrConfidence(null); setOcrNotes(null);
    try {
      const { vendor: v, amountCents, date: d, confidence, notes } = await ocrReceiptFile(file);
      if (v) setVendor(v);
      if (amountCents != null) setAmount((amountCents / 100).toFixed(2));
      if (d) setDate(d);
      if (v) {
        const suggestion = suggestAccountForVendor(v);
        if (suggestion) setAccount(suggestion);
      }
      setOcrConfidence(confidence);
      setOcrNotes(notes);
      setHasReceipt(true);
    } catch (e: any) {
      setOcrError(e.message ?? 'OCR failed');
      setHasReceipt(true); // they still attached it
    } finally {
      setOcrRunning(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      postExpense({
        serviceDate: date,
        cashDate: date,
        vendor: vendor.trim(),
        memo: memo.trim(),
        accountCode: account,
        amountCents: Math.round(parseFloat(amount) * 100),
        hasReceipt,
      });
      onCreated();
    } catch (e: any) {
      // useApp().addToast unavailable here; bubble up
      alert(e.message);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-expense-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-[120ms]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] rounded-xl bg-bg-elevated border border-border-subtle shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-[200ms]"
      >
        <header className="h-12 px-4 flex items-center justify-between border-b border-border-subtle">
          <h2 id="new-expense-title" className="text-[14px] font-semibold text-text-primary">New expense</h2>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]">✕</button>
        </header>
        <form onSubmit={submit} className="p-4 space-y-3">
          {/* OCR drop-zone — pre-fills the rest of the form */}
          <label className={`w-full flex items-center justify-center gap-2 p-3 rounded border border-dashed cursor-pointer transition-colors duration-[120ms] text-[12px] ${
            ocrRunning
              ? 'border-accent-brand/40 bg-accent-brand/[0.06] text-accent-brand'
              : 'border-border-subtle bg-bg-elevated/40 hover:border-border-strong hover:bg-bg-hover text-text-secondary'
          }`}>
            {ocrRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />}
            <span>{ocrRunning ? 'Reading receipt…' : 'Drop a receipt to auto-fill (image or PDF)'}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onReceiptDrop(f); }}
            />
          </label>
          {ocrError && <p className="text-[11px] text-status-warn">{ocrError}</p>}
          {ocrConfidence != null && (
            <div className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded text-[11px]',
              ocrConfidence >= 0.85 ? 'bg-status-ok/[0.08] text-status-ok'
                : ocrConfidence >= 0.6 ? 'bg-status-info/[0.08] text-status-info'
                : 'bg-status-warn/[0.08] text-status-warn',
            )}>
              <span className="font-medium tabular-nums">{Math.round(ocrConfidence * 100)}% confidence</span>
              {ocrConfidence < 0.85 && <span>· double-check the fields below{ocrNotes ? ` — ${ocrNotes}` : ''}</span>}
            </div>
          )}

          <Field label="Date">
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary focus:outline-none focus:border-accent-brand" />
          </Field>
          <Field label="Vendor">
            <input type="text" required placeholder="e.g. USPS, Sphagnum Moss Co." value={vendor} onChange={(e) => setVendor(e.target.value)} onBlur={onVendorBlur} className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-brand" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (USD)">
              <input type="number" required step="0.01" min="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-brand tabular-nums" />
            </Field>
            <Field label="GL Account">
              <select value={account} onChange={(e) => setAccount(e.target.value)} className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary focus:outline-none focus:border-accent-brand">
                {expenseAccounts().map(a => (
                  <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Memo">
            <input type="text" placeholder="Optional" value={memo} onChange={(e) => setMemo(e.target.value)} className="w-full h-8 px-2 rounded bg-bg-base border border-border-subtle text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-brand" />
          </Field>
          <label className="flex items-center gap-2 text-[13px] text-text-primary">
            <input type="checkbox" checked={hasReceipt} onChange={(e) => setHasReceipt(e.target.checked)} className="rounded border-border-strong bg-bg-elevated" />
            Receipt attached
          </label>
          <footer className="flex justify-end gap-2 pt-3 border-t border-border-subtle">
            <button type="button" onClick={onClose} className="h-8 px-3 rounded text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]">Cancel</button>
            <button type="submit" className="h-8 px-3 rounded bg-accent-brand text-bg-base text-[13px] font-medium hover:opacity-90 transition-opacity duration-[120ms]">Post expense</button>
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
