import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Calendar as CalendarIcon, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolve, type PeriodInput } from '@/lib/finance/period';
import type { PeriodSelection } from '@/lib/finance/types';

/**
 * The one period selector used across every finance page.
 *
 * Emits PeriodSelection: current range + the immediate prior comparable range
 * so consuming pages can render delta indicators without recomputing.
 */
export function PeriodPicker({
  value, onChange, accountingMethod, fiscalYearStartMonth = 1,
}: {
  value: PeriodSelection;
  onChange: (next: PeriodSelection, input: PeriodInput) => void;
  accountingMethod?: 'cash' | 'accrual';
  fiscalYearStartMonth?: number;
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

  const today = new Date();
  const y = today.getFullYear();
  const q = (Math.ceil((today.getMonth() + 1) / 3)) as 1 | 2 | 3 | 4;

  const presets: Array<{ label: string; input: PeriodInput }> = [
    { label: 'Month to date',      input: { kind: 'mtd' } },
    { label: 'Quarter to date',    input: { kind: 'qtd' } },
    { label: fiscalYearStartMonth === 1 ? 'Year to date' : 'Fiscal YTD', input: { kind: 'ytd', fiscalYearStartMonth } },
    { label: 'This month',         input: { kind: 'month', year: y, month: today.getMonth() + 1 } },
    { label: 'Last month',         input: { kind: 'month', year: today.getMonth() === 0 ? y - 1 : y, month: today.getMonth() === 0 ? 12 : today.getMonth() } },
    { label: `Q${q} ${y}`,         input: { kind: 'quarter', year: y, quarter: q } },
    { label: `${y}`,               input: { kind: 'year', year: y } },
    { label: `${y - 1}`,           input: { kind: 'year', year: y - 1 } },
  ];

  const select = (input: PeriodInput) => {
    onChange(resolve(input), input);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'h-8 px-3 inline-flex items-center gap-2 rounded-md border border-border-subtle bg-bg-elevated',
          'text-[13px] text-text-primary hover:bg-bg-hover hover:border-border-strong',
          'transition-colors duration-[120ms]',
        )}
      >
        <CalendarIcon className="w-3.5 h-3.5 text-text-tertiary" strokeWidth={1.5} />
        <span className="font-medium">{value.current.label}</span>
        {accountingMethod && (
          <span className="text-[11px] text-text-tertiary border-l border-border-subtle pl-2 ml-1 uppercase tracking-wider">
            {accountingMethod}
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-1 z-30 min-w-[240px] bg-bg-elevated border border-border-subtle rounded-lg shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-[120ms]"
        >
          {presets.map(p => {
            const next = resolve(p.input);
            const active = next.current.label === value.current.label;
            return (
              <button
                key={p.label}
                role="menuitem"
                onClick={() => select(p.input)}
                className="w-full px-3 h-8 flex items-center justify-between text-[13px] text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
              >
                <span>{p.label}</span>
                {active && <Check className="w-3.5 h-3.5 text-accent-brand" />}
              </button>
            );
          })}
          <CustomRangePicker onSelect={select} />
        </div>
      )}
    </div>
  );
}

function CustomRangePicker({ onSelect }: { onSelect: (input: PeriodInput) => void }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  return (
    <div className="border-t border-border-subtle px-3 py-2 mt-1">
      <div className="text-[11px] uppercase tracking-wider font-medium text-text-tertiary mb-1.5">Custom range</div>
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="h-7 w-full px-1.5 rounded bg-bg-base border border-border-subtle text-[12px] text-text-primary focus:outline-none focus:border-accent-brand"
          aria-label="Start date"
        />
        <span className="text-text-tertiary text-[11px]">→</span>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="h-7 w-full px-1.5 rounded bg-bg-base border border-border-subtle text-[12px] text-text-primary focus:outline-none focus:border-accent-brand"
          aria-label="End date"
        />
        <button
          disabled={!start || !end || start > end}
          onClick={() => onSelect({ kind: 'custom', start, end })}
          className="h-7 px-2 rounded bg-accent-brand text-bg-base text-[12px] font-medium disabled:opacity-30 transition-opacity duration-[120ms]"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
