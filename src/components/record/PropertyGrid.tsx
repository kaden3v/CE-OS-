import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { PropertyDef } from './types';

/**
 * Two-column-style property list (label / value). The "grid" is actually
 * a stacked list at this width; the visual layout matches Linear/Attio.
 *
 * Inline editing: click value → editable. Blur or Enter to save. Esc cancels.
 * Optimistic: value updates immediately; rolls back if onCommit throws.
 */
export function PropertyGrid<T>({ record, properties, onError }: {
  record: T;
  properties: PropertyDef<T>[];
  onError?: (msg: string) => void;
}) {
  return (
    <dl className="space-y-px">
      {properties.map(p => (
        <PropertyRow key={p.id} record={record} prop={p} onError={onError} />
      ))}
    </dl>
  );
}

function PropertyRow<T>({ record, prop, onError }: {
  record: T;
  prop: PropertyDef<T>;
  onError?: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState<any>(undefined);
  const value = optimistic !== undefined ? optimistic : prop.value(record);
  const readOnly = !prop.onCommit || prop.type === 'readonly';

  const commit = async (next: any) => {
    if (readOnly || next === value) { setEditing(false); return; }
    setOptimistic(next);
    setPending(true);
    try {
      await prop.onCommit!(record, next);
    } catch (e: any) {
      setOptimistic(undefined); // rollback
      onError?.(e?.message ?? 'Update failed');
    } finally {
      setPending(false);
      setEditing(false);
    }
  };

  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-2 px-2 py-1.5 rounded hover:bg-bg-hover/40 group/p transition-colors duration-[120ms]">
      <dt className="text-[12px] text-text-tertiary pt-0.5">{prop.label}</dt>
      <dd className="text-[13px] text-text-primary min-h-[20px] relative">
        {editing && !readOnly ? (
          <Editor type={prop.type} initial={value} options={prop.options} onCommit={commit} onCancel={() => setEditing(false)} />
        ) : (
          <button
            type="button"
            onClick={() => !readOnly && setEditing(true)}
            disabled={readOnly}
            className={cn(
              'text-left w-full rounded px-1 -mx-1 py-0.5',
              !readOnly && 'cursor-text hover:bg-bg-elevated',
              pending && 'opacity-60',
            )}
            aria-label={`${prop.label}: ${formatDisplay(value, prop)}`}
          >
            {formatDisplay(value, prop)}
          </button>
        )}
      </dd>
    </div>
  );
}

function formatDisplay(v: any, prop: PropertyDef<any>) {
  if (v == null || v === '') return <span className="text-text-tertiary">—</span>;
  if (prop.type === 'select' && prop.options) {
    return prop.options.find(o => o.value === v)?.label ?? String(v);
  }
  if (prop.type === 'status') {
    const tone = String(v).toLowerCase();
    const color = tone.includes('alert') || tone.includes('err') ? 'bg-status-alert'
      : tone.includes('warn') ? 'bg-status-warn'
      : tone.includes('ok') || tone.includes('success') ? 'bg-status-ok'
      : 'bg-status-info';
    return (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className={cn('w-2 h-2 rounded-full', color)} />
        <span>{String(v)}</span>
      </span>
    );
  }
  return String(v);
}

function Editor({ type, initial, options, onCommit, onCancel }: {
  type: PropertyDef<any>['type'];
  initial: any;
  options?: Array<{ value: string; label: string }>;
  onCommit: (v: any) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial ?? '');
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => { inputRef.current?.focus(); (inputRef.current as any)?.select?.(); }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); onCommit(v); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  if (type === 'select' && options) {
    return (
      <select
        ref={inputRef as any}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onCommit(v)}
        onKeyDown={onKey}
        className="w-full h-7 px-1 rounded bg-bg-elevated border border-accent-brand text-[13px] text-text-primary focus:outline-none"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input
      ref={inputRef as any}
      type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={onKey}
      className="w-full h-7 px-1 rounded bg-bg-elevated border border-accent-brand text-[13px] text-text-primary focus:outline-none"
    />
  );
}
