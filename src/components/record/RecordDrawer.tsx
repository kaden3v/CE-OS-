import { useState, useEffect, useRef, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { PropertyGrid } from './PropertyGrid';
import { ActionMenu } from './ActionMenu';
import { ConfirmModal } from './ConfirmModal';
import type { ActionItem, RecordDrawerConfig } from './types';
import { useApp } from '@/contexts/AppContext';

/**
 * The one record-view pattern. Right-side drawer, 640px wide, full-height.
 * Overlays the current view; URL updates to deep-link the record; closing
 * returns to the list with scroll preserved (the consumer handles the URL).
 */
export function RecordDrawer<T>({
  open, record, config, onClose, onPrev, onNext,
}: {
  open: boolean;
  record: T | null;
  config: RecordDrawerConfig<T>;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(open && !!record);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [confirmFor, setConfirmFor] = useState<ActionItem<T> | null>(null);
  const { addToast } = useApp();

  // esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmFor) { e.preventDefault(); onClose(); }
      if (!confirmFor && (e.target as HTMLElement | null)?.tagName !== 'INPUT' && (e.target as HTMLElement | null)?.tagName !== 'TEXTAREA') {
        if (e.key === 'j' && onNext) { e.preventDefault(); onNext(); }
        if (e.key === 'k' && onPrev) { e.preventDefault(); onPrev(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onNext, onPrev, confirmFor]);

  useEffect(() => { setActiveTab('overview'); }, [record]);

  if (!record) return null;

  const status = config.status?.(record);
  const tabs = config.tabs ?? [];
  const allTabs = [{ id: 'overview', label: 'Overview' }, ...tabs.map(t => ({ id: t.id, label: t.label }))];
  const applicable = config.actions.filter(a => !a.applies || a.applies(record));
  const primary = applicable.find(a => a.primary);
  const secondaries = applicable.filter(a => a !== primary);

  return (
    <>
      <div
        role="presentation"
        className={cn(
          'fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]',
          open ? 'animate-in fade-in duration-[160ms]' : 'animate-out fade-out',
        )}
        onClick={onClose}
      />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="drawer-title"
        className={cn(
          'fixed top-0 right-0 bottom-0 z-50 w-[640px] max-w-[100vw] flex flex-col',
          'bg-bg-base border-l border-border-subtle shadow-2xl',
          open ? 'animate-in slide-in-from-right duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]' : '',
        )}
      >
        {/* Header */}
        <header className="h-16 flex items-center px-4 gap-2 border-b border-border-subtle flex-shrink-0">
          <EditableTitle
            value={config.title(record)}
            onCommit={config.onTitleCommit ? (next) => config.onTitleCommit!(record, next) : undefined}
          />
          {status && <StatusChip {...status} />}
          <div className="flex-1" />
          {primary && (
            <button
              onClick={() => primary.confirm ? setConfirmFor(primary) : primary.run(record)}
              className="h-8 px-3 rounded bg-accent-brand text-bg-base text-[13px] font-medium hover:opacity-90 transition-opacity duration-[120ms]"
            >
              {primary.label}
            </button>
          )}
          <ActionMenu record={record} actions={secondaries} onConfirm={(a) => setConfirmFor(a)} />
          <button
            onClick={onClose}
            aria-label="Close (esc)"
            className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        {/* Tabs */}
        <nav role="tablist" aria-label="Record sections" className="h-8 flex items-center gap-1 px-2 border-b border-border-subtle flex-shrink-0">
          {allTabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'h-8 px-2.5 text-[12px] font-medium relative transition-colors duration-[120ms]',
                activeTab === t.id ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              {t.label}
              {activeTab === t.id && (
                <span
                  aria-hidden
                  className="absolute left-2.5 right-2.5 bottom-0 h-[2px]"
                  style={{ background: 'var(--color-accent-brand)' }}
                />
              )}
            </button>
          ))}
        </nav>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview' ? (
            <div className="grid grid-cols-[300px_1fr] gap-4 p-4 min-h-full">
              <section aria-label="Properties">
                <PropertyGrid record={record} properties={config.properties} onError={(msg) => addToast({ title: msg, status: 'alert' })} />
              </section>
              <section className="text-[13px] text-text-secondary leading-[1.6]">
                {config.overviewBody?.(record)}
              </section>
            </div>
          ) : (
            <div className="p-4 h-full">
              {tabs.find(t => t.id === activeTab)?.content(record)}
            </div>
          )}
        </div>
      </div>

      {confirmFor && (
        <ConfirmModal
          open
          title={confirmFor.confirm!.title}
          typeToConfirm={confirmFor.confirm!.typeToConfirm}
          confirmLabel={confirmFor.confirm!.confirmLabel}
          onCancel={() => setConfirmFor(null)}
          onConfirm={async () => { await confirmFor.run(record); setConfirmFor(null); }}
        />
      )}
    </>
  );
}

function EditableTitle({ value, onCommit }: { value: string; onCommit?: (next: string) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!onCommit) return <h2 id="drawer-title" className="text-[16px] font-semibold text-text-primary truncate">{value}</h2>;

  return editing ? (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onCommit(draft); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') { setDraft(value); setEditing(false); }
      }}
      className="text-[16px] font-semibold text-text-primary bg-bg-elevated border border-accent-brand rounded px-1 py-0.5 focus:outline-none min-w-0 flex-1"
      aria-label="Edit title"
    />
  ) : (
    <button
      id="drawer-title"
      onClick={() => setEditing(true)}
      className="text-[16px] font-semibold text-text-primary truncate text-left rounded px-1 py-0.5 -mx-1 hover:bg-bg-hover transition-colors duration-[120ms]"
    >
      {value}
    </button>
  );
}

function StatusChip({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'alert' | 'info' | 'neutral' }) {
  const cls = {
    ok:      'bg-status-ok/15 text-status-ok',
    warn:    'bg-status-warn/15 text-status-warn',
    alert:   'bg-status-alert/15 text-status-alert',
    info:    'bg-status-info/15 text-status-info',
    neutral: 'bg-bg-elevated text-text-secondary',
  }[tone];
  return (
    <span className={cn('h-6 px-2 inline-flex items-center rounded-full text-[11px] font-medium tracking-wide', cls)}>
      {label}
    </span>
  );
}
