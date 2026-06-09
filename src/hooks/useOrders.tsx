import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { logDbError } from "@/lib/dbErrors";
import type { Tables } from "@/lib/database.types";
import { demoList, demoInsert, demoInsertMany, demoUpdate, demoDelete, demoDeleteWhere } from "@/lib/demo/store";

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
  const { user, isDemo } = useAuth();
  const ready = isDemo || (!!user && !!supabase);

  const [data, setData] = useState<OrderWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(ready);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setIsLoading(true);
    if (isDemo) {
      const orders = demoList("orders", { orderBy: "placed_at", ascending: false }) as unknown as OrderRow[];
      const allItems = demoList("order_items", { orderBy: "created_at", ascending: true }) as unknown as OrderItemRow[];
      const customers = demoList("customers") as unknown as CustomerRow[];
      const withRelations: OrderWithRelations[] = orders.map((o) => {
        const c = o.customer_id ? customers.find((x) => x.id === o.customer_id) : undefined;
        return {
          ...o,
          customer: c ? { id: c.id, name: c.name, email: c.email } : null,
          items: allItems.filter((it) => it.order_id === o.id),
        };
      });
      setData(withRelations);
      setIsLoading(false);
      return;
    }
    const { data: rows, error } = await supabase!
      .from("orders")
      .select("*, customer:customers(id,name,email), items:order_items(*)")
      .eq("user_id", user!.id)
      .order("placed_at", { ascending: false });
    if (error) {
      logDbError("fetch orders", error);
      setIsLoading(false);
      return;
    }
    setData((rows ?? []) as unknown as OrderWithRelations[]);
    setIsLoading(false);
  }, [ready, user?.id]);

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
    if (isDemo) {
      const orderId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      demoInsert("orders", {
        id: orderId,
        user_id: user!.id,
        customer_id: input.customer_id,
        channel: input.channel,
        status: input.status ?? "pending",
        notes: input.notes ?? null,
        external_id: null,
        subtotal,
        shipping: 0,
        tax: 0,
        total: subtotal,
        placed_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      });
      if (input.items.length > 0) {
        demoInsertMany(
          "order_items",
          input.items.map((it) => ({
            id: crypto.randomUUID(),
            user_id: user!.id,
            order_id: orderId,
            cultivar_id: it.cultivar_id,
            inventory_id: it.inventory_id,
            name_snapshot: it.name_snapshot,
            qty: it.qty,
            price: it.price,
            created_at: nowIso,
          })),
        );
      }
      await fetchAll();
      return { ok: true, orderId };
    }
    const { data: orderRows, error: orderErr } = await supabase!
      .from("orders")
      .insert({
        user_id: user!.id,
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
    if (isDemo) {
      demoUpdate("orders", id, { status, updated_at: new Date().toISOString() });
      setData((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
      return { ok: true };
    }
    const { error } = await supabase!
      .from("orders")
      .update({ status })
      .eq("id", id)
      .eq("user_id", user!.id);
    if (error) {
      logDbError("update order status", error);
      return { ok: false, code: error.code };
    }
    setData((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    return { ok: true };
  };

  const deleteOrder = async (id: string): Promise<{ ok: boolean; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    if (isDemo) {
      demoDelete("orders", id);
      demoDeleteWhere("order_items", { order_id: id });
      setData((prev) => prev.filter((o) => o.id !== id));
      return { ok: true };
    }
    const { error } = await supabase!.from("orders").delete().eq("id", id).eq("user_id", user!.id);
    if (error) {
      logDbError("delete order", error);
      return { ok: false, code: error.code };
    }
    setData((prev) => prev.filter((o) => o.id !== id));
    return { ok: true };
  };

  return { data, isLoading, createOrder, updateStatus, deleteOrder, refresh: fetchAll };
}
