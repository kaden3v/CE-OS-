import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { logDbError } from "@/lib/dbErrors";
import { parseFile } from "@/lib/etsy/parse";
import { buildPlan } from "@/lib/etsy/project";
import type { CommitOutcome, ImportPlan, ParsedFile, StagedRow } from "@/lib/etsy/types";

/**
 * Orchestrates the Etsy CSV import: parse files → preview plan → commit.
 *
 * Idempotency is anchored on the `etsy_imports` staging table: every parsed row
 * is staged with a unique (user_id, csv_type, etsy_key). On commit we insert
 * staging rows ignoring duplicates, then project ONLY the newly-staged rows into
 * orders / order_items / expenses / customers. Re-importing the same file (or an
 * overlapping date range) therefore writes nothing.
 */
export function useEtsyImport() {
  const { user } = useAuth();
  const canCommit = !!user && !!supabase;

  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [committing, setCommitting] = useState(false);
  const [outcome, setOutcome] = useState<CommitOutcome | null>(null);

  const allStaged = useMemo<StagedRow[]>(
    () => files.flatMap((f) => f.rows.map((r) => ({ ...r, sourceFile: f.fileName }))),
    [files],
  );

  const plan: ImportPlan | null = useMemo(
    () => (allStaged.length ? buildPlan(allStaged) : null),
    [allStaged],
  );

  const addFiles = useCallback(async (incoming: File[]) => {
    setOutcome(null);
    const parsed = await Promise.all(incoming.map(parseFile));
    setFiles((prev) => [...prev, ...parsed]);
  }, []);

  const removeFile = useCallback((fileName: string) => {
    setFiles((prev) => prev.filter((f) => f.fileName !== fileName));
    setOutcome(null);
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
    setOutcome(null);
  }, []);

  const commit = useCallback(async (): Promise<CommitOutcome> => {
    const errors: string[] = [];
    const empty: CommitOutcome = {
      ordersWritten: 0, itemsWritten: 0, expensesWritten: 0,
      customersWritten: 0, duplicatesSkipped: 0, errors,
    };
    if (!canCommit || !plan) {
      errors.push("Sign in to commit an import.");
      return { ...empty, errors };
    }
    setCommitting(true);
    try {
      const db = supabase as any; // etsy_imports is not in the generated types
      const uid = user!.id;
      const batchId = crypto.randomUUID();

      // 1) Stage raw rows; ignore rows already imported. Inserted rows = new data.
      const stageRows = allStaged.map((s) => ({
        user_id: uid,
        import_batch_id: batchId,
        source_file: s.sourceFile ?? "upload.csv",
        csv_type: s.csvType,
        etsy_key: s.etsyKey,
        row_type: s.rowType,
        order_external_id: s.orderExternalId,
        occurred_on: s.occurredOn,
        amount: s.amount,
        raw: s.raw,
      }));
      const { data: inserted, error: stageErr } = await db
        .from("etsy_imports")
        .upsert(stageRows, { onConflict: "user_id,csv_type,etsy_key", ignoreDuplicates: true })
        .select("csv_type,etsy_key");
      if (stageErr) {
        logDbError("etsy stage", stageErr);
        errors.push(`Staging failed: ${stageErr.message}`);
        return { ...empty, errors };
      }
      const newKeys = new Set((inserted ?? []).map((r: any) => `${r.csv_type}|${r.etsy_key}`));
      const distinctKeys = new Set(allStaged.map((s) => `${s.csvType}|${s.etsyKey}`));
      const duplicatesSkipped = distinctKeys.size - newKeys.size;
      const today = new Date().toISOString().slice(0, 10);
      let hardError = false; // a real insert/update failure (vs. a soft warning)

      // 2) Project ONLY newly-staged rows.
      const freshStaged = allStaged.filter((s) => newKeys.has(`${s.csvType}|${s.etsyKey}`));
      const freshPlan = buildPlan(freshStaged);

      // 3) Customers — resolve existing by name, insert the rest, map name→id.
      const custMap = new Map<string, string>();
      let customersWritten = 0;
      const wantedNames = freshPlan.customers.map((c) => c.name);
      if (wantedNames.length) {
        const { data: existing } = await supabase!
          .from("customers").select("id,name").eq("user_id", uid).in("name", wantedNames);
        (existing ?? []).forEach((c) => custMap.set(c.name.toLowerCase(), c.id));
        const toInsert = freshPlan.customers.filter((c) => !custMap.has(c.name.toLowerCase()));
        if (toInsert.length) {
          const { data: newCust, error } = await supabase!
            .from("customers").insert(toInsert.map((c) => ({ user_id: uid, name: c.name }))).select("id,name");
          if (error) { errors.push(`Customers: ${error.message}`); hardError = true; }
          (newCust ?? []).forEach((c) => custMap.set(c.name.toLowerCase(), c.id));
          customersWritten = newCust?.length ?? 0;
        }
      }

      // 4) Orders — resolve existing by external_id; insert missing; and upgrade
      //    pre-existing ledger stubs once the authoritative Sold Orders row arrives.
      const orderMap = new Map<string, string>();
      const preExisting = new Set<string>();
      const referencedIds = Array.from(
        new Set([...freshPlan.orders.map((o) => o.externalId), ...freshPlan.items.map((i) => i.orderExternalId)]),
      );
      if (referencedIds.length) {
        const { data: existingOrders } = await supabase!
          .from("orders").select("id,external_id").eq("user_id", uid).eq("channel", "etsy").in("external_id", referencedIds);
        (existingOrders ?? []).forEach((o) => {
          if (o.external_id) { orderMap.set(o.external_id, o.id); preExisting.add(o.external_id); }
        });
      }
      const ordersToInsert = freshPlan.orders.filter((o) => !orderMap.has(o.externalId));
      let ordersWritten = 0;
      if (ordersToInsert.length) {
        const { data: newOrders, error } = await supabase!
          .from("orders")
          .insert(ordersToInsert.map((o) => ({
            user_id: uid,
            external_id: o.externalId,
            channel: o.channel,
            status: o.status,
            placed_at: o.placedAt ?? today,
            subtotal: o.subtotal,
            shipping: o.shipping,
            tax: o.tax,
            total: o.total,
            notes: o.notes,
            customer_id: o.customerName ? custMap.get(o.customerName.toLowerCase()) ?? null : null,
          })))
          .select("id,external_id");
        if (error) { errors.push(`Orders: ${error.message}`); hardError = true; }
        (newOrders ?? []).forEach((o) => o.external_id && orderMap.set(o.external_id, o.id));
        ordersWritten = newOrders?.length ?? 0;
      }
      // Refresh stubs with authoritative Sold Orders totals (don't clobber with ledger data).
      for (const o of freshPlan.orders.filter((o) => preExisting.has(o.externalId) && o.source === "orders")) {
        const { error } = await supabase!
          .from("orders")
          .update({
            subtotal: o.subtotal, shipping: o.shipping, tax: o.tax, total: o.total,
            placed_at: o.placedAt ?? today,
            customer_id: o.customerName ? custMap.get(o.customerName.toLowerCase()) ?? null : null,
          })
          .eq("user_id", uid).eq("channel", "etsy").eq("external_id", o.externalId);
        if (error) { errors.push(`Order ${o.externalId}: ${error.message}`); hardError = true; }
      }

      // 5) Line items — resolve order_id; dedup against existing rows (so a retry
      //    or overlapping import can't duplicate); skip orphans.
      let itemsWritten = 0;
      type ItemInsert = { user_id: string; order_id: string; name_snapshot: string; qty: number; price: number };
      const itemKey = (oid: string, name: string, qty: number, price: number) =>
        `${oid}|${name}|${qty}|${Number(price).toFixed(2)}`;
      const resolved = freshPlan.items
        .map((i): ItemInsert | null => {
          const orderId = orderMap.get(i.orderExternalId);
          if (!orderId) return null;
          return { user_id: uid, order_id: orderId, name_snapshot: i.nameSnapshot, qty: i.qty, price: i.price };
        })
        .filter((r): r is ItemInsert => r !== null);
      const orphanItems = freshPlan.items.length - resolved.length;
      if (orphanItems > 0) errors.push(`${orphanItems} line item(s) had no matching order and were skipped.`);
      if (resolved.length) {
        const orderIds = Array.from(new Set(resolved.map((r) => r.order_id)));
        const { data: existingItems } = await supabase!
          .from("order_items").select("order_id,name_snapshot,qty,price").eq("user_id", uid).in("order_id", orderIds);
        const seen = new Set((existingItems ?? []).map((r) => itemKey(r.order_id, r.name_snapshot, r.qty, Number(r.price))));
        const itemRows = resolved.filter((r) => {
          const k = itemKey(r.order_id, r.name_snapshot, r.qty, r.price);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        if (itemRows.length) {
          const { data: newItems, error } = await supabase!.from("order_items").insert(itemRows).select("id");
          if (error) { errors.push(`Line items: ${error.message}`); hardError = true; }
          itemsWritten = newItems?.length ?? 0;
        }
      }

      // 6) Expenses (fees / ads / refunds) — dedup against existing rows too.
      let expensesWritten = 0;
      if (freshPlan.expenses.length) {
        const expKey = (date: string, amount: number, category: string, description: string) =>
          `${date}|${Number(amount).toFixed(2)}|${category}|${description}`;
        const cats = Array.from(new Set(freshPlan.expenses.map((e) => e.category)));
        const dates = Array.from(new Set(freshPlan.expenses.map((e) => e.occurredOn ?? today)));
        const { data: existingExp } = await supabase!
          .from("expenses").select("occurred_on,amount,category,description")
          .eq("user_id", uid).in("category", cats).in("occurred_on", dates);
        const seenExp = new Set(
          (existingExp ?? []).map((e) => expKey(e.occurred_on, Number(e.amount), e.category ?? "", e.description ?? "")),
        );
        const expRows = freshPlan.expenses
          .map((e) => ({ user_id: uid, amount: e.amount, category: e.category, occurred_on: e.occurredOn ?? today, description: e.description }))
          .filter((e) => {
            const k = expKey(e.occurred_on, e.amount, e.category, e.description);
            if (seenExp.has(k)) return false;
            seenExp.add(k);
            return true;
          });
        if (expRows.length) {
          const { data: newExp, error } = await supabase!.from("expenses").insert(expRows).select("id");
          if (error) { errors.push(`Expenses: ${error.message}`); hardError = true; }
          expensesWritten = newExp?.length ?? 0;
        }
      }

      // 7) On a hard write failure, un-stage this batch so the rows reprocess on a
      //    later retry. All domain writes above are idempotent (existence checks),
      //    so re-running is safe — and without this, staged-but-unwritten rows
      //    would be silently excluded from every future import.
      if (hardError) {
        const { error: rollbackErr } = await db
          .from("etsy_imports").delete().eq("user_id", uid).eq("import_batch_id", batchId);
        if (rollbackErr) {
          logDbError("etsy stage rollback", rollbackErr);
          errors.push(`Couldn't roll back staging batch ${batchId}; re-import may skip rows.`);
        }
      }

      const result: CommitOutcome = {
        ordersWritten,
        itemsWritten,
        expensesWritten,
        customersWritten,
        duplicatesSkipped,
        errors,
      };
      setOutcome(result);
      return result;
    } finally {
      setCommitting(false);
    }
  }, [allStaged, canCommit, plan, user]);

  return { files, plan, addFiles, removeFile, clear, commit, committing, outcome, canCommit };
}
