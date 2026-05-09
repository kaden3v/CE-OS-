import { type ReactNode, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  key: keyof T | (string & {});
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
};

type SortDir = "asc" | "desc";

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  caption?: ReactNode;
  ariaLabel?: string;
}

function readCell<T>(row: T, key: keyof T | string): unknown {
  if (row !== null && typeof row === "object" && key in row) {
    return (row as Record<string, unknown>)[key as string];
  }
  return undefined;
}

function formatDefault(value: unknown): ReactNode {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

function getRowKey<T>(row: T, index: number): string | number {
  if (row !== null && typeof row === "object" && "id" in row) {
    return (row as { id: string | number }).id;
  }
  return index;
}

export function DataTable<T>({
  columns,
  data,
  onRowClick,
  caption,
  ariaLabel = "Data table",
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);

  const sortedData = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => String(c.key) === sort.key);
    if (!col?.sortable) return data;
    const key = col.key;
    const dirMul = sort.dir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = readCell(a, key);
      const vb = readCell(b, key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number")
        return (va - vb) * dirMul;
      return String(va).localeCompare(String(vb), undefined, {
        numeric: true,
      }) * dirMul;
    });
  }, [columns, data, sort]);

  const toggleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable) return;
    const k = String(col.key);
    setSort((prev) => {
      if (!prev || prev.key !== k) return { key: k, dir: "asc" };
      if (prev.dir === "asc") return { key: k, dir: "desc" };
      return null;
    });
  };

  return (
    <div className="w-full">
      <table className="w-full text-sm text-left" aria-label={caption ? undefined : ariaLabel}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="text-[12px] uppercase tracking-wide text-text-secondary sticky top-0 bg-bg-base/90 backdrop-blur-md z-10 border-b border-border-subtle">
          <tr>
            {columns.map((col) => (
              <th
                key={`${String(col.key)}:${col.header}`}
                scope="col"
                className="px-4 py-2 font-medium whitespace-nowrap"
                style={col.width ? { width: col.width } : undefined}
                aria-sort={
                  col.sortable
                    ? sort?.key === String(col.key)
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                    : undefined
                }
              >
                {col.sortable ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-left cursor-pointer select-none hover:text-text-primary"
                    onClick={() => toggleSort(col)}
                  >
                    {col.header}
                    {sort?.key === String(col.key) ? (
                      <span className="text-text-tertiary normal-case" aria-hidden="true">
                        {sort.dir === "asc" ? "↑" : "↓"}
                      </span>
                    ) : null}
                  </button>
                ) : (
                  <span>{col.header}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-transparent">
          {sortedData.length ? (
            sortedData.map((row, rowIndex) => (
              <tr
                key={getRowKey(row, rowIndex)}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "group transition-colors border-b border-border-subtle/50 last:border-0",
                  onRowClick
                    ? "cursor-pointer hover:bg-bg-hover"
                    : "hover:bg-bg-hover/50"
                )}
              >
                {columns.map((col) => (
                  <td
                    key={`${String(col.key)}:${col.header}`}
                    className="px-4 py-2 text-text-primary whitespace-nowrap"
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.render
                      ? col.render(row)
                      : formatDefault(readCell(row, col.key))}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length}
                className="h-24 text-center text-text-secondary"
              >
                No results.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
