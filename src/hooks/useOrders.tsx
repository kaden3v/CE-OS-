import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { logDbError } from "@/lib/dbErrors";
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
    return { ok: true };
  };

  return { data, isLoading, createOrder, updateStatus, deleteOrder, refresh: fetchAll };
}
