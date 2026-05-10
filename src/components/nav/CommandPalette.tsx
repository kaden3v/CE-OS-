import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, ArrowRight, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import {
  routesAsCommands,
  actions as registryActions,
  type Action,
  type ActionContext,
} from '@/lib/nav/registry';

const RECENT_KEY = 'ce-os.palette.recent';
const MAX_RECENT = 5;

type IndexedRecord = { id: string; type: 'order' | 'product' | 'customer'; label: string; href: string };

// Mock record index — in production this would be a server-backed search.
// Kept here to demonstrate the "records" group in the palette.
const RECORD_INDEX: IndexedRecord[] = [
  { id: 'ORD-1284', type: 'order', label: 'Order #1284', href: '/orders' },
  { id: 'ORD-1283', type: 'order', label: 'Order #1283', href: '/orders' },
  { id: 'P-PIROUETTE', type: 'product', label: "P. 'Pirouette'", href: '/cultivars' },
  { id: 'P-AGNATA', type: 'product', label: 'P. agnata', href: '/cultivars' },
  { id: 'CUST-SARAH', type: 'customer', label: 'Sarah Chen', href: '/customers' },
  { id: 'CUST-MARCUS', type: 'customer', label: 'Marcus Aldana', href: '/customers' },
];

type Item = {
  id: string;
  label: string;
  group: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onSelect: (ctx: ActionContext) => void;
  /** If set, selecting enters arg-mode with this placeholder. */
  argument?: { placeholder: string; run: (ctx: ActionContext, arg: string) => void };
};

export function CommandPalette() {
  const { isCommandPaletteOpen, setCommandPaletteOpen, addToast } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [argMode, setArgMode] = useState<Item | null>(null);
  const [argValue, setArgValue] = useState('');
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const trapRef = useFocusTrap<HTMLDivElement>(isCommandPaletteOpen);

  // Reset state on close
  useEffect(() => {
    if (!isCommandPaletteOpen) {
      setQuery(''); setCursor(0); setArgMode(null); setArgValue('');
    } else {
      // First paint, then focus
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isCommandPaletteOpen]);

  const ctx: ActionContext = useMemo(() => ({
    navigate: (p) => { navigate(p); close(); },
    toast: (title, status = 'info') => addToast({ title, status }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [navigate]);

  const items = useMemo<Item[]>(() => buildItems(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Empty state: show recent first, then top-level navigation.
      const recents = recent
        .map(id => items.find(i => i.id === id))
        .filter((x): x is Item => !!x)
        .map(i => ({ ...i, group: 'Recent' }));
      const top = items.filter(i => i.group === 'Navigation').slice(0, 6);
      return [...recents, ...top];
    }
    return items
      .map(i => ({ i, score: score(i, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map(x => x.i);
  }, [query, items, recent]);

  const grouped = useMemo(() => groupBy(filtered, i => i.group), [filtered]);

  // Reset cursor when results change
  useEffect(() => { setCursor(0); }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector('[data-active="true"]') as HTMLElement | null;
    active?.scrollIntoView({ block: 'nearest' });
  }, [cursor, filtered]);

  function close() { setCommandPaletteOpen(false); }

  function commit(item: Item) {
    if (item.argument) {
      setArgMode(item);
      setArgValue('');
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    pushRecent(item.id);
    setRecent(loadRecent());
    item.onSelect(ctx);
  }

  function commitArg() {
    if (!argMode || !argMode.argument) return;
    argMode.argument.run(ctx, argValue.trim());
    pushRecent(argMode.id);
    setRecent(loadRecent());
    close();
  }

  if (!isCommandPaletteOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className={cn(
        'fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] px-4',
        'bg-black/50 backdrop-blur-sm',
        'animate-in fade-in duration-[120ms]',
      )}
      onClick={close}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-[640px] rounded-xl overflow-hidden shadow-2xl border border-border-subtle',
          // Signature pattern: palette is dark even in light mode.
          'bg-[#0E0F11] text-[#E8E9EA]',
          'animate-in slide-in-from-top-4 duration-[200ms] ease-[cubic-bezier(0.2,0,0,1)]',
        )}
      >
        {/* Input row */}
        <div className="flex items-center px-3 h-12 border-b border-white/[0.06]">
          <Search className="w-4 h-4 text-[#9CA0A6] flex-shrink-0" strokeWidth={1.5} />
          {argMode ? (
            <div className="flex items-center gap-2 ml-2 px-2 h-7 rounded bg-white/[0.06] text-[12px] text-[#E8E9EA]">
              <span>{argMode.label}</span>
              <ArrowRight className="w-3 h-3 text-[#9CA0A6]" />
            </div>
          ) : null}
          <input
            ref={inputRef}
            value={argMode ? argValue : query}
            onChange={(e) => argMode ? setArgValue(e.target.value) : setQuery(e.target.value)}
            placeholder={argMode?.argument?.placeholder ?? 'Type a command, search records, or jump anywhere…'}
            className="flex-1 ml-2 bg-transparent border-none outline-none text-[14px] placeholder:text-[#5C6066]"
            aria-label={argMode ? 'Argument input' : 'Command search'}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (argMode) { setArgMode(null); setArgValue(''); }
                else close();
              } else if (e.key === 'ArrowDown' && !argMode) {
                e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp' && !argMode) {
                e.preventDefault(); setCursor(c => Math.max(c - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (argMode) commitArg();
                else if (filtered[cursor]) commit(filtered[cursor]);
              }
            }}
          />
          <kbd className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.06] text-[#9CA0A6] font-sans">esc</kbd>
        </div>

        {/* Results */}
        {!argMode && (
          <div ref={listRef} className="max-h-[420px] overflow-y-auto py-1" role="listbox" aria-label="Results">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-[#9CA0A6]">
                No results for <span className="text-[#E8E9EA]">"{query}"</span>
              </div>
            ) : (
              Object.entries(grouped).map(([group, list]) => (
                <div key={group} className="py-1">
                  <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider font-medium text-[#5C6066]">{group}</div>
                  {list.map((item) => {
                    const idx = filtered.indexOf(item);
                    const active = idx === cursor;
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.id}
                        role="option"
                        aria-selected={active}
                        data-active={active}
                        onMouseEnter={() => setCursor(idx)}
                        onClick={() => commit(item)}
                        className={cn(
                          'mx-1 px-2 h-8 flex items-center gap-2 rounded text-[13px] cursor-pointer',
                          active ? 'bg-white/[0.08] text-[#E8E9EA]' : 'text-[#C8CACD] hover:bg-white/[0.04]',
                        )}
                      >
                        {Icon && <Icon className="w-4 h-4 text-[#9CA0A6] flex-shrink-0" strokeWidth={1.5} />}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.hint && <span className="text-[11px] text-[#5C6066]">{item.hint}</span>}
                        {item.argument && <ArrowRight className="w-3 h-3 text-[#5C6066]" />}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}

        {argMode && (
          <div className="px-4 py-3 text-[12px] text-[#9CA0A6] flex items-center gap-2">
            <CornerDownLeft className="w-3.5 h-3.5" />
            Press enter to run with <span className="text-[#E8E9EA]">"{argValue || '…'}"</span>
          </div>
        )}

        {/* Footer */}
        <div className="px-3 h-9 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#5C6066]">
          <span className="flex items-center gap-3">
            <Hint k="↑ ↓" l="navigate" />
            <Hint k="↵" l="select" />
            <Hint k="⌘K" l="toggle" />
          </span>
          <span>{filtered.length} {filtered.length === 1 ? 'result' : 'results'}</span>
        </div>
      </div>
    </div>
  );
}

function Hint({ k, l }: { k: string; l: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.04] font-sans text-[11px]">{k}</kbd>
      <span>{l}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Item assembly + scoring
// ─────────────────────────────────────────────────────────────────────────────

function buildItems(): Item[] {
  const nav: Item[] = routesAsCommands().map(a => ({
    id: a.id,
    label: a.label,
    group: 'Navigation',
    icon: a.icon as any,
    onSelect: (ctx) => a.run(ctx),
  }));

  const acts: Item[] = registryActions.map(a => ({
    id: a.id,
    label: a.label,
    group: groupLabel(a.group),
    icon: a.icon as any,
    onSelect: (ctx) => { if (!a.takesArgument) a.run(ctx); },
    argument: a.takesArgument ? { placeholder: a.argumentPlaceholder ?? 'argument…', run: a.run } : undefined,
  }));

  const records: Item[] = RECORD_INDEX.map(r => ({
    id: `record:${r.id}`,
    label: r.label,
    group: 'Records',
    hint: r.type,
    onSelect: (ctx) => ctx.navigate(`${r.href}?id=${r.id}`),
  }));

  return [...nav, ...acts, ...records];
}

function groupLabel(g: Action['group']): string {
  switch (g) {
    case 'navigation': return 'Navigation';
    case 'create':     return 'Create';
    case 'agents':     return 'Agents';
    case 'system':     return 'System';
    case 'recent':     return 'Recent';
  }
}

function score(item: Item, q: string): number {
  const hay = item.label.toLowerCase();
  if (!q) return 1;
  if (hay === q) return 1000;
  if (hay.startsWith(q)) return 500;
  if (hay.includes(q)) return 200;
  // word-prefix
  if (hay.split(/\s+/).some(w => w.startsWith(q))) return 100;
  // subsequence match
  let qi = 0;
  for (let i = 0; i < hay.length && qi < q.length; i++) if (hay[i] === q[qi]) qi++;
  if (qi === q.length) return 20;
  return 0;
}

function groupBy<T>(arr: T[], fn: (x: T) => string): { [k: string]: T[] } {
  const out: { [k: string]: T[] } = {};
  for (const item of arr) {
    const k = fn(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function pushRecent(id: string) {
  try {
    const list = loadRecent().filter(x => x !== id);
    list.unshift(id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}
