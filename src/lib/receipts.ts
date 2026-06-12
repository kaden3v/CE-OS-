/**
 * Expense receipt storage helpers (Supabase Storage, private 'receipts' bucket).
 *
 * Path convention: `<org_id>/<uuid>.<ext>` — the leading org segment is required
 * by the Storage RLS policy (managers of that org only). Files are served via
 * short-lived signed URLs; the expense row stores the object path in
 * `receipt_url`, never a signed URL.
 */
import { supabase } from "./supabase";

const BUCKET = "receipts";
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB (matches bucket limit)
const ACCEPTED_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "application/pdf",
];
export const RECEIPT_ACCEPT = ACCEPTED_MIME.join(",");

export function isAcceptedReceipt(file: File): boolean {
  return ACCEPTED_MIME.includes(file.type);
}

export function receiptTooLarge(file: File): boolean {
  return file.size > RECEIPT_MAX_BYTES;
}

export function isPdfReceipt(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

/** Uploads to the private bucket and returns the object path. Throws on failure. */
export async function uploadReceipt(orgId: string, file: File): Promise<string> {
  if (!supabase) throw new Error("Storage not configured");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function receiptSignedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

export async function removeReceipt(path: string): Promise<void> {
  if (!supabase) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
