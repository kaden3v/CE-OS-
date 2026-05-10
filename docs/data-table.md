# `<DataTable>` — Usage Guide

One primitive powers every list in CE OS. If you're tempted to write a bespoke list/table component, stop. Almost everything is a column, filter, group, or empty-state config away.

Lives at [src/components/data/DataTable.tsx](../src/components/data/DataTable.tsx). Types in [src/components/data/types.ts](../src/components/data/types.ts).

---

## Minimal example

```tsx
import { DataTable } from '@/components/data/DataTable';
import type { ColumnDef } from '@/components/data/types';

type Vendor = { id: string; name: string; lastOrder: string; total: number };

const columns: ColumnDef<Vendor>[] = [
  { id: 'id',   accessor: 'id',   header: 'ID',   width: 100, pin: 'left' },
  { id: 'name', accessor: 'name', header: 'Name', width: 220, filterable: true },
  { id: 'last', accessor: 'lastOrder', header: 'Last order', width: 120 },
  { id: 'total', accessor: 'total', header: 'Total', width: 100, numeric: true,
    cell: (row) => `$${row.total.toFixed(2)}` },
];

<DataTable<Vendor>
  storageKey="vendors.v1"
  rows={vendors}
  columns={columns}
  getRowId={(r) => r.id}
  isLoading={isLoading}
  isError={error && { message: error.message, onRetry: refetch }}
  emptyState={{ title: 'No vendors yet', action: { label: 'Add vendor', onClick: addVendor } }}
  onRowOpen={(row) => openDrawer(row.id)}
/>
```

That's it. Sort, filter, search, column resize, hide/show, group-by, keyboard nav, virtualization, selection — all included.

---

## What you get for free

| Feature | How |
| ------- | --- |
| **Sorting** | Click a header. Hold `shift` to multi-sort. Triangle indicator in header — never a separate icon button. |
| **Filtering** | "+ Add filter" button → pick a column → pill appears with op + value. Pills are removable. |
| **Search** | Inline input above the table. `⌘F` focuses it. Searches across all visible columns. |
| **Group by** | Header menu → "Group by this." Rows nest under collapsible section headers showing count. |
| **Column visibility** | Header menu → "Hide column." Hidden columns reappear as chips below the table; click to restore. |
| **Column width** | Drag the right edge of any header. Width persists per `storageKey`. |
| **Selection** | Pass `onSelectionChange`. Checkboxes appear on row hover. `x` toggles focused row; `⌘A` selects all visible; shift-click for range. |
| **Bulk actions** | Pass `bulkActions`. Bar slides up from bottom when ≥1 selected. |
| **Loading** | Pass `isLoading`. Skeleton rows match real row geometry, stagger fade. |
| **Empty state** | Pass `emptyState`. Three variants picked automatically: no data, no matches, filtered to empty. |
| **Error** | Pass `isError={{ message, onRetry }}`. Banner above the table, never replaces it. |
| **Keyboard nav** | `↑/↓` move focus, `enter` opens, `x` selects, `⌘F` search, `⌘A` select-all. |
| **Virtualization** | Automatic above `virtualizeThreshold` rows (default 200). No setup. |
| **Persistence** | Column widths, hidden columns, sort, filters, group-by all saved to `localStorage` under `ce-os.table.{storageKey}`. |

---

## Column anatomy

```ts
type ColumnDef<TRow> = {
  id: string;                      // stable key
  accessor?: keyof TRow & string;  // field — falls back to `id` if omitted
  header: ReactNode;               // header label
  cell?: (row, value) => ReactNode;// custom renderer
  width?: number;                  // initial px
  minWidth?: number;               // default 80
  pin?: 'left' | null;             // stick to left edge (ID column should always pin)
  align?: 'left' | 'right' | 'center';
  numeric?: boolean;               // implies right-align + tabular-nums
  sortable?: boolean;              // default true
  filterable?: boolean;            // default true
  groupable?: boolean;             // default true
  options?: Array<{ value, label }>; // enables enum filter operators
};
```

### Conventions

- **First column is the identifier** (ID, name, title) and is always pinned. The table will not pin it for you — set `pin: 'left'` explicitly.
- **Status cells** render as a colored dot + label, never a full pill background. Use `bg-status-{ok|warn|alert|info}` tokens.
- **Numeric columns** use `numeric: true` to get right-alignment + `tabular-nums`.
- **Don't put click handlers inside cells** unless you also wrap in `[data-table-cell-stop]` (the row catches click for opening the drawer). Use stop guards only when you have to.

---

## Required states

Every consumer of `<DataTable>` must pass:

1. `isLoading` — even if always `false`, be explicit.
2. `isError` — wired to the same async source as `isLoading`.
3. `emptyState` — at minimum a `title`. Adding an `action` gives the user a way forward.

The hook to use: [`useDataState`](../src/hooks/useDataState.tsx) (existing). Pattern:

```tsx
const { data, isLoading, isError, isEmpty } = useDataState(rows);
```

---

## Bulk actions

```ts
bulkActions={[
  { id: 'send',  label: 'Send to Claude', icon: Send,    run: (rows) => api.send(rows) },
  { id: 'print', label: 'Print labels',   icon: Printer, run: (rows) => api.print(rows) },
  { id: 'cancel', label: 'Cancel', icon: Trash2, destructive: true, run: (rows) => api.cancel(rows) },
]}
```

`destructive` actions render in `status-alert` text and live separated at the right end of the bar.

---

## Opening the record drawer

`onRowOpen={(row) => openDrawer(row.id)}`. Convention: encode the open record in the URL via `?id=`. The browser back button then closes the drawer, and copying the URL deep-links.

```tsx
const [params, setParams] = useSearchParams();
const openId = params.get('id');
```

---

## When NOT to use `<DataTable>`

- **Kanban boards** — Propagation is a kanban, not a table. Use a different primitive.
- **Reading-rate content** — long-form pages (year-end report, tax summary) are documents, not tables.
- **Tree-structured data with many levels** — `<DataTable>` supports one level of grouping. Anything deeper needs a different component.

---

## Migration cheatsheet

Replace this pattern:

```tsx
import { DataTable } from '@/components/ui/DataTable'; // old, @tanstack-only
```

With:

```tsx
import { DataTable } from '@/components/data/DataTable';
import type { ColumnDef } from '@/components/data/types';
```

Then:
- Switch column shape — `accessorKey` becomes `accessor`, `cell: (info) => ...` becomes `cell: (row, value) => ...`.
- Pin the first column (`pin: 'left'`).
- Move loading/empty/error blocks **out** of the page JSX and **into** the table props.
- Delete any local row-hover/sticky-header styling — the primitive owns it.

A canonical example: [src/pages/Orders.tsx](../src/pages/Orders.tsx).
