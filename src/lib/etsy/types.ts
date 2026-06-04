import type { CsvType } from "./columns";

/** A single raw CSV row keyed by original header. */
export type RawRow = Record<string, string>;

/** A normalized row staged into `etsy_imports`. */
export interface StagedRow {
  csvType: CsvType;
  sourceFile?: string;
  etsyKey: string;
  rowType: string | null;
  orderExternalId: string | null;
  occurredOn: string | null; // ISO date (yyyy-mm-dd)
  amount: number | null;
  raw: RawRow;
}

/** Result of parsing one uploaded file. */
export interface ParsedFile {
  fileName: string;
  csvType: CsvType | null; // null = unrecognized
  rows: StagedRow[];
  errors: string[]; // human-readable per-file problems
}

/** Projected records ready to write to the domain tables. */
export interface OrderDraft {
  externalId: string;
  /** "orders" = from the Sold Orders CSV (authoritative totals); "ledger" =
   *  stubbed from a payment Sale row (gross only, no shipping/tax breakdown). */
  source: "orders" | "ledger";
  channel: "etsy";
  placedAt: string | null;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  status: string;
  customerName: string | null;
  notes: string | null;
}

export interface OrderItemDraft {
  orderExternalId: string;
  nameSnapshot: string;
  qty: number;
  price: number;
}

export interface ExpenseDraft {
  etsyKey: string; // dedup
  occurredOn: string | null;
  amount: number;
  category: string;
  description: string;
}

export interface CustomerDraft {
  name: string;
}

/** The full plan shown in the preview and committed on confirm. */
export interface ImportPlan {
  orders: OrderDraft[];
  items: OrderItemDraft[];
  expenses: ExpenseDraft[];
  customers: CustomerDraft[];
  staged: StagedRow[];
  /** Counts skipped because they're informational only (e.g. Deposit rows). */
  skipped: { deposits: number; unmapped: number };
}

export type CommitOutcome = {
  ordersWritten: number;
  itemsWritten: number;
  expensesWritten: number;
  customersWritten: number;
  duplicatesSkipped: number;
  errors: string[];
};
