import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';

/**
 * Receipt storage. Dev: local FS at `uploads/receipts/`. Production: swap
 * the body of `storeReceipt()` for an S3 / Vercel Blob writer.
 *
 * Storage is keyed by `<journalId>/<random>.<ext>` so the URL can be looked
 * up later via filesystem listing (or a DB index when we add one).
 */

const ROOT = join(process.cwd(), 'uploads', 'receipts');

async function ensureRoot() {
  if (!existsSync(ROOT)) await mkdir(ROOT, { recursive: true });
}

export type StoredReceipt = {
  /** Relative URL the browser can fetch: /api/finance/receipts/<journalId>/<filename> */
  url: string;
  filename: string;
  bytes: number;
  mimeType: string;
  journalId: string;
};

export async function storeReceipt(args: {
  journalId: string;
  mimeType: string;
  buffer: Buffer;
  originalName?: string;
}): Promise<StoredReceipt> {
  await ensureRoot();
  const journalDir = join(ROOT, sanitize(args.journalId));
  if (!existsSync(journalDir)) await mkdir(journalDir, { recursive: true });

  const ext = args.originalName ? extname(args.originalName) : extFromMime(args.mimeType);
  const filename = `${randomBytes(6).toString('hex')}${ext}`;
  const path = join(journalDir, filename);
  await writeFile(path, args.buffer);

  return {
    url: `/api/finance/receipts/${sanitize(args.journalId)}/${filename}`,
    filename,
    bytes: args.buffer.length,
    mimeType: args.mimeType,
    journalId: args.journalId,
  };
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '');
}

function extFromMime(m: string): string {
  if (m === 'application/pdf')      return '.pdf';
  if (m === 'image/jpeg')           return '.jpg';
  if (m === 'image/png')            return '.png';
  if (m === 'image/webp')           return '.webp';
  if (m === 'image/heic')           return '.heic';
  return '';
}

export const RECEIPTS_ROOT = ROOT;

// ─────────────────────────────────────────────────────────────────────────────
// OCR — extract vendor / amount / date from a stored receipt via Gemini.
// Falls back to a clear error if GEMINI_API_KEY isn't set.
// ─────────────────────────────────────────────────────────────────────────────

export type OcrResult = {
  /** Best guess at vendor name. */
  vendor: string | null;
  /** Amount in cents (positive). */
  amountCents: number | null;
  /** Service date in YYYY-MM-DD. */
  date: string | null;
  /** Raw text response from the model, for debugging / fallback display. */
  rawText: string;
};

export async function ocrReceipt(args: { journalId: string; filename: string }): Promise<OcrResult> {
  const path = join(ROOT, sanitize(args.journalId), args.filename);
  if (!existsSync(path)) {
    throw Object.assign(new Error('Receipt file not found'), { status: 404 });
  }
  const buffer = await readFile(path);
  const mimeType = extToMime(extname(args.filename).toLowerCase());
  return ocrImage(buffer, mimeType);
}

export async function ocrImage(buffer: Buffer, mimeType: string): Promise<OcrResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw Object.assign(new Error('GEMINI_API_KEY not set — OCR unavailable'), { status: 503 });
  }
  const genAI = new GoogleGenAI({ apiKey });
  const prompt = `Extract three fields from this receipt:
  vendor  — the merchant's name
  amount  — the TOTAL amount paid, in cents (e.g. "$14.50" → 1450)
  date    — the service / purchase date, in YYYY-MM-DD

Reply with ONLY a single JSON object on one line, no markdown fences, no commentary.
Use null for any field you can't confidently extract.
Example: {"vendor":"USPS","amountCents":1450,"date":"2025-05-08"}`;

  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [
      { text: prompt },
      { inlineData: { mimeType, data: buffer.toString('base64') } },
    ]}],
  });

  const rawText = response.text ?? '';
  return { ...tryParse(rawText), rawText };
}

function tryParse(text: string): Omit<OcrResult, 'rawText'> {
  // Strip code fences if the model added them despite instructions.
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as { vendor?: string; amountCents?: number; date?: string };
    return {
      vendor: typeof parsed.vendor === 'string' ? parsed.vendor : null,
      amountCents: typeof parsed.amountCents === 'number' ? Math.round(parsed.amountCents) : null,
      date: typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
    };
  } catch {
    return { vendor: null, amountCents: null, date: null };
  }
}

function extToMime(ext: string): string {
  if (ext === '.pdf')  return 'application/pdf';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png')  return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.heic') return 'image/heic';
  return 'application/octet-stream';
}
