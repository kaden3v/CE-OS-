import { z } from "zod";
import {
  ORDER_STATUSES,
  PROPAGATION_STAGES,
  SALES_CHANNELS,
} from "@/lib/constants";
import type { OrderStatus, PropagationStage, SalesChannel } from "@/lib/constants";

const salesChannelSchema = z.enum(
  SALES_CHANNELS as unknown as [SalesChannel, ...SalesChannel[]]
);

const orderStatusSchema = z.enum(
  ORDER_STATUSES as unknown as [OrderStatus, ...OrderStatus[]]
);

const propagationStageSchema = z.enum(
  PROPAGATION_STAGES as unknown as [PropagationStage, ...PropagationStage[]]
);

const licenseTypeSchema = z.enum(["Federal", "State", "Local", "Business"]);

/** Order line — unit price in integer USD cents. */
export const OrderLineItemSchema = z
  .object({
    name: z.string(),
    qty: z.number().int().positive(),
    priceCents: z.number().int().nonnegative(),
  })
  .strict();

export type OrderLineItem = z.infer<typeof OrderLineItemSchema>;

/** Channel + status enums match {@link SALES_CHANNELS} / {@link ORDER_STATUSES}. */
export const OrderSchema = z
  .object({
    id: z.string(),
    channel: salesChannelSchema,
    customer: z.string(),
    items: z.array(OrderLineItemSchema),
    status: orderStatusSchema,
    /** ISO 8601 UTC instant only (`…Z` / explicit offset). See `src/lib/dates.ts`. */
    created: z.string().datetime({ offset: true }),
    /** Last mutation time — used for cross-tab conflict detection before writes. */
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type Order = z.infer<typeof OrderSchema>;

/** Side-effect write log for debugging (“what did I change?”). Not a compliance audit trail. */
export const ChangeLogDiffSchema = z.record(
  z.string(),
  z.tuple([z.unknown(), z.unknown()])
);

export const ChangeLogSchema = z
  .object({
    id: z.string().uuid(),
    resource: z.string(),
    /** Entity primary key as stored (e.g. order ids like `ORD-1201`, UUID strings, etc.). */
    resourceId: z.string().min(1),
    action: z.enum(["create", "update", "delete"]),
    diff: ChangeLogDiffSchema,
    timestamp: z.string().datetime({ offset: true }),
    source: z.enum(["ui", "migration", "sync", "system"]),
  })
  .strict();

export type ChangeLog = z.infer<typeof ChangeLogSchema>;

/** Bench stock counts by stage (same shape as Inventory page). */
export const InventoryStockSchema = z
  .object({
    juv: z.number().int().nonnegative(),
    mat: z.number().int().nonnegative(),
    flower: z.number().int().nonnegative(),
  })
  .strict();

export const InventorySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    common: z.string(),
    genus: z.string(),
    stock: InventoryStockSchema,
    /** Human-readable relative time string from the UI (not ISO). */
    lastUpdated: z.string().min(1),
  })
  .strict();

export type InventoryItem = z.infer<typeof InventorySchema>;

export const CultivarSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    common: z.string(),
    genus: z.string(),
    origin: z.string(),
    acquired: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    active: z.boolean(),
    notes: z.string(),
    careNotes: z.string(),
    listed: z.boolean(),
  })
  .strict();

export type Cultivar = z.infer<typeof CultivarSchema>;

/** Customers page mock row — lifetime value in USD cents. */
export const CustomerSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    email: z.string(),
    channel: z.string(),
    orders: z.number().int().nonnegative(),
    ltvCents: z.number().int().nonnegative(),
    lastOrder: z.string(),
    rosetteSubscriber: z.boolean(),
  })
  .strict();

export type Customer = z.infer<typeof CustomerSchema>;

export const PropagationBatchSchema = z
  .object({
    id: z.string(),
    cultivar: z.string(),
    targetId: z.number().int().positive(),
    count: z.number().int().nonnegative(),
    stage: propagationStageSchema,
    started: z.string(),
    estReady: z.string(),
    notes: z.string(),
  })
  .strict();

export type PropagationBatch = z.infer<typeof PropagationBatchSchema>;

/** Vendor directory row — YTD spend in USD cents. */
export const VendorSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    category: z.string(),
    ytdCents: z.number().int().nonnegative(),
    lastOrder: z.string(),
    contact: z.string(),
  })
  .strict();

export type Vendor = z.infer<typeof VendorSchema>;

export const LicenseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    number: z.string(),
    body: z.string(),
    type: licenseTypeSchema,
    expires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().optional(),
  })
  .strict();

export type License = z.infer<typeof LicenseSchema>;

/** Supplies page row — quantities as labeled strings (no currency fields). */
export const SupplySchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    stock: z.string(),
    threshold: z.string(),
    vendor: z.string(),
    lastOrdered: z.string(),
    low: z.boolean(),
  })
  .strict();

export type Supply = z.infer<typeof SupplySchema>;
