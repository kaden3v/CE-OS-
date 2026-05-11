import { useEffect, useRef, useState } from 'react';
import { Edit3, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * Reason modal — surfaced before recording a finance correction.
 *
 * The reason is required (≥ minLength chars) so the audit trail tells future-
 * you (or a CPA) why a number changed. Patterned on ConfirmModal but
 * collects a free-text rationale instead of a typed-confirm string.
 */
export function ReasonModal({
  open, title, body, fieldLabel, originalValue, nextValue, minLength = 6, onCommit, onCancel,
}: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  fieldLabel: string;
  originalValue: string;
  nextValue: string;
  minLength?: number;
  onCommit: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setReason(''); setPending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;
  const valid = reason.trim().length >= minLength;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reason-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-[120ms]"
      onClick={onCancel}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-[520px] rounded-xl bg-bg-elevated border border-border-subtle shadow-2xl overflow-hidden',
          'animate-in slide-in-from-bottom-2 duration-[200ms] ease-[cubic-bezier(0.2,0,0,1)]',
        )}
      >
        <header className="h-12 px-4 flex items-center gap-2 border-b border-border-subtle">
          <span className="w-7 h-7 rounded-full bg-status-info/15 text-status-info flex items-center justify-center">
            <Edit3 className="w-3.5 h-3.5" />
          </span>
          <h2 id="reason-title" className="text-[14px] font-semibold text-text-primary flex-1">{title}</h2>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-4 space-y-3">
          {body && <div className="text-[13px] text-text-secondary">{body}</div>}
          <div className="text-[12px] text-text-secondary space-y-1">
            <div><span className="text-text-tertiary">{fieldLabel}:</span></div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 items-baseline">
              <span className="text-text-tertiary">Before:</span>
              <code className="font-mono text-[12px] text-text-secondary line-through opacity-70 truncate">{originalValue || '—'}</code>
              <span className="text-text-tertiary">After:</span>
              <code className="font-mono text-[12px] text-text-primary truncate">{nextValue || '—'}</code>
            </div>
          </div>
          <div>
            <label htmlFor="reason-input" className="block text-[11px] uppercase tracking-wider font-medium text-text-tertiary mb-1">
              Reason for change <span className="text-status-alert">*</span>
            </label>
            <textarea
              ref={inputRef}
              id="reason-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && valid) onCommit(reason.trim()); }}
              placeholder="Why is this changing? (recorded in the audit log)"
              className="w-full bg-bg-base border border-border-subtle rounded p-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-brand transition-colors duration-[120ms] resize-none"
            />
            <div className={cn('text-[11px] mt-1', valid ? 'text-text-tertiary' : 'text-status-warn')}>
              {valid ? `${reason.trim().length} chars · ⌘↵ to save` : `Need at least ${minLength} characters (${reason.trim().length}/${minLength}).`}
            </div>
          </div>
        </div>
        <footer className="px-4 h-12 border-t border-border-subtle flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-8 px-3 rounded text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
          >
            Cancel
          </button>
          <button
            disabled={!valid || pending}
            onClick={async () => { setPending(true); try { await onCommit(reason.trim()); } finally { setPending(false); } }}
            className="h-8 px-3 rounded bg-accent-brand text-bg-base text-[13px] font-medium disabled:opacity-30 transition-opacity duration-[120ms]"
          >
            {pending ? 'Saving…' : 'Post correction'}
          </button>
        </footer>
      </div>
    </div>
  );
}
