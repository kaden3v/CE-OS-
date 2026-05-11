import { CreditCard, AlertTriangle, ExternalLink } from 'lucide-react';
import type { RecordDrawerConfig } from '../types';
import type { TransactionView } from '@/lib/finance/types';
import { formatCents } from '@/lib/finance/types';
import { accountName } from '@/lib/finance/accounts';

export type VendorRecord = {
  id: string;
  name: string;
  /** GL code most commonly used with this vendor. */
  primaryAccount: string;
  totalCents: number;
  lastDate: string;
  transactionCount: number;
  /** All historical transactions with this vendor. */
  transactions: TransactionView[];
};

/**
 * Vendor drawer config. The vendor itself is a projection — its YTD totals
 * come from the ledger. Inline editing is intentionally limited (vendor
 * profile data lives elsewhere); the drawer is mostly read-only history.
 */
export function vendorConfig({
  onNewExpense, onFlag, onOpenTransaction,
}: {
  onNewExpense: (vendor: VendorRecord) => void;
  onFlag: (vendor: VendorRecord) => void;
  onOpenTransaction: (tx: TransactionView) => void;
}): RecordDrawerConfig<VendorRecord> {
  return {
    type: 'vendor',
    title: (v) => v.name,
    status: (v) => v.transactionCount === 0
      ? { label: 'No activity', tone: 'neutral' }
      : { label: `${v.transactionCount} ${v.transactionCount === 1 ? 'txn' : 'txns'}`, tone: 'info' },
    properties: [
      { id: 'category', label: 'Primary category', type: 'readonly',
        value: (v) => `${v.primaryAccount} — ${accountName(v.primaryAccount)}` },
      { id: 'total',    label: 'Total spent',  type: 'readonly', value: (v) => formatCents(v.totalCents) },
      { id: 'count',    label: 'Transactions', type: 'readonly', value: (v) => String(v.transactionCount) },
      { id: 'last',     label: 'Last activity', type: 'readonly', value: (v) => v.lastDate || '—' },
    ],
    overviewBody: (v) => (
      <div>
        <h3 className="text-[12px] uppercase tracking-wider font-medium text-text-tertiary mb-2">Recent activity</h3>
        {v.transactions.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">No transactions in the current period.</p>
        ) : (
          <ul className="space-y-px">
            {v.transactions.slice(0, 12).map(t => (
              <li key={t.id}>
                <button
                  onClick={() => onOpenTransaction(t)}
                  className="w-full flex items-center justify-between px-2 h-8 rounded hover:bg-bg-hover transition-colors duration-[120ms] text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-text-primary truncate">{t.memo || '—'}</div>
                    <div className="text-[11px] text-text-tertiary tabular-nums">{t.date} · {accountName(t.account)}</div>
                  </div>
                  <span className="ml-2 text-[13px] tabular-nums text-text-primary font-medium flex-shrink-0">{formatCents(t.amountCents)}</span>
                  <ExternalLink className="w-3 h-3 ml-2 text-text-tertiary flex-shrink-0" strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {v.transactions.length > 12 && (
          <p className="text-[11px] text-text-tertiary mt-2">+ {v.transactions.length - 12} older transactions</p>
        )}
      </div>
    ),
    actions: [
      {
        id: 'new-expense', label: 'Log expense with this vendor', icon: CreditCard, primary: true,
        run: (v) => onNewExpense(v),
      },
      {
        id: 'flag', label: 'Flag for review', icon: AlertTriangle,
        run: (v) => onFlag(v),
      },
    ],
  };
}
