import { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Shared expense-import for channel sync (Etsy ledger, ...). One event → one
 * entry → many rollups: each imported charge becomes a single `expenses` row,
 * so it flows through every finance rollup (Overview, P&L, Tax Report) exactly
 * once. Idempotent by `external_id` — re-running a sync never duplicates.
 *
 * Mirrors _shared/import-order.ts. The caller passes the already-resolved org
 * owner (the sync run resolves it once for listings) so we don't re-query it.
 */

export interface OrgOwner {
  orgId: string;
  userId: string;
}

export interface NormalizedExpense {
  /** Stable cross-run dedupe key, e.g. "etsy-ledger:123". */
  externalId: string;
  /** Positive dollars. */
  amount: number;
  /** ISO date (YYYY-MM-DD), already in the business timezone. */
  occurredOn: string;
  category: string;
  scheduleC: string;
  scheduleF: string;
  description: string;
  /** Free-text vendor label kept on the row (no vendor_id link). */
  vendorName: string;
  /** Discriminator, e.g. "etsy". */
  source: string;
}

export interface ExpenseImportResult {
  ok: boolean;
  duplicate?: boolean;
  error?: string;
}

type Admin = SupabaseClient;

/**
 * Insert a single normalized expense. Idempotent by externalId — an entry that
 * already exists is left untouched (we never stomp a row a human may have
 * re-categorized).
 */
export async function importNormalizedExpense(
  admin: Admin,
  oo: OrgOwner,
  expense: NormalizedExpense,
): Promise<ExpenseImportResult> {
  const { data: existing } = await admin
    .from("expenses").select("id").eq("external_id", expense.externalId).maybeSingle();
  if (existing) return { ok: true, duplicate: true };

  const { error } = await admin.from("expenses").insert({
    org_id: oo.orgId,
    user_id: oo.userId,
    external_id: expense.externalId,
    amount: expense.amount,
    occurred_on: expense.occurredOn,
    category: expense.category,
    schedule_c_category: expense.scheduleC,
    schedule_f_category: expense.scheduleF,
    vendor_name: expense.vendorName,
    source: expense.source,
    deductible: true,
    description: expense.description,
  });
  if (error) {
    console.error("expense insert failed", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
