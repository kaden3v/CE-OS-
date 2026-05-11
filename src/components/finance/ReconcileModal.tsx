import { useMemo, useState } from 'react';
import { X, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { updateReconciliation } from '@/lib/finance/store';
import { formatCents } from '@/lib/finance/types';
import type { TransactionView } from '@/lib/finance/types';
import { useApp } from '@/contexts/AppContext';

/**
 * Bulk reconcile modal — for each selected transaction, propose a bank-line
 * match with a confidence score. The user confirms (or skips) each one.
 *
 * The bank lines are mocked until the Plaid connector lands. The matching
 * UI itself is the deliverable; swapping the source is one function.
 */

type BankLine = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
};

const MOCK_BANK_FEED: BankLine[] = [
  { id: 'bank-2025-05-08', date: '2025-05-08', amountCents: 14_500, description: 'POS SPHAGNUM MOSS CO' },
  { id: 'bank-2025-05-05', date: '2025-05-05', amountCents:  4_850, description: 'AMAZON BUSINESS' },
  { id: 'bank-2025-05-03', date: '2025-05-03', amountCents: 31_240, description: 'USPS.COM CLICK-N-SHIP' },
  { id: 'bank-2025-04-22', date: '2025-04-22', amountCents: 18_520, description: 'SRP ELECTRIC PMT' },
  { id: 'bank-2025-04-10', date: '2025-04-10', amountCents: 15_000, description: 'AZ DEPT AGRICULTURE' },
  { id: 'bank-2025-04-01', date: '2025-04-01', amountCents:  3_900, description: 'SHOPIFY MONTHLY' },
  { id: 'bank-2025-02-15', date: '2025-02-15', amountCents: 75_000, description: 'MILLER ACCT' },
];

type Match = {
  tx: TransactionView;
  candidate: BankLine | null;
  confidence: number; // 0..1
  /** Operator's decision for this match. */
  decision: 'pending' | 'accept' | 'skip';
};

export function ReconcileModal({ open, transactions, onClose, onDone }: {
  open: boolean;
  transactions: TransactionView[];
  onClose: () => void;
  onDone: (matched: number) => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  const initialMatches = useMemo<Match[]>(() => {
    return transactions.map(tx => {
      const candidates = MOCK_BANK_FEED.map(bl => ({ bl, score: scoreMatch(tx, bl) }));
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      return {
        tx,
        candidate: best && best.score > 0.4 ? best.bl : null,
        confidence: best?.score ?? 0,
        decision: 'pending',
      };
    });
  }, [transactions]);

  const [matches, setMatches] = useState<Match[]>(initialMatches);

  const accept  = (i: number) => setMatches(m => m.map((x, j) => j === i ? { ...x, decision: 'accept' } : x));
  const skip    = (i: number) => setMatches(m => m.map((x, j) => j === i ? { ...x, decision: 'skip' }   : x));
  const acceptAll = () => setMatches(m => m.map(x => x.candidate ? { ...x, decision: 'accept' } : x));

  const apply = () => {
    let matched = 0;
    for (const m of matches) {
      if (m.decision !== 'accept' || !m.candidate) continue;
      updateReconciliation(m.tx.journalId, {
        state: 'matched',
        matchedTo: m.candidate.id,
        matchedAt: new Date().toISOString(),
        matchedBy: 'Operator (manual)',
        confidence: m.confidence,
      });
      matched++;
    }
    onDone(matched);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reconcile-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-[120ms]"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-[760px] max-h-[80vh] flex flex-col rounded-xl bg-bg-elevated border border-border-subtle shadow-2xl overflow-hidden',
          'animate-in slide-in-from-bottom-2 duration-[200ms] ease-[cubic-bezier(0.2,0,0,1)]',
        )}
      >
        <header className="h-12 px-4 flex items-center justify-between border-b border-border-subtle flex-shrink-0">
          <h2 id="reconcile-title" className="text-[14px] font-semibold text-text-primary">
            Reconcile {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={acceptAll}
              className="h-7 px-2 rounded text-[12px] text-accent-brand hover:bg-accent-brand/10 transition-colors duration-[120ms]"
            >
              Accept all suggestions
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto divide-y divide-border-subtle">
          {matches.map((m, i) => (
            <MatchRow key={m.tx.id} match={m} onAccept={() => accept(i)} onSkip={() => skip(i)} />
          ))}
        </div>

        <footer className="px-4 h-12 border-t border-border-subtle flex items-center justify-between flex-shrink-0">
          <span className="text-[12px] text-text-tertiary">
            {matches.filter(m => m.decision === 'accept').length} to accept · {matches.filter(m => m.decision === 'skip').length} skipped
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-8 px-3 rounded text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              disabled={matches.every(m => m.decision !== 'accept')}
              className="h-8 px-3 rounded bg-accent-brand text-bg-base text-[13px] font-medium disabled:opacity-30 transition-opacity duration-[120ms]"
            >
              Apply reconciliations
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function MatchRow({ match, onAccept, onSkip }: { match: Match; onAccept: () => void; onSkip: () => void }) {
  const { tx, candidate, confidence, decision } = match;
  return (
    <div className={cn(
      'p-3 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3',
      decision === 'accept' && 'bg-status-ok/[0.04]',
      decision === 'skip'   && 'opacity-50',
    )}>
      {/* Ledger side */}
      <div className="min-w-0">
        <div className="text-[13px] text-text-primary truncate">{tx.vendor}</div>
        <div className="text-[11px] text-text-tertiary tabular-nums">{tx.date} · {tx.memo || '—'}</div>
      </div>
      <div className="text-right tabular-nums">
        <div className="text-[13px] text-text-primary">{formatCents(tx.amountCents)}</div>
      </div>

      <ArrowRight className="w-3.5 h-3.5 text-text-tertiary justify-self-center" />

      {/* Bank side */}
      {candidate ? (
        <div className="min-w-0">
          <div className="text-[13px] text-text-primary truncate">{candidate.description}</div>
          <div className="text-[11px] text-text-tertiary tabular-nums flex items-center gap-2">
            <span>{candidate.date}</span>
            <span>·</span>
            <ConfidenceMeter confidence={confidence} />
          </div>
        </div>
      ) : (
        <div className="text-[12px] text-status-warn flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
          No good match
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 col-span-4 justify-end">
        {decision === 'accept' ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-status-ok">
            <CheckCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            Will match
          </span>
        ) : decision === 'skip' ? (
          <span className="text-[12px] text-text-tertiary">Skipped</span>
        ) : (
          <>
            <button
              onClick={onSkip}
              className="h-7 px-2 rounded text-[12px] text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
            >
              Skip
            </button>
            {candidate && (
              <button
                onClick={onAccept}
                className="h-7 px-2 rounded text-[12px] font-medium text-accent-brand hover:bg-accent-brand/10 transition-colors duration-[120ms]"
              >
                Accept
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ConfidenceMeter({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const tone =
    pct >= 90 ? 'text-status-ok' :
    pct >= 60 ? 'text-status-info' :
    'text-status-warn';
  return <span className={tone}>{pct}% confidence</span>;
}

// ── Match scoring (mock) ─────────────────────────────────────────────────────
function scoreMatch(tx: TransactionView, bank: BankLine): number {
  // Exact amount → strong baseline.
  if (tx.amountCents !== bank.amountCents) return 0;
  let score = 0.5;

  // Same calendar day on the cash side.
  if (tx.date === bank.date) score += 0.3;
  // Within 3 days.
  else {
    const dt = Math.abs(new Date(tx.date).getTime() - new Date(bank.date).getTime()) / 86_400_000;
    if (dt <= 3) score += 0.15;
  }

  // Vendor token overlap with bank description.
  const tokens = tx.vendor.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
  const desc   = bank.description.toLowerCase();
  if (tokens.some(t => desc.includes(t))) score += 0.2;

  return Math.min(1, score);
}
