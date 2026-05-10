import { useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Bottom-right toaster. Max 3 stacked; older ones drop off the top.
 * Auto-dismiss: 5s for ok/info, 10s for warn/alert.
 * Always exposes an action slot (undo/retry/etc.) when relevant.
 *
 * Live region: aria-live=polite (success/info), assertive (alert).
 */
export function Toaster() {
  const { toasts, removeToast } = useApp();
  const visible = toasts.slice(-3);

  return (
    <>
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2 w-[360px] pointer-events-none no-print"
      >
        {visible.map(t => t.status !== 'alert' && (
          <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[81] flex flex-col gap-2 w-[360px] pointer-events-none no-print"
      >
        {visible.map(t => t.status === 'alert' && (
          <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
    </>
  );
}

const ICON = { ok: CheckCircle, info: Info, warn: AlertTriangle, alert: AlertCircle } as const;
const TONE = {
  ok:    'text-status-ok',
  info:  'text-status-info',
  warn:  'text-status-warn',
  alert: 'text-status-alert',
} as const;

function ToastItem({ toast, onDismiss }: { toast: any; onDismiss: () => void }) {
  useEffect(() => {
    const ms = toast.duration ?? (toast.status === 'alert' || toast.status === 'warn' ? 10_000 : 5_000);
    if (ms <= 0) return;
    const t = window.setTimeout(onDismiss, ms);
    return () => window.clearTimeout(t);
  }, [toast, onDismiss]);

  const Icon = ICON[toast.status as keyof typeof ICON] ?? Info;

  return (
    <div
      role={toast.status === 'alert' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto bg-bg-elevated border border-border-subtle rounded-lg p-3 shadow-2xl flex items-start gap-2',
        'animate-in slide-in-from-right-4 fade-in duration-[200ms] ease-[cubic-bezier(0.2,0,0,1)]',
      )}
    >
      <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', TONE[toast.status as keyof typeof TONE])} strokeWidth={1.5} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-text-primary">{toast.title}</p>
        {toast.description && (
          <p className="text-[12px] text-text-secondary mt-0.5">{toast.description}</p>
        )}
        {toast.action && (
          <button
            onClick={() => { toast.action.run(); onDismiss(); }}
            className="mt-1.5 h-6 px-2 rounded text-[12px] font-medium text-accent-brand hover:bg-accent-brand/10 transition-colors duration-[120ms]"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="w-6 h-6 -mr-1 rounded flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
