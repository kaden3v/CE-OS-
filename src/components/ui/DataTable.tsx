import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type Cell,
  type ColumnDef,
  type Row,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 25;

/**
 * Per-column mobile behaviour, set via a column's `meta`:
 *
 *   { accessorKey: "id", header: "Order #", meta: { mobileHidden: true } }
 */
export interface DataTableColumnMeta {
  /** Leave this column out of the mobile card entirely. */
  mobileHidden?: boolean;
  /** Render as the card's heading instead of a labelled row. Defaults to the first column. */
  mobileTitle?: boolean;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  pageSize?: number;
}

const metaOf = (cell: Cell<any, unknown>): DataTableColumnMeta =>
  (cell.column.columnDef.meta ?? {}) as DataTableColumnMeta;

/** Header text for a card row label. Non-string headers fall back to the column id. */
function headerLabel(cell: Cell<any, unknown>): string {
  const header = cell.column.columnDef.header;
  return typeof header === "string" ? header : cell.column.id;
}

/**
 * One row rendered as a card.
 *
 * Phones got a horizontally-scrolling `min-w-max` table — functional, but
 * reading a single order meant scrolling a 7-column grid left and right. The
 * card keeps the same data in one column: first column as the heading, the rest
 * as labelled rows.
 */
function MobileCard<TData>({ row, onRowClick }: { row: Row<TData>; onRowClick?: (row: TData) => void }) {
  const cells = row.getVisibleCells().filter((c) => !metaOf(c).mobileHidden);
  if (cells.length === 0) return null;

  const titleIndex = Math.max(0, cells.findIndex((c) => metaOf(c).mobileTitle));
  const title = cells[titleIndex];
  const rest = cells.filter((_, i) => i !== titleIndex);

  const interactive = !!onRowClick;
  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      {...(interactive ? { type: "button" as const, onClick: () => onRowClick(row.original) } : {})}
      className={cn(
        "w-full text-left block border-b border-border-subtle/60 last:border-0 px-4 py-3",
        interactive && "active:bg-bg-hover transition-colors",
      )}
    >
      <div className="font-medium text-text-primary mb-1.5">
        {flexRender(title.column.columnDef.cell, title.getContext())}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {rest.map((cell) => (
          <div key={cell.id} className="contents">
            <dt className="text-text-tertiary text-xs uppercase tracking-wide self-center">
              {headerLabel(cell)}
            </dt>
            <dd className="text-text-secondary min-w-0 justify-self-end text-right">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </dd>
          </div>
        ))}
      </dl>
    </Tag>
  );
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  pageSize = DEFAULT_PAGE_SIZE,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const pageCount = table.getPageCount();
  const { pageIndex } = table.getState().pagination;
  const rows = table.getRowModel().rows;

  return (
    <div className="w-full flex flex-col">
      {/* Phones: one card per row. */}
      <div className="md:hidden">
        {rows.length ? (
          rows.map((row) => <MobileCard key={row.id} row={row} onRowClick={onRowClick} />)
        ) : (
          <div className="h-24 flex items-center justify-center text-text-secondary text-sm">No results.</div>
        )}
      </div>

      {/* Desktop: the table. */}
      <div className="hidden md:block overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table className="w-full text-sm text-left">
          <thead className="text-[12px] uppercase tracking-wide text-text-secondary sticky top-0 bg-bg-base/90 backdrop-blur-md z-sticky border-b border-border-subtle">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-2 font-medium whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-transparent">
            {rows.length ? (
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    "group transition-colors border-b border-border-subtle/50 last:border-0",
                    onRowClick ? "cursor-pointer hover:bg-bg-hover" : "hover:bg-bg-hover/50",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2 text-text-primary whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="h-24 text-center text-text-secondary">
                  No results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-border-subtle text-xs text-text-secondary shrink-0">
          <span>
            {data.length.toLocaleString()} rows · page {pageIndex + 1} of {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
              className="p-1.5 rounded-md border border-border-subtle hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
              className="p-1.5 rounded-md border border-border-subtle hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
