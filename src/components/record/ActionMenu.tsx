import { useState, useEffect, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActionItem } from './types';

export function ActionMenu<T>({ record, actions, onConfirm }: {
  record: T;
  actions: ActionItem<T>[];
  /** Caller wires up confirm flow for actions with a `confirm` config. */
  onConfirm: (action: ActionItem<T>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const applicable = actions.filter(a => !a.applies || a.applies(record));
  const normal = applicable.filter(a => !a.destructive && !a.primary);
  const destructive = applicable.filter(a => a.destructive);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
      >
        <MoreHorizontal className="w-4 h-4" strokeWidth={1.5} />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full right-0 mt-1 z-30 min-w-[220px]',
            'bg-bg-elevated border border-border-subtle rounded shadow-2xl py-1',
            'animate-in fade-in zoom-in-95 duration-[120ms]',
          )}
        >
          {normal.map(a => (
            <ActionRow
              key={a.id}
              action={a}
              onSelect={() => { setOpen(false); a.confirm ? onConfirm(a) : a.run(record); }}
            />
          ))}
          {destructive.length > 0 && normal.length > 0 && (
            <div role="separator" className="my-1 border-t border-border-subtle" />
          )}
          {destructive.map(a => (
            <ActionRow
              key={a.id}
              action={a}
              onSelect={() => { setOpen(false); a.confirm ? onConfirm(a) : a.run(record); }}
              destructive
            />
          ))}
          {applicable.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-text-tertiary">No actions available</div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionRow<T>({ action, onSelect, destructive }: {
  action: ActionItem<T>;
  onSelect: () => void;
  destructive?: boolean;
}) {
  const Icon = action.icon;
  return (
    <button
      role="menuitem"
      onClick={onSelect}
      className={cn(
        'w-full px-3 h-8 flex items-center gap-2 text-[13px] text-left transition-colors duration-[120ms]',
        destructive ? 'text-status-alert hover:bg-status-alert/10' : 'text-text-primary hover:bg-bg-hover',
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />}
      <span className="flex-1">{action.label}</span>
      {action.shortcut && (
        <kbd className="text-[11px] px-1.5 py-0.5 rounded bg-bg-active border border-border-subtle text-text-tertiary font-sans">{action.shortcut}</kbd>
      )}
    </button>
  );
}
