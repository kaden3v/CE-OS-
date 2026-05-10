import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * Type-to-confirm modal (Vercel-style). The user must type a magic string
 * (typically the record ID) before the destructive action enables.
 */
export function ConfirmModal({
  open, title, typeToConfirm, confirmLabel, body, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  typeToConfirm: string;
  confirmLabel: string;
  body?: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setInput(''); setPending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;
  const matches = input === typeToConfirm;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-[120ms]"
      onClick={onCancel}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-[480px] rounded-xl bg-bg-elevated border border-border-subtle shadow-2xl overflow-hidden',
          'animate-in slide-in-from-bottom-2 duration-[200ms] ease-[cubic-bezier(0.2,0,0,1)]',
        )}
      >
        <header className="h-12 px-4 flex items-center gap-2 border-b border-border-subtle">
          <span className="w-7 h-7 rounded-full bg-status-alert/15 text-status-alert flex items-center justify-center">
            <AlertTriangle className="w-3.5 h-3.5" />
          </span>
          <h2 id="confirm-title" className="text-[14px] font-semibold text-text-primary flex-1">{title}</h2>
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
          <p className="text-[13px] text-text-secondary">
            Type <code className="px-1 py-0.5 rounded bg-bg-base border border-border-subtle font-mono text-[12px] text-text-primary">{typeToConfirm}</code> to confirm.
          </p>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && matches) onConfirm(); }}
            placeholder={typeToConfirm}
            aria-label={`Type ${typeToConfirm} to confirm`}
            className="w-full h-9 px-2 bg-bg-base border border-border-subtle rounded text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-brand transition-colors duration-[120ms]"
          />
        </div>
        <footer className="px-4 h-12 border-t border-border-subtle flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-8 px-3 rounded text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
          >
            Cancel
          </button>
          <button
            disabled={!matches || pending}
            onClick={async () => { setPending(true); try { await onConfirm(); } finally { setPending(false); } }}
            className={cn(
              'h-8 px-3 rounded text-[13px] font-medium transition-opacity duration-[120ms]',
              'bg-status-alert text-white disabled:opacity-30',
            )}
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
