/**
 * Minimal CSV utilities for the expense importer. The parser handles quoted
 * fields, escaped quotes (`""`), CRLF, and a leading BOM — enough for exports
 * from banks, Etsy, Shopify, and spreadsheets without pulling in a dependency.
 */

/** Parse CSV text into rows of string cells. Blank rows are dropped. */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === ",") {
      endField();
      i++;
    } else if (c === "\n") {
      endRow();
      i++;
    } else if (c === "\r") {
      i++;
    } else {
      field += c;
      i++;
    }
  }
  if (field.length > 0 || row.length > 0) endRow();

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Parse a money-ish string ("$1,234.56", "(45.00)", "-12") to a number, or null. */
export function parseCsvAmount(raw: string): number | null {
  if (!raw) return null;
  const negative = /^\s*\(.*\)\s*$/.test(raw) || raw.trim().startsWith("-");
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Parse a date cell to YYYY-MM-DD. Accepts ISO (YYYY-MM-DD), US (M/D/YYYY or
 * M/D/YY), and dotted/dashed variants. Returns null if it can't be read. No
 * timezone conversion — the literal calendar date is preserved.
 */
export function parseCsvDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  let year: number;
  let month: number;
  let day: number;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    const parts = s.split(/[/.\-]/).map((p) => p.trim());
    if (parts.length !== 3) return null;
    let [a, b, c] = parts;
    if (c.length === 2) c = `20${c}`;
    [month, day, year] = [Number(a), Number(b), Number(c)]; // assumes US M/D/Y order
  }

  if (!(Number.isInteger(month) && Number.isInteger(day) && Number.isInteger(year))) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;

  // Reject impossible calendar dates (02/30, 04/31, …) so a single bad row can't
  // fail the whole batch insert against a Postgres `date` column.
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
