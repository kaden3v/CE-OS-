import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortcutsByGroup } from '@/lib/nav/registry';
import { useFocusTrap } from '@/hooks/useFocusTrap';

const GROUP_LABEL = {
  global: 'Global',
  navigation: 'Navigation',
  table: 'Lists & tables',
  record: 'Record drawer',
} as const;

export function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  if (!open) return null;
  const groups = shortcutsByGroup();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-overlay-title"
      className={cn(
        'fixed inset-0 z-[60] flex items-center justify-center p-4',
        'bg-black/50 backdrop-blur-sm',
        'animate-in fade-in duration-[120ms]',
      )}
      onClick={onClose}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-[720px] max-h-[80vh] flex flex-col rounded-xl bg-bg-elevated border border-border-subtle shadow-2xl overflow-hidden',
          'animate-in slide-in-from-bottom-4 duration-[200ms] ease-[cubic-bezier(0.2,0,0,1)]',
        )}
      >
        <header className="h-12 px-4 flex items-center justify-between border-b border-border-subtle flex-shrink-0">
          <h2 id="shortcut-overlay-title" className="text-sm font-semibold text-text-primary">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          {(Object.keys(groups) as Array<keyof typeof groups>).map(g => (
            <section key={g}>
              <h3 className="text-[11px] uppercase tracking-wider font-medium text-text-tertiary mb-3">{GROUP_LABEL[g]}</h3>
              <ul className="space-y-2">
                {groups[g].map(s => (
                  <li key={s.id} className="flex items-center justify-between h-7">
                    <span className="text-[13px] text-text-secondary">{s.description}</span>
                    <KeyChord display={s.display} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="px-4 h-10 border-t border-border-subtle flex items-center justify-end text-[11px] text-text-tertiary flex-shrink-0">
          Tip: open this anytime with <kbd className="mx-1 px-1.5 py-0.5 rounded bg-bg-active border border-border-subtle font-sans text-[11px]">?</kbd>
        </footer>
      </div>
    </div>
  );
}

function KeyChord({ display }: { display: string }) {
  const parts = display.split(' ');
  return (
    <span className="flex items-center gap-1" aria-label={`Shortcut: ${display}`}>
      {parts.map((p, i) => (
        <kbd
          key={i}
          className="font-sans text-[11px] px-1.5 h-6 min-w-[24px] flex items-center justify-center rounded bg-bg-active border border-border-subtle text-text-primary"
        >
          {p}
        </kbd>
      ))}
    </span>
  );
}
