import type { ReactNode } from 'react';

export type SortDir = 'asc' | 'desc';

export type SortRule<TRow> = { columnId: keyof TRow & string; dir: SortDir };

export type FilterOp = 'is' | 'is not' | 'contains' | '>' | '<' | 'in';

export type FilterValue = { columnId: string; op: FilterOp; value: string | number | string[] };

export type ColumnDef<TRow> = {
  id: string;
  /** Field key for `accessor`-less columns; falls back to id. */
  accessor?: keyof TRow & string;
  header: ReactNode;
  /** Cell renderer. Receives the row + the accessed value. */
  cell?: (row: TRow, value: any) => ReactNode;
  /** Initial width in px. */
  width?: number;
  minWidth?: number;
  /** Pin to the left edge (sticky horizontal). The identifier column should always be pinned. */
  pin?: 'left' | null;
  align?: 'left' | 'right' | 'center';
  /** Right-aligned tabular numerals. */
  numeric?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  groupable?: boolean;
  /** Operator → set of allowed values for `in`/`is` filters. */
  options?: Array<{ value: string; label: string }>;
};

export type DataTableState<TRow> = {
  columns: ColumnDef<TRow>[];
  hiddenColumnIds: string[];
  columnWidths: Record<string, number>;
  sort: SortRule<TRow>[];
  filters: FilterValue[];
  groupBy: string | null;
  search: string;
};

export type SavedView<TRow> = {
  id: string;
  name: string;
  state: Partial<DataTableState<TRow>>;
};
