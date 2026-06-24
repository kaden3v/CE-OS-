/**
 * Toast summary for a batch of writes where `ok` succeeded and `failed` failed.
 * Shared by the bulk delete / re-categorize / apply-suggestions handlers so the
 * success-vs-partial-vs-total-failure messaging stays consistent and testable.
 */
export type ToastStatus = "ok" | "info" | "warn" | "alert";

export interface WriteSummary {
  title: string;
  status: ToastStatus;
}

/**
 * Success reads "<ok> <verbPast>"; any failure reads "<VerbPast> <ok>, <failed>
 * failed" and escalates to "warn" (some succeeded) or "alert" (none did).
 */
export function summarizeWrites(
  ok: number,
  failed: number,
  opts: { verbPast: string; successStatus?: ToastStatus },
): WriteSummary {
  if (failed === 0) {
    return { title: `${ok} ${opts.verbPast}`, status: opts.successStatus ?? "ok" };
  }
  const verb = opts.verbPast.charAt(0).toUpperCase() + opts.verbPast.slice(1);
  return { title: `${verb} ${ok}, ${failed} failed`, status: ok === 0 ? "alert" : "warn" };
}
