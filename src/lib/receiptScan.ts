/**
 * Receipt → expense draft.
 *
 * Real path: the `receipt-scan` edge function (Gemini vision) reads the file
 * and returns amount/date/vendor/memo/category. The server answers 501 until a
 * GEMINI_API_KEY secret is configured, and any failure — missing key, network,
 * oversized file, unsupported browser API — falls back to the conservative
 * filename heuristics below, so capture (snap → draft with the receipt
 * pre-attached) always works. We never fabricate figures: the fallback only
 * reads what's literally in the filename, and the server validates every field
 * the model returns.
 */
import { parseCsvAmount, parseCsvDate } from "@/lib/csv";
import { functionInvoke } from "@/lib/supabase";

export interface ReceiptDraft {
  amount: number | null;
  occurred_on: string | null; // YYYY-MM-DD
  vendor_name: string | null;
  /** Short human summary of the purchase (scanner only). */
  memo: string | null;
  /** A category from the org vocabulary, when the scanner is confident. */
  category: string | null;
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

/** Longest edge sent to the scanner — plenty for OCR, small enough to upload fast. */
const SCAN_MAX_DIM = 1600;
const SCAN_JPEG_QUALITY = 0.82;
/** Raw ceiling for files we send un-downscaled (PDFs, downscale failures). */
const SCAN_MAX_RAW_BYTES = 6 * 1024 * 1024;

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      const comma = url.indexOf(",");
      if (comma >= 0) resolve(url.slice(comma + 1));
      else reject(new Error("unreadable file"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("unreadable file"));
    reader.readAsDataURL(blob);
  });

/**
 * Downscale an image for scanning (canvas → JPEG). Throws when the browser
 * can't decode the format (e.g. HEIC outside Safari) — the caller falls back
 * to sending the original bytes or to filename mode.
 */
async function downscaleImage(file: File): Promise<{ mime: string; data: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, SCAN_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", SCAN_JPEG_QUALITY),
    );
    if (!blob) throw new Error("canvas encode failed");
    return { mime: "image/jpeg", data: await blobToBase64(blob) };
  } finally {
    bitmap.close();
  }
}

/** Encode the file for the scanner: images are downscaled, PDFs sent as-is. */
async function encodeForScan(file: File): Promise<{ mime: string; data: string } | null> {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) {
    try {
      return await downscaleImage(file);
    } catch {
      // Undecodable in this browser (HEIC on Chrome, etc.) — send raw if small.
      if (file.size <= SCAN_MAX_RAW_BYTES) return { mime, data: await blobToBase64(file) };
      return null;
    }
  }
  if (mime === "application/pdf" && file.size <= SCAN_MAX_RAW_BYTES) {
    return { mime, data: await blobToBase64(file) };
  }
  return null;
}

interface ScanResponse {
  amount: number | null;
  occurred_on: string | null;
  vendor_name: string | null;
  memo: string | null;
  category: string | null;
}

const filenameFallback = (file: File): ReceiptDraft => {
  const { amount, occurred_on } = draftFromFilename(file.name);
  const hit = amount != null || occurred_on != null;
  return { amount, occurred_on, vendor_name: null, memo: null, category: null, source: hit ? "filename" : "none", mocked: true };
};

/**
 * Produce a draft for a receipt file. Tries the vision scanner first; any
 * failure quietly degrades to the filename heuristics.
 */
export async function scanReceipt(file: File, opts?: { categories?: string[] }): Promise<ReceiptDraft> {
  let encoded: { mime: string; data: string } | null = null;
  try {
    encoded = await encodeForScan(file);
  } catch {
    encoded = null;
  }
  if (!encoded) return filenameFallback(file);

  const res = await functionInvoke<ScanResponse>(
    "receipt-scan",
    { ...encoded, categories: opts?.categories ?? [] },
    { abortMs: 50000 },
  );
  if (!res.ok) return filenameFallback(file);

  const { amount, occurred_on, vendor_name, memo, category } = res.data;
  const empty = amount == null && occurred_on == null && !vendor_name && !memo && !category;
  if (empty) {
    // The scanner ran but read nothing usable — the filename may still help.
    const fb = filenameFallback(file);
    return { ...fb, mocked: false };
  }
  return { amount, occurred_on, vendor_name, memo, category, source: "scan", mocked: false };
}
