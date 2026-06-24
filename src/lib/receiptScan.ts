/**
 * Receipt → expense draft.
 *
 * The eventual real path is a vision model (Gemini) behind an edge function:
 * upload the image, get back amount/date/vendor. Until that's wired, we run in
 * mock mode and extract only what we can read for certain from the filename —
 * we never fabricate figures. The capture flow (snap → draft with the receipt
 * pre-attached) is the real value today; auto-fill gets better when the scanner
 * is enabled, with no change to callers.
 */
import { parseCsvAmount, parseCsvDate } from "@/lib/csv";

export interface ReceiptDraft {
  amount: number | null;
  occurred_on: string | null; // YYYY-MM-DD
  vendor_name: string | null;
  /** How the draft was produced. */
  source: "scan" | "filename" | "none";
  /** True when no real scanner ran — the UI sets expectations accordingly. */
  mocked: boolean;
}

/**
 * Best-effort amount/date from a filename. Conservative on purpose: an amount
 * must carry a decimal (so "IMG_4218.jpg" isn't read as $4,218) and a date must
 * look like a real date. Reuses the CSV parsers so formats stay consistent.
 */
export function draftFromFilename(name: string): { amount: number | null; occurred_on: string | null } {
  const base = name.replace(/\.[a-z0-9]+$/i, " "); // drop the extension

  // Normalize separators to "-" and zero-pad each numeric segment so single-digit
  // months/days ("2026-6-21") still satisfy parseCsvDate's two-digit ISO branch.
  const dateToken = base.match(/\d{4}[-_/]\d{1,2}[-_/]\d{1,2}|\d{1,2}[-_/]\d{1,2}[-_/]\d{2,4}/)?.[0] ?? null;
  const normalizedDate = dateToken
    ? dateToken.replace(/[_/]/g, "-").replace(/\d+/g, (seg) => (seg.length < 2 ? seg.padStart(2, "0") : seg))
    : null;
  const occurred_on = normalizedDate ? parseCsvDate(normalizedDate) : null;

  // Optional thousands separators (e.g. "$1,234.56") so parseCsvAmount can strip
  // the commas — \d{1,6} alone captured only "234.56" and under-reported by 10x.
  // The optional comma keeps plain large numbers ("1234.56") matching too.
  const amounts = base.match(/\$?\d{1,3}(?:,?\d{3})*\.\d{2}(?!\d)/g);
  const rawAmount = amounts && amounts.length ? parseCsvAmount(amounts[amounts.length - 1]) : null;
  const amount = rawAmount != null ? Math.abs(rawAmount) : null;

  return { amount, occurred_on };
}

/** Produce a draft for a receipt file. Mock mode reads the filename only. */
export async function scanReceipt(file: File): Promise<ReceiptDraft> {
  // TODO: when a scanning service is configured, POST the file to it here and
  // return { ...parsed, source: "scan", mocked: false }. Mock mode falls through.
  const { amount, occurred_on } = draftFromFilename(file.name);
  const hit = amount != null || occurred_on != null;
  return { amount, occurred_on, vendor_name: null, source: hit ? "filename" : "none", mocked: true };
}
