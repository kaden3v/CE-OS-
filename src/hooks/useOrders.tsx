import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { logDbError } from "@/lib/dbErrors";
import { logActivity } from "@/lib/activity";
import type { Tables } from "@/lib/database.types";

export type OrderRow = Tables<"orders">;
export type OrderItemRow = Tables<"order_items">;
export type CustomerRow = Tables<"customers">;

export type OrderWithRelations = OrderRow & {
  customer: Pick<CustomerRow, "id" | "name" | "email"> | null;
  items: OrderItemRow[];
};

/**
 * Orders hook with line-item joins.
 * Pulls orders + items + customer name with one fetch (Supabase row-nesting).
 */
export function useOrders() {
  const { user, activeOrgId } = useAuth();
  const ready = !!user && !!supabase && !!activeOrgId;

  const [data, setData] = useState<OrderWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(ready);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setIsLoading(true);
    const { data: rows, error } = await supabase!
      .from("orders")
      .select("*, customer:customers(id,name,email), items:order_items(*)")
      .eq("org_id", activeOrgId!)
      .order("placed_at", { ascending: false });
    if (error) {
      logDbError("fetch orders", error);
      setIsLoading(false);
      return;
    }
    setData((rows ?? []) as unknown as OrderWithRelations[]);
    setIsLoading(false);
  }, [ready, activeOrgId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Live refresh when a teammate touches orders or line items. Events are just
  // a signal; the refetch itself is org-scoped + RLS-filtered.
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refetchSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void fetchAll(), 250);
    };
    const channel = supabase!
      .channel(`rt-orders-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refetchSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, refetchSoon)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [ready, fetchAll]);

  const createOrder = async (input: {
    customer_id: string | null;
    channel: string;
    status?: string;
    notes?: string | null;
    items: Array<{ cultivar_id: string | null; inventory_id: string | null; name_snapshot: string; qty: number; price: number }>;
  }): Promise<{ ok: boolean; code?: string; orderId?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    const subtotal = input.items.reduce((s, it) => s + it.qty * it.price, 0);
    const { data: orderRows, error: orderErr } = await supabase!
      .from("orders")
      .insert({
        user_id: user!.id,
        org_id: activeOrgId!,
        customer_id: input.customer_id,
        channel: input.channel,
        status: input.status ?? "pending",
        notes: input.notes ?? null,
        subtotal,
        shipping: 0,
        tax: 0,
        total: subtotal,
      })
      .select()
      .single();
    if (orderErr || !orderRows) {
      logDbError("create order", orderErr);
      return { ok: false, code: orderErr?.code };
    }
    if (input.items.length > 0) {
      const { error: itemErr } = await supabase!.from("order_items").insert(
        input.items.map((it) => ({
          user_id: user!.id,
          org_id: activeOrgId!,
          order_id: orderRows.id,
          cultivar_id: it.cultivar_id,
          inventory_id: it.inventory_id,
          name_snapshot: it.name_snapshot,
          qty: it.qty,
          price: it.price,
        })),
      );
      if (itemErr) {
        logDbError("create order_items", itemErr);
        // Roll back the order to avoid orphaned headers
        await supabase!.from("orders").delete().eq("id", orderRows.id);
        return { ok: false, code: itemErr.code };
      }
    }
    await fetchAll();
    logActivity({
      orgId: activeOrgId!,
      actorId: user!.id,
      action: "created",
      entity: "orders",
      entityId: orderRows.id,
      summary: `${input.channel} order · ${input.items.length} item${input.items.length === 1 ? "" : "s"}`,
    });
    return { ok: true, orderId: orderRows.id };
  };

  const updateStatus = async (id: string, status: OrderRow["status"]): Promise<{ ok: boolean; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    const { error } = await supabase!
      .from("orders")
      .update({ status })
      .eq("id", id)
      .eq("org_id", activeOrgId!);
    if (error) {
      logDbError("update order status", error);
      return { ok: false, code: error.code };
    }
    setData((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    logActivity({
      orgId: activeOrgId!,
      actorId: user!.id,
      action: "updated",
      entity: "orders",
      entityId: id,
      summary: `status → ${status}`,
    });
    return { ok: true };
  };

  /** Persist the order's subtotal/total after its items changed. */
  const recalcTotals = async (orderId: string, items: Array<{ qty: number; price: number }>) => {
    const order = data.find((o) => o.id === orderId);
    const subtotal = items.reduce((s, it) => s + Number(it.price) * it.qty, 0);
    const total = subtotal + Number(order?.shipping ?? 0) + Number(order?.tax ?? 0);
    const { error } = await supabase!
      .from("orders")
      .update({ subtotal, total })
      .eq("id", orderId)
      .eq("org_id", activeOrgId!);
    if (error) logDbError("recalc order totals", error);
  };

  const updateItem = async (
    orderId: string,
    itemId: string,
    patch: { qty?: number; price?: number },
  ): Promise<{ ok: boolean; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    const { error } = await supabase!
      .from("order_items")
      .update(patch)
      .eq("id", itemId)
      .eq("org_id", activeOrgId!);
    if (error) {
      logDbError("update order item", error);
      return { ok: false, code: error.code };
    }
    const order = data.find((o) => o.id === orderId);
    if (order) {
      await recalcTotals(orderId, order.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
    }
    await fetchAll();
    logActivity({
      orgId: activeOrgId!,
      actorId: user!.id,
      action: "updated",
      entity: "orders",
      entityId: orderId,
      summary: "line item changed",
    });
    return { ok: true };
  };

  const removeItem = async (orderId: string, itemId: string): Promise<{ ok: boolean; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    const order = data.find((o) => o.id === orderId);
    if (order && order.items.length <= 1) {
      // An order with zero items is meaningless — delete the order instead.
      return { ok: false, code: "LAST_ITEM" };
    }
    const { error } = await supabase!
      .from("order_items")
      .delete()
      .eq("id", itemId)
      .eq("org_id", activeOrgId!);
    if (error) {
      logDbError("remove order item", error);
      return { ok: false, code: error.code };
    }
    if (order) {
      await recalcTotals(orderId, order.items.filter((it) => it.id !== itemId));
    }
    await fetchAll();
    logActivity({
      orgId: activeOrgId!,
      actorId: user!.id,
      action: "updated",
      entity: "orders",
      entityId: orderId,
      summary: "line item removed",
    });
    return { ok: true };
  };

  const deleteOrder = async (id: string): Promise<{ ok: boolean; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    const { error } = await supabase!.from("orders").delete().eq("id", id).eq("org_id", activeOrgId!);
    if (error) {
      logDbError("delete order", error);
      return { ok: false, code: error.code };
    }
    setData((prev) => prev.filter((o) => o.id !== id));
    logActivity({
      orgId: activeOrgId!,
      actorId: user!.id,
      action: "deleted",
      entity: "orders",
      entityId: id,
    });
    return { ok: true };
  };

  return { data, isLoading, createOrder, updateStatus, updateItem, removeItem, deleteOrder, refresh: fetchAll };
}
