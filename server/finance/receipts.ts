import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomBytes } from 'node:crypto';

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
