import {
  ORDER_ITEMS_COLUMNS,
  PAYMENTS_COLUMNS,
  SOLD_ORDERS_COLUMNS,
} from "./columns";
import { parseMoney, pick } from "./parse";
import type {
  CustomerDraft,
  ExpenseDraft,
  ImportPlan,
  OrderDraft,
  OrderItemDraft,
  StagedRow,
} from "./types";

/** Map an Etsy payment-ledger row type to a CE-OS expense category, or null
 *  if it isn't an expense (sales, deposits, taxes are handled elsewhere). */
function expenseCategory(rowType: string): string | null {
  const t = rowType.toLowerCase();
  if (t.includes("market") || t.includes("ads")) return "Etsy Ads";
  if (t.includes("refund")) return "Refund";
  if (t.includes("fee") || t.includes("listing") || t.includes("shipping label")) return "Etsy Fees";
  return null; // Sale / Deposit / Tax / Unknown → not an expense
}

/**
 * Build the full import plan from all staged rows across uploaded files.
 * Reconciles the payment ledger against order CSVs by Etsy order id.
 */
export function buildPlan(staged: StagedRow[]): ImportPlan {
  const orders = new Map<string, OrderDraft>();
  const items: OrderItemDraft[] = [];
  const expenses: ExpenseDraft[] = [];
  const customers = new Map<string, CustomerDraft>();
  let deposits = 0;
  let unmapped = 0;

  // 1) Orders from the Sold Orders CSV (richest source).
  for (const s of staged) {
    if (s.csvType !== "sold_orders") continue;
    const r = s.raw;
    const externalId = s.orderExternalId!;
    const name = pick(r, SOLD_ORDERS_COLUMNS.fullName) || pick(r, SOLD_ORDERS_COLUMNS.buyer) || null;
    orders.set(externalId, {
      externalId,
      source: "orders",
      channel: "etsy",
      placedAt: s.occurredOn,
      subtotal: parseMoney(pick(r, SOLD_ORDERS_COLUMNS.itemTotal)),
      shipping: parseMoney(pick(r, SOLD_ORDERS_COLUMNS.orderShipping)),
      tax: parseMoney(pick(r, SOLD_ORDERS_COLUMNS.orderSalesTax)),
      total: parseMoney(pick(r, SOLD_ORDERS_COLUMNS.orderValue)),
      status: (pick(r, SOLD_ORDERS_COLUMNS.status) || "completed").toLowerCase(),
      customerName: name,
      notes: "Imported from Etsy",
    });
    if (name) customers.set(name.toLowerCase(), { name });
  }

  // 2) Line items from the Order Items CSV.
  for (const s of staged) {
    if (s.csvType !== "order_items") continue;
    const r = s.raw;
    items.push({
      orderExternalId: s.orderExternalId!,
      nameSnapshot: pick(r, ORDER_ITEMS_COLUMNS.title) || "Etsy item",
      qty: Math.max(1, Math.round(parseMoney(pick(r, ORDER_ITEMS_COLUMNS.quantity)) || 1)),
      price: parseMoney(pick(r, ORDER_ITEMS_COLUMNS.price)),
    });
  }

  // 3) Payment ledger → expenses + reconcile/stub orders.
  for (const s of staged) {
    if (s.csvType !== "payments") continue;
    const r = s.raw;
    const type = s.rowType ?? "";
    const lc = type.toLowerCase();

    if (lc.includes("deposit")) {
      deposits++;
      continue; // bank transfer, not revenue
    }

    if (lc.includes("sale")) {
      // Reconcile to an existing order, or stub one from the ledger so a
      // finances-only import still yields orders.
      const id = s.orderExternalId;
      if (id && !orders.has(id)) {
        orders.set(id, {
          externalId: id,
          source: "ledger",
          channel: "etsy",
          placedAt: s.occurredOn,
          subtotal: s.amount ?? 0,
          shipping: 0,
          tax: 0,
          total: s.amount ?? 0,
          status: "completed",
          customerName: null,
          notes: "Imported from Etsy payment ledger",
        });
      }
      continue;
    }

    const category = expenseCategory(type);
    if (!category) {
      unmapped++;
      continue;
    }
    const fees = parseMoney(pick(r, PAYMENTS_COLUMNS.feesTaxes));
    const amount = Math.abs(s.amount ?? 0) || Math.abs(fees);
    if (amount === 0) {
      unmapped++;
      continue;
    }
    expenses.push({
      etsyKey: s.etsyKey,
      occurredOn: s.occurredOn,
      amount,
      category,
      description: [type, pick(r, PAYMENTS_COLUMNS.title), pick(r, PAYMENTS_COLUMNS.info)]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 280) || "Etsy charge",
    });
  }

  return {
    orders: [...orders.values()],
    items,
    expenses,
    customers: [...customers.values()],
    staged,
    skipped: { deposits, unmapped },
  };
}
