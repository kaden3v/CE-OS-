/**
 * Shared domain literals — single source of truth for seeds and UI comparisons.
 * Order / sales strings match existing Title Case usage in pages (not lowercase API slugs).
 */

/** Display labels for Pinguicula (and other taxa) as used in seeds; short forms first for order-line modulo, then registry/listing long forms. */
export const CULTIVARS = [
  "P. 'Pirouette'",
  "P. agnata 'El Lobo'",
  "P. 'Johanna'",
  "P. gigantea",
  "P. moranensis",
  "P. agnata",
  "P. debbertiana",
  "P. 'Tina'",
  "P. 'Sethos'",
  "P. esseriana",
  "D. capensis 'Red'",
  "Pinguicula 'Pirouette'",
  "Pinguicula agnata 'El Lobo'",
  "Pinguicula 'Johanna'",
  "Pinguicula gigantea",
  "Pinguicula moranensis",
  "Pinguicula agnata",
  "Pinguicula debbertiana",
  "Pinguicula 'Tina'",
  "Pinguicula 'Sethos'",
  "Pinguicula esseriana",
  "Drosera capensis 'Red'",
] as const;

/** Subset shown in QR generator dropdown (exact strings from QrGenerator). */
export const QR_GENERATOR_CULTIVARS = [
  "Pinguicula 'Pirouette'",
  "P. agnata 'El Lobo'",
  "Pinguicula 'Johanna'",
  "Pinguicula gigantea",
  "Pinguicula moranensis",
] as const;

export const ORDER_STATUSES = [
  "Pending",
  "Processing",
  "Packed",
  "Shipped",
  "Delivered",
  "Cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Sales channels + aggregate “Wholesale” used in dashboard reporting. */
export const SALES_CHANNELS = ["Etsy", "Shopify", "Wholesale"] as const;

export type SalesChannel = (typeof SALES_CHANNELS)[number];

/** Kanban column ids, left → right. */
export const PROPAGATION_STAGES = ["mother", "division", "establishment", "ready"] as const;

export type PropagationStage = (typeof PROPAGATION_STAGES)[number];

export const PROPAGATION_KANBAN_COLUMNS = [
  { id: "mother", title: "Mother Plants", count: 4 },
  { id: "division", title: "Division & Pullings", count: 12 },
  { id: "establishment", title: "Establishment", count: 8 },
  { id: "ready", title: "Ready for Sale", count: 24 },
] as const;

/** Hidden on the board when `settings.tissueCultureStagesEnabled` is false; batches stay in `establishment` but list under Division. */
export const PROPAGATION_TC_KANBAN_COLUMN_IDS = ["establishment"] as const;

/**
 * No bench / rack codes are modeled in the UI yet; placeholder for future useEntity fields.
 * (Pack flow uses a free-text BIN-… field only.)
 */
export const INVENTORY_LOCATIONS = [] as const;

export type InventoryLocation = (typeof INVENTORY_LOCATIONS)[number];

export const SEED_CUSTOMER_NAMES = [
  "Sarah Chen",
  "Marcus Aldana",
  "Priya Patel",
  "John Doe",
  "Alice Smith",
  "Bob Johnson",
  "Emma Wilson",
  "James Taylor",
  "Sophia Davis",
  "Luis Garcia",
] as const;

/** Name rotation for Customers page mock rows (matches previous inline pool). */
export const CUSTOMERS_PAGE_NAME_POOL = [
  "Sarah Chen",
  "Marcus Aldana",
  "Priya Patel",
  "Alice Smith",
  "Luis Garcia",
  "Emma Wilson",
] as const;

/** Max persisted rows for the lightweight local write log (`changelog` storage). FIFO drops oldest. */
export const CHANGELOG_MAX_ENTRIES = 1000;

/** Serialized diff payload cap; larger diffs store {@link ChangeLogSchema} `__summary` only. */
export const CHANGELOG_MAX_BYTES = 4096;
