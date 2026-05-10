import {
  useCallback, useEffect, useMemo, useRef, useState, ReactNode, KeyboardEvent,
} from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, ChevronRight, MoreHorizontal, Plus, Search, X, AlertCircle } from 'lucide-react';
import type { ColumnDef, DataTableState, FilterValue, SortRule } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

function loadState<T>(key: string): Partial<DataTableState<T>> | null {
  try { return JSON.parse(localStorage.getItem(`ce-os.table.${key}`) || 'null'); } catch { return null; }
}
function saveState<T>(key: string, state: Partial<DataTableState<T>>) {
  try { localStorage.setItem(`ce-os.table.${key}`, JSON.stringify(state)); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export type DataTableProps<TRow> = {
  /** Persistence key — column widths, sort, filters, hidden cols saved per key. */
  storageKey: string;
  rows: TRow[];
  columns: ColumnDef<TRow>[];
  getRowId: (row: TRow) => string;

  /** Loading / error / empty states owned by the table. */
  isLoading?: boolean;
  isError?: { message: string; onRetry?: () => void } | null;

  /** Empty-state customization. */
  emptyState?: {
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
  };

  density?: 'default' | 'compact';

  /** Click handlers — row click typically opens the record drawer. */
  onRowOpen?: (row: TRow) => void;

  /** Selection. If omitted, selection UI is hidden. */
  onSelectionChange?: (selectedIds: string[]) => void;
  bulkActions?: BulkAction<TRow>[];

  /** Search default value. ⌘F focuses the input. */
  defaultSearch?: string;

  /** Virtualize when rows exceed this count (default 200). */
  virtualizeThreshold?: number;

  /** Per-row aria-label provider. */
  rowLabel?: (row: TRow) => string;
};

export type BulkAction<TRow> = {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  destructive?: boolean;
  run: (rows: TRow[]) => void;
};

export function DataTable<TRow extends Record<string, any>>({
  storageKey,
  rows,
  columns: initialColumns,
  getRowId,
  isLoading = false,
  isError = null,
  emptyState,
  density = 'default',
  onRowOpen,
  onSelectionChange,
  bulkActions = [],
  defaultSearch = '',
  virtualizeThreshold = 200,
  rowLabel,
}: DataTableProps<TRow>) {
  // ── State ───────────────────────────────────────────────────────────────
  const persisted = loadState<TRow>(storageKey);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<string[]>(persisted?.hiddenColumnIds ?? []);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(persisted?.columnWidths ?? {});
  const [sort, setSort] = useState<SortRule<TRow>[]>(persisted?.sort ?? []);
  const [filters, setFilters] = useState<FilterValue[]>(persisted?.filters ?? []);
  const [groupBy, setGroupBy] = useState<string | null>(persisted?.groupBy ?? null);
  const [search, setSearch] = useState(defaultSearch);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedRow, setFocusedRow] = useState<number>(-1);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [columnMenuFor, setColumnMenuFor] = useState<string | null>(null);

  useEffect(() => {
    saveState(storageKey, { hiddenColumnIds, columnWidths, sort, filters, groupBy });
  }, [storageKey, hiddenColumnIds, columnWidths, sort, filters, groupBy]);

  // ── Derived data ────────────────────────────────────────────────────────
  const visibleColumns = useMemo(
    () => initialColumns.filter(c => !hiddenColumnIds.includes(c.id)),
    [initialColumns, hiddenColumnIds],
  );

  const processedRows = useMemo(() => {
    let out = rows;
    // Search (case-insensitive substring across stringified row).
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(r =>
        visibleColumns.some(c => {
          const v = (c.accessor ? r[c.accessor] : r[c.id]);
          return v != null && String(v).toLowerCase().includes(q);
        }),
      );
    }
    // Filters
    for (const f of filters) {
      out = out.filter(r => evalFilter(r, f));
    }
    // Sort
    if (sort.length) {
      out = [...out].sort((a, b) => {
        for (const s of sort) {
          const av = a[s.columnId]; const bv = b[s.columnId];
          if (av === bv) continue;
          const ord = av > bv ? 1 : -1;
          return s.dir === 'asc' ? ord : -ord;
        }
        return 0;
      });
    }
    return out;
  }, [rows, search, filters, sort, visibleColumns]);

  // Grouping
  const groupedRows = useMemo(() => {
    if (!groupBy) return [{ key: null as string | null, rows: processedRows }];
    const map = new Map<string, TRow[]>();
    for (const r of processedRows) {
      const key = String(r[groupBy] ?? '—');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).map(([key, rs]) => ({ key, rows: rs }));
  }, [processedRows, groupBy]);

  // ── Selection ───────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string, shift: boolean, anchorIdx: number, idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (shift && anchorIdx >= 0) {
        const [lo, hi] = anchorIdx < idx ? [anchorIdx, idx] : [idx, anchorIdx];
        for (let i = lo; i <= hi; i++) next.add(getRowId(processedRows[i]));
      } else {
        next.has(id) ? next.delete(id) : next.add(id);
      }
      onSelectionChange?.(Array.from(next));
      return next;
    });
  }, [processedRows, getRowId, onSelectionChange]);

  const selectAllVisible = useCallback(() => {
    const all = processedRows.map(getRowId);
    setSelected(prev => {
      const isAll = all.every(id => prev.has(id));
      const next = new Set(isAll ? [] : all);
      onSelectionChange?.(Array.from(next));
      return next;
    });
  }, [processedRows, getRowId, onSelectionChange]);

  const clearSelection = () => { setSelected(new Set()); onSelectionChange?.([]); };

  // ── Sort helpers ───────────────────────────────────────────────────────
  const toggleSort = (id: string, shift: boolean) => {
    setSort(prev => {
      const existing = prev.find(s => s.columnId === id);
      if (!shift) {
        if (!existing) return [{ columnId: id, dir: 'asc' }];
        if (existing.dir === 'asc') return [{ columnId: id, dir: 'desc' }];
        return [];
      }
      // multi-sort with shift
      if (!existing) return [...prev, { columnId: id, dir: 'asc' }];
      if (existing.dir === 'asc') return prev.map(s => s.columnId === id ? { ...s, dir: 'desc' } : s);
      return prev.filter(s => s.columnId !== id);
    });
  };

  // ── Keyboard nav ────────────────────────────────────────────────────────
  const tableRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectAnchor = useRef<number>(-1);

  const flatRows = useMemo(() => groupedRows.flatMap(g => g.rows), [groupedRows]);

  const onTableKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;

    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedRow(i => Math.min(i + 1, flatRows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedRow(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && focusedRow >= 0) { e.preventDefault(); onRowOpen?.(flatRows[focusedRow]); }
    else if (e.key === 'x' && focusedRow >= 0) {
      e.preventDefault();
      const r = flatRows[focusedRow];
      toggleSelect(getRowId(r), false, selectAnchor.current, focusedRow);
      selectAnchor.current = focusedRow;
    }
    else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); selectAllVisible(); }
    else if (e.key === 'f' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); searchRef.current?.focus(); }
  };

  // ── Render helpers ─────────────────────────────────────────────────────
  const rowHeight = density === 'compact' ? 28 : 32;

  const showSelectionBar = selected.size > 0 && bulkActions.length > 0;

  // Body content branching on state
  let body: ReactNode;
  if (isError) body = <ErrorBanner message={isError.message} onRetry={isError.onRetry} columnCount={visibleColumns.length} />;
  else if (isLoading) body = <SkeletonRows count={8} rowHeight={rowHeight} columns={visibleColumns} />;
  else if (rows.length === 0 && emptyState) body = <EmptyStateBlock variant="no-data" title={emptyState.title} description={emptyState.description} action={emptyState.action} columnCount={visibleColumns.length} />;
  else if (processedRows.length === 0) body = (
    <EmptyStateBlock
      variant={filters.length || search ? 'filtered' : 'no-matches'}
      title={filters.length || search ? 'No rows match your filters' : 'No results'}
      description={filters.length || search ? 'Try removing a filter or clearing search.' : undefined}
      action={(filters.length || search) ? { label: 'Clear filters', onClick: () => { setFilters([]); setSearch(''); } } : undefined}
      columnCount={visibleColumns.length}
    />
  );
  else body = (
    <TableBody
      groups={groupedRows}
      columns={visibleColumns}
      columnWidths={columnWidths}
      getRowId={getRowId}
      onRowOpen={onRowOpen}
      selected={selected}
      onToggleSelect={(id, e, idx) => { toggleSelect(id, e.shiftKey, selectAnchor.current, idx); selectAnchor.current = idx; }}
      focusedRow={focusedRow}
      openGroups={openGroups}
      onToggleGroup={(k) => setOpenGroups(s => ({ ...s, [k]: !s[k] }))}
      groupBy={groupBy}
      rowHeight={rowHeight}
      virtualize={flatRows.length > virtualizeThreshold}
      showSelection={!!onSelectionChange}
      rowLabel={rowLabel}
      scrollContainerRef={scrollRef}
    />
  );

  return (
    <div
      ref={tableRef}
      tabIndex={0}
      onKeyDown={onTableKeyDown}
      className="flex flex-col w-full focus:outline-none"
      role="region"
      aria-label="Data table"
    >
      <TableToolbar
        search={search}
        onSearch={setSearch}
        searchRef={searchRef}
        filters={filters}
        onAddFilter={(f) => setFilters([...filters, f])}
        onRemoveFilter={(i) => setFilters(filters.filter((_, j) => j !== i))}
        columns={initialColumns}
      />
      <div className="border border-border-subtle rounded-lg overflow-hidden bg-bg-base">
        <div ref={scrollRef} className="overflow-auto max-h-[calc(100vh-220px)]">
          <table className={cn('w-full text-left', density === 'compact' && 'text-[12px]')} style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead className="bg-bg-base sticky top-0 z-10">
              <tr>
                {onSelectionChange && (
                  <th
                    className="w-9 px-2 border-b border-border-subtle sticky left-0 bg-bg-base z-10"
                    style={{ height: 36 }}
                    scope="col"
                  >
                    <input
                      type="checkbox"
                      aria-label="Select all visible rows"
                      checked={processedRows.length > 0 && processedRows.every(r => selected.has(getRowId(r)))}
                      onChange={selectAllVisible}
                      className="rounded border-border-strong bg-bg-elevated"
                    />
                  </th>
                )}
                {visibleColumns.map((c, i) => {
                  const sortRule = sort.find(s => s.columnId === c.id);
                  const isPinned = c.pin === 'left' || i === 0;
                  return (
                    <th
                      key={c.id}
                      scope="col"
                      className={cn(
                        'px-3 border-b border-border-subtle text-[11px] uppercase tracking-wider font-medium text-text-tertiary group/h relative',
                        c.align === 'right' && 'text-right',
                        c.align === 'center' && 'text-center',
                        isPinned && 'sticky left-0 bg-bg-base z-10',
                      )}
                      style={{ height: 36, width: columnWidths[c.id] ?? c.width, minWidth: c.minWidth ?? 80 }}
                    >
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => c.sortable !== false && toggleSort(c.id, e.shiftKey)}
                          className={cn(
                            'flex items-center gap-1 hover:text-text-secondary transition-colors duration-[120ms]',
                            c.sortable === false && 'cursor-default',
                          )}
                          aria-sort={sortRule ? (sortRule.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <span>{c.header}</span>
                          {sortRule?.dir === 'asc' && <ChevronUp className="w-3 h-3 text-text-secondary" />}
                          {sortRule?.dir === 'desc' && <ChevronDown className="w-3 h-3 text-text-secondary" />}
                        </button>
                        <button
                          onClick={() => setColumnMenuFor(columnMenuFor === c.id ? null : c.id)}
                          className="opacity-0 group-hover/h:opacity-100 ml-auto text-text-tertiary hover:text-text-primary transition-opacity duration-[120ms]"
                          aria-label={`Column menu for ${typeof c.header === 'string' ? c.header : c.id}`}
                        >
                          <MoreHorizontal className="w-3 h-3" />
                        </button>
                      </div>
                      {columnMenuFor === c.id && (
                        <ColumnMenu
                          column={c}
                          onClose={() => setColumnMenuFor(null)}
                          onHide={() => { setHiddenColumnIds(ids => [...ids, c.id]); setColumnMenuFor(null); }}
                          onSort={(dir) => { setSort([{ columnId: c.id, dir }]); setColumnMenuFor(null); }}
                          onGroupBy={() => { setGroupBy(c.id); setColumnMenuFor(null); }}
                        />
                      )}
                      <ColumnResizer
                        onResize={(delta) => {
                          const next = Math.max(c.minWidth ?? 80, (columnWidths[c.id] ?? c.width ?? 160) + delta);
                          setColumnWidths(w => ({ ...w, [c.id]: next }));
                        }}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>{body}</tbody>
          </table>
        </div>
      </div>

      {/* Hidden-column chips */}
      {hiddenColumnIds.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-text-tertiary">
          <span>Hidden:</span>
          {hiddenColumnIds.map(id => {
            const c = initialColumns.find(x => x.id === id);
            return (
              <button
                key={id}
                onClick={() => setHiddenColumnIds(ids => ids.filter(x => x !== id))}
                className="px-2 h-6 rounded border border-border-subtle hover:bg-bg-hover transition-colors duration-[120ms]"
              >
                + {typeof c?.header === 'string' ? c.header : id}
              </button>
            );
          })}
        </div>
      )}

      {showSelectionBar && (
        <BulkActionBar
          count={selected.size}
          actions={bulkActions}
          onClear={clearSelection}
          onRun={(action) => { action.run(rows.filter(r => selected.has(getRowId(r)))); clearSelection(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Body & rows
// ─────────────────────────────────────────────────────────────────────────────

function TableBody<TRow>({
  groups, columns, columnWidths, getRowId, onRowOpen,
  selected, onToggleSelect, focusedRow, openGroups, onToggleGroup, groupBy,
  rowHeight, virtualize, showSelection, rowLabel, scrollContainerRef,
}: {
  groups: Array<{ key: string | null; rows: TRow[] }>;
  columns: ColumnDef<TRow>[];
  columnWidths: Record<string, number>;
  getRowId: (row: TRow) => string;
  onRowOpen?: (row: TRow) => void;
  selected: Set<string>;
  onToggleSelect: (id: string, e: { shiftKey: boolean }, idx: number) => void;
  focusedRow: number;
  openGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
  groupBy: string | null;
  rowHeight: number;
  virtualize: boolean;
  showSelection: boolean;
  rowLabel?: (row: TRow) => string;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
}) {
  // Manual windowing for very large tables (no react-window dependency).
  // When virtualize=false, render everything.
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  useEffect(() => {
    if (!virtualize) return;
    const parent = scrollContainerRef.current;
    if (!parent) return;
    setViewportH(parent.clientHeight);
    const onScroll = () => setScrollTop(parent.scrollTop);
    parent.addEventListener('scroll', onScroll, { passive: true });
    return () => parent.removeEventListener('scroll', onScroll);
  }, [virtualize, scrollContainerRef]);

  let runningIdx = 0;
  const rowsOut: ReactNode[] = [];

  for (const grp of groups) {
    if (groupBy && grp.key !== null) {
      const open = openGroups[grp.key] ?? true;
      rowsOut.push(
        <tr key={`g-${grp.key}`} className="bg-bg-elevated">
          <td colSpan={columns.length + (showSelection ? 1 : 0)} className="px-3 py-2 text-[12px] text-text-secondary">
            <button
              onClick={() => onToggleGroup(grp.key as string)}
              className="flex items-center gap-1 hover:text-text-primary transition-colors duration-[120ms]"
              aria-expanded={open}
            >
              <ChevronRight className={cn('w-3 h-3 transition-transform duration-[160ms]', open && 'rotate-90')} />
              <span className="font-medium text-text-primary">{grp.key}</span>
              <span className="text-text-tertiary">· {grp.rows.length}</span>
            </button>
          </td>
        </tr>,
      );
      if (!open) { runningIdx += grp.rows.length; continue; }
    }

    // Virtualization window
    let visibleRange: [number, number] = [0, grp.rows.length];
    let topPad = 0; let bottomPad = 0;
    if (virtualize) {
      const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - 5);
      const endIdx = Math.min(grp.rows.length, Math.ceil((scrollTop + viewportH) / rowHeight) + 10);
      visibleRange = [startIdx, endIdx];
      topPad = startIdx * rowHeight;
      bottomPad = (grp.rows.length - endIdx) * rowHeight;
    }

    if (topPad > 0) rowsOut.push(<tr key={`pad-top-${grp.key}`}><td colSpan={columns.length + (showSelection ? 1 : 0)} style={{ height: topPad }} /></tr>);

    for (let i = visibleRange[0]; i < visibleRange[1]; i++) {
      const row = grp.rows[i];
      const id = getRowId(row);
      const idx = runningIdx + i;
      const isSelected = selected.has(id);
      const isFocused = focusedRow === idx;

      rowsOut.push(
        <tr
          key={id}
          data-id={id}
          tabIndex={-1}
          className={cn(
            'group/r border-b border-border-subtle/70 last:border-0 transition-colors duration-[120ms]',
            isSelected ? 'bg-accent-brand/[0.06]' : 'hover:bg-bg-hover',
            isFocused && 'outline outline-2 outline-offset-[-2px] outline-[color:var(--color-accent-brand)]',
            onRowOpen && 'cursor-pointer',
          )}
          style={{ height: rowHeight }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-table-cell-stop]')) return;
            onRowOpen?.(row);
          }}
          aria-selected={isSelected}
          aria-label={rowLabel?.(row)}
        >
          {showSelection && (
            <td className="w-9 px-2 sticky left-0 bg-inherit z-[1]" data-table-cell-stop>
              <input
                type="checkbox"
                aria-label={`Select row ${id}`}
                checked={isSelected}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onToggleSelect(id, { shiftKey: (e.nativeEvent as MouseEvent).shiftKey }, idx)}
                className={cn(
                  'rounded border-border-strong bg-bg-elevated',
                  !isSelected && 'opacity-0 group-hover/r:opacity-100 focus:opacity-100',
                )}
              />
            </td>
          )}
          {columns.map((c, ci) => {
            const v = c.accessor ? (row as any)[c.accessor] : (row as any)[c.id];
            const isPinned = c.pin === 'left' || ci === 0;
            return (
              <td
                key={c.id}
                className={cn(
                  'px-3 align-middle truncate text-text-primary',
                  c.numeric && 'tabular-nums text-right',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                  isPinned && 'sticky left-0 bg-inherit z-[1]',
                )}
                style={{ width: columnWidths[c.id] ?? c.width, maxWidth: columnWidths[c.id] ?? c.width }}
              >
                {c.cell ? c.cell(row, v) : v}
              </td>
            );
          })}
        </tr>,
      );
    }

    if (bottomPad > 0) rowsOut.push(<tr key={`pad-bot-${grp.key}`}><td colSpan={columns.length + (showSelection ? 1 : 0)} style={{ height: bottomPad }} /></tr>);
    runningIdx += grp.rows.length;
  }

  return <>{rowsOut}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Toolbar
// ─────────────────────────────────────────────────────────────────────────────

function TableToolbar<TRow>({
  search, onSearch, searchRef, filters, onAddFilter, onRemoveFilter, columns,
}: {
  search: string;
  onSearch: (s: string) => void;
  searchRef: React.RefObject<HTMLInputElement>;
  filters: FilterValue[];
  onAddFilter: (f: FilterValue) => void;
  onRemoveFilter: (i: number) => void;
  columns: ColumnDef<TRow>[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const filterable = columns.filter(c => c.filterable !== false);

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search…"
          className="h-8 pl-7 pr-2 rounded bg-bg-elevated border border-border-subtle text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-brand transition-colors duration-[120ms]"
          aria-label="Search rows"
        />
      </div>

      {filters.map((f, i) => (
        <FilterPill key={i} filter={f} columnLabel={labelFor(columns, f.columnId)} onRemove={() => onRemoveFilter(i)} />
      ))}

      <div className="relative">
        <button
          onClick={() => setPickerOpen(v => !v)}
          className="h-8 px-2 rounded border border-dashed border-border-subtle text-[12px] text-text-secondary hover:text-text-primary hover:border-border-strong flex items-center gap-1 transition-colors duration-[120ms]"
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
        >
          <Plus className="w-3 h-3" /> Add filter
        </button>
        {pickerOpen && (
          <div role="menu" className="absolute top-full left-0 mt-1 bg-bg-elevated border border-border-subtle rounded shadow-2xl py-1 z-20 min-w-[180px]">
            {filterable.map(c => (
              <button
                key={c.id}
                role="menuitem"
                onClick={() => {
                  onAddFilter({ columnId: c.id, op: c.options ? 'is' : 'contains', value: c.options ? c.options[0].value : '' });
                  setPickerOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 text-[13px] text-text-primary hover:bg-bg-hover"
              >
                {typeof c.header === 'string' ? c.header : c.id}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function labelFor<TRow>(cols: ColumnDef<TRow>[], id: string) {
  const c = cols.find(x => x.id === id);
  return typeof c?.header === 'string' ? c.header : id;
}

function FilterPill({ filter, columnLabel, onRemove }: {
  filter: FilterValue;
  columnLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="h-8 px-2 inline-flex items-center gap-1.5 rounded bg-bg-elevated border border-border-subtle text-[12px] text-text-primary">
      <span className="text-text-tertiary">{columnLabel}</span>
      <span className="text-text-tertiary">{filter.op}</span>
      <span>{String(filter.value)}</span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${columnLabel} filter`}
        className="ml-1 text-text-tertiary hover:text-text-primary rounded p-0.5 transition-colors duration-[120ms]"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Column resize + menu
// ─────────────────────────────────────────────────────────────────────────────

function ColumnResizer({ onResize }: { onResize: (delta: number) => void }) {
  const startX = useRef<number | null>(null);
  return (
    <span
      aria-hidden
      onMouseDown={(e) => {
        e.preventDefault();
        startX.current = e.clientX;
        const move = (ev: MouseEvent) => {
          if (startX.current === null) return;
          const delta = ev.clientX - startX.current;
          startX.current = ev.clientX;
          onResize(delta);
        };
        const up = () => {
          startX.current = null;
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      }}
      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-brand/40"
    />
  );
}

function ColumnMenu<TRow>({ column, onClose, onHide, onSort, onGroupBy }: {
  column: ColumnDef<TRow>;
  onClose: () => void;
  onHide: () => void;
  onSort: (dir: 'asc' | 'desc') => void;
  onGroupBy: () => void;
}) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-column-menu]')) onClose();
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [onClose]);
  return (
    <div data-column-menu role="menu" className="absolute top-full right-0 mt-1 z-30 bg-bg-elevated border border-border-subtle rounded shadow-2xl py-1 min-w-[160px]">
      <MenuItem onClick={() => onSort('asc')}>Sort ascending</MenuItem>
      <MenuItem onClick={() => onSort('desc')}>Sort descending</MenuItem>
      {column.groupable !== false && <MenuItem onClick={onGroupBy}>Group by this</MenuItem>}
      <div className="my-1 border-t border-border-subtle" />
      <MenuItem onClick={onHide}>Hide column</MenuItem>
    </div>
  );
}

function MenuItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="w-full text-left px-2 py-1.5 text-[13px] text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton, empty, error
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonRows<TRow>({ count, rowHeight, columns }: { count: number; rowHeight: number; columns: ColumnDef<TRow>[] }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="border-b border-border-subtle/70 last:border-0" style={{ height: rowHeight, animationDelay: `${i * 25}ms` }}>
          {columns.map((c) => (
            <td key={c.id} className="px-3">
              <span className="block h-3 rounded bg-bg-elevated animate-pulse" style={{ width: `${40 + ((i * 13 + c.id.length * 7) % 50)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyStateBlock({
  variant, title, description, action, columnCount,
}: {
  variant: 'no-data' | 'no-matches' | 'filtered';
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  columnCount: number;
}) {
  return (
    <tr>
      <td colSpan={columnCount + 1} className="px-4 py-12 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center',
            variant === 'no-data' ? 'bg-accent-brand/10 text-accent-brand' : 'bg-bg-elevated text-text-tertiary',
          )}>
            {variant === 'no-data' ? <Plus className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </div>
          <h3 className="text-[14px] font-medium text-text-primary mt-1">{title}</h3>
          {description && <p className="text-[12px] text-text-secondary max-w-sm">{description}</p>}
          {action && (
            <button
              onClick={action.onClick}
              className="mt-2 h-8 px-3 text-[13px] rounded bg-accent-brand text-bg-base font-medium hover:opacity-90 transition-opacity duration-[120ms]"
            >
              {action.label}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ErrorBanner({ message, onRetry, columnCount }: { message: string; onRetry?: () => void; columnCount: number }) {
  return (
    <tr>
      <td colSpan={columnCount + 1} className="px-4 py-3 bg-status-alert/10 border-b border-status-alert/30">
        <div className="flex items-center gap-2 text-[13px] text-status-alert">
          <AlertCircle className="w-4 h-4" />
          <span>{message}</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-auto h-7 px-2 rounded border border-status-alert/40 hover:bg-status-alert/10 transition-colors duration-[120ms]"
            >
              Retry
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk action bar
// ─────────────────────────────────────────────────────────────────────────────

function BulkActionBar<TRow>({ count, actions, onClear, onRun }: {
  count: number;
  actions: BulkAction<TRow>[];
  onClear: () => void;
  onRun: (a: BulkAction<TRow>) => void;
}) {
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-30',
        'flex items-center gap-1 h-10 px-2 rounded-lg bg-bg-elevated border border-border-subtle shadow-2xl',
        'animate-in slide-in-from-bottom-2 fade-in duration-[200ms] ease-[cubic-bezier(0.2,0,0,1)]',
      )}
    >
      <span className="px-2 text-[12px] text-text-secondary">{count} selected</span>
      <span className="w-px h-5 bg-border-subtle" />
      {actions.map(a => {
        const Icon = a.icon;
        return (
          <button
            key={a.id}
            onClick={() => onRun(a)}
            className={cn(
              'h-7 px-2 rounded text-[13px] flex items-center gap-1.5 transition-colors duration-[120ms]',
              a.destructive ? 'text-status-alert hover:bg-status-alert/10' : 'text-text-primary hover:bg-bg-hover',
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {a.label}
          </button>
        );
      })}
      <span className="w-px h-5 bg-border-subtle" />
      <button
        onClick={onClear}
        aria-label="Clear selection"
        className="h-7 w-7 rounded flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter eval
// ─────────────────────────────────────────────────────────────────────────────

function evalFilter<TRow>(row: TRow, f: FilterValue): boolean {
  const v = (row as any)[f.columnId];
  switch (f.op) {
    case 'is':       return String(v) === String(f.value);
    case 'is not':   return String(v) !== String(f.value);
    case 'contains': return String(v ?? '').toLowerCase().includes(String(f.value).toLowerCase());
    case '>':        return Number(v) > Number(f.value);
    case '<':        return Number(v) < Number(f.value);
    case 'in':       return Array.isArray(f.value) && f.value.includes(String(v));
  }
}
