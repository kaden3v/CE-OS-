/**
 * CSV export — escapes fields per RFC 4180.
 *
 * Used by every finance list. Pass the visible columns + the filtered/sorted
 * rows so the export matches exactly what the user sees. Triggers a real file
 * download — no "Export Started" toast theater.
 */

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
};

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map(c => escape(c.header)).join(',');
  const body = rows.map(r =>
    columns.map(c => escape(c.value(r))).join(','),
  ).join('\n');
  return body ? `${head}\n${body}\n` : `${head}\n`;
}

function escape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Trigger a browser download of `csv` as `filename`. */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick to ensure the click is processed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build "expenses-2025-05-10.csv" style filenames. */
export function timestampedFilename(prefix: string, ext = 'csv'): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${prefix}-${stamp}.${ext}`;
}
