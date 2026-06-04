import Papa from "papaparse";
import {
  CsvType,
  SIGNATURES,
  SOLD_ORDERS_COLUMNS,
  ORDER_ITEMS_COLUMNS,
  PAYMENTS_COLUMNS,
  type ColumnMap,
} from "./columns";
import type { ParsedFile, RawRow, StagedRow } from "./types";

/** Case-insensitive, trimmed lookup of a value by its alias list. */
export function pick(row: RawRow, aliases: string[]): string {
  const norm = (s: string) => s.trim().toLowerCase();
  const wanted = aliases.map(norm);
  for (const key of Object.keys(row)) {
    if (wanted.includes(norm(key))) {
      const v = row[key];
      return typeof v === "string" ? v.trim() : "";
    }
  }
  return "";
}

/** Parse Etsy money strings: "$1,234.56", "(3.20)" (negative), "--", "". */
export function parseMoney(value: string): number {
  if (!value) return 0;
  // Strip currency symbols, thousands separators, and whitespace.
  const cleaned = value.replace(/[$\s,]/g, "");
  if (!cleaned || cleaned === "--" || cleaned === "-") return 0;
  // Strictly validate the remaining shape so embedded junk (e.g. "3.20(1)")
  // is rejected rather than silently mis-parsed.
  const m = cleaned.match(/^\(?(-?\d+(?:\.\d+)?)\)?$/);
  if (!m) return 0;
  const negative = cleaned.startsWith("(") && cleaned.endsWith(")");
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return 0;
  return negative ? -Math.abs(n) : n;
}

/** Normalize Etsy date strings to ISO yyyy-mm-dd, or null. Tolerant of formats. */
export function parseDate(value: string): string | null {
  if (!value) return null;
  const v = value.trim();
  // Already ISO-ish
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // MM/DD/YY or MM/DD/YYYY
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const mm = slash[1].padStart(2, "0");
    const dd = slash[2].padStart(2, "0");
    const yy = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${yy}-${mm}-${dd}`;
  }
  // "September 5, 2024" and similar. Read LOCAL calendar components — never
  // toISOString(), which converts to UTC and can shift the day/month/year for
  // any value that carries a time component.
  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/** Detect which Etsy export a header set belongs to. */
export function detectType(headers: string[]): CsvType | null {
  const have = headers.map((h) => h.trim().toLowerCase());
  for (const sig of SIGNATURES) {
    const ok = sig.required.every((r) => have.includes(r.toLowerCase()));
    if (ok) return sig.type;
  }
  return null;
}

const COLUMNS: Record<CsvType, ColumnMap> = {
  sold_orders: SOLD_ORDERS_COLUMNS,
  order_items: ORDER_ITEMS_COLUMNS,
  payments: PAYMENTS_COLUMNS,
};

/** Build a stable dedup key for a payments-ledger row (it has no native id). */
function paymentKey(row: RawRow): string {
  const f = (a: string[]) => pick(row, a);
  return [
    f(PAYMENTS_COLUMNS.date),
    f(PAYMENTS_COLUMNS.type),
    f(PAYMENTS_COLUMNS.title),
    f(PAYMENTS_COLUMNS.amount),
    f(PAYMENTS_COLUMNS.net),
  ].join("|");
}

function normalizeRow(csvType: CsvType, row: RawRow, index: number): StagedRow | null {
  if (csvType === "sold_orders") {
    const orderId = pick(row, SOLD_ORDERS_COLUMNS.orderId);
    if (!orderId) return null;
    return {
      csvType,
      etsyKey: `order:${orderId}`,
      rowType: "Order",
      orderExternalId: orderId,
      occurredOn: parseDate(pick(row, SOLD_ORDERS_COLUMNS.saleDate)),
      amount: parseMoney(pick(row, SOLD_ORDERS_COLUMNS.orderValue)),
      raw: row,
    };
  }
  if (csvType === "order_items") {
    const orderId = pick(row, ORDER_ITEMS_COLUMNS.orderId);
    if (!orderId) return null;
    const txn = pick(row, ORDER_ITEMS_COLUMNS.transactionId) || pick(row, ORDER_ITEMS_COLUMNS.listingId) || String(index);
    return {
      csvType,
      etsyKey: `item:${orderId}:${txn}`,
      rowType: "Item",
      orderExternalId: orderId,
      occurredOn: parseDate(pick(row, ORDER_ITEMS_COLUMNS.saleDate)),
      amount: parseMoney(pick(row, ORDER_ITEMS_COLUMNS.itemTotal) || pick(row, ORDER_ITEMS_COLUMNS.price)),
      raw: row,
    };
  }
  // payments
  const type = pick(row, PAYMENTS_COLUMNS.type);
  if (!type && !pick(row, PAYMENTS_COLUMNS.amount)) return null;
  return {
    csvType,
    etsyKey: `pay:${paymentKey(row)}`,
    rowType: type || "Unknown",
    orderExternalId: extractOrderId(pick(row, PAYMENTS_COLUMNS.title) + " " + pick(row, PAYMENTS_COLUMNS.info)),
    occurredOn: parseDate(pick(row, PAYMENTS_COLUMNS.date)),
    amount: parseMoney(pick(row, PAYMENTS_COLUMNS.amount)),
    raw: row,
  };
}

/** Pull an Etsy order id out of a free-text payment title/info, if present.
 *  Prefer an explicit "Order #…" / "#…" marker so we don't mistake an
 *  unrelated long number (SKU, phone, listing id) for an order id. */
export function extractOrderId(text: string): string | null {
  const labeled = text.match(/order[^\d]{0,4}#?\s*(\d{6,})/i);
  if (labeled) return labeled[1];
  const hashed = text.match(/#\s*(\d{6,})/);
  if (hashed) return hashed[1];
  return null;
}

/** Parse one uploaded CSV file into staged rows. */
export function parseFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        const errors: string[] = [];
        const headers = result.meta.fields ?? [];
        const csvType = detectType(headers);
        if (!csvType) {
          resolve({
            fileName: file.name,
            csvType: null,
            rows: [],
            errors: [`Unrecognized CSV — headers didn't match a known Etsy export. Found: ${headers.slice(0, 6).join(", ")}…`],
          });
          return;
        }
        const rows: StagedRow[] = [];
        result.data.forEach((raw, i) => {
          const staged = normalizeRow(csvType, raw, i);
          if (staged) rows.push(staged);
        });
        // Payment-ledger rows have no native id, so two genuinely distinct but
        // identical-looking entries (e.g. two $0.20 listing fees on the same
        // day) share a content key. Append a per-content occurrence index so
        // they stay distinct — and stay STABLE across re-imports of the same
        // file (the Nth identical row is always #N), preserving idempotency.
        if (csvType === "payments") {
          const seen = new Map<string, number>();
          for (const r of rows) {
            const n = (seen.get(r.etsyKey) ?? 0) + 1;
            seen.set(r.etsyKey, n);
            if (n > 1) r.etsyKey = `${r.etsyKey}#${n}`;
          }
        }
        if (result.errors.length) {
          errors.push(`${result.errors.length} row(s) had parse warnings (e.g. ${result.errors[0]?.message}).`);
        }
        resolve({ fileName: file.name, csvType, rows, errors });
      },
      error: (err) => {
        resolve({ fileName: file.name, csvType: null, rows: [], errors: [err.message] });
      },
    });
  });
}
