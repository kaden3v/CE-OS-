import {
  CULTIVARS,
  ORDER_STATUSES,
  SALES_CHANNELS,
  SEED_CUSTOMER_NAMES,
} from "@/lib/constants";
import type { Cultivar, Order, OrderLineItem, PropagationBatch } from "@/lib/schemas";

export type { Order, OrderLineItem, Cultivar, PropagationBatch };

const ORDER_LINE_CULTIVARS = CULTIVARS.slice(0, 11);

const SEED_EPOCH_MS = new Date("2024-06-01T12:00:00Z").getTime();

export const seedOrders: Order[] = Array.from({ length: 30 }, (_, i) => {
  const created = new Date(SEED_EPOCH_MS - i * 86400000 * 3).toISOString();
  return {
    id: `ORD-${1200 + i}`,
    channel: SALES_CHANNELS[i % 2],
    customer: SEED_CUSTOMER_NAMES[i % SEED_CUSTOMER_NAMES.length],
    items: Array.from({ length: (i % 3) + 1 }, (_, j) => ({
      name: ORDER_LINE_CULTIVARS[(i + j) % ORDER_LINE_CULTIVARS.length],
      qty: (i + j) % 2 + 1,
      priceCents: (15 + ((i * 3 + j * 5) % 20)) * 100,
    })),
    status: ORDER_STATUSES[i % ORDER_STATUSES.length],
    created,
    updatedAt: created,
  };
});

/** Dashboard “recent orders” strip — summary rows (not full {@link Order}). */
export type DashboardOrderSummary = {
  id: string;
  channel: string;
  customer: string;
  items: number;
  status: string;
  subtotalCents: number;
  created: string;
};

export const mockOrders: DashboardOrderSummary[] = [
  { id: "ORD-1201", channel: SALES_CHANNELS[1], customer: "Sarah Chen", items: 3, status: ORDER_STATUSES[0], subtotalCents: 8500, created: "2 hours ago" },
  { id: "ORD-1202", channel: SALES_CHANNELS[0], customer: "Marcus Aldana", items: 1, status: ORDER_STATUSES[1], subtotalCents: 2850, created: "4 hours ago" },
  { id: "ORD-1203", channel: SALES_CHANNELS[1], customer: "Priya Patel", items: 2, status: ORDER_STATUSES[2], subtotalCents: 4200, created: "5 hours ago" },
  { id: "ORD-1204", channel: SALES_CHANNELS[0], customer: "John Doe", items: 1, status: ORDER_STATUSES[3], subtotalCents: 1800, created: "1 day ago" },
  { id: "ORD-1205", channel: SALES_CHANNELS[1], customer: "Alice Smith", items: 4, status: ORDER_STATUSES[4], subtotalCents: 11200, created: "3 days ago" },
  { id: "ORD-1206", channel: SALES_CHANNELS[0], customer: "Bob Johnson", items: 1, status: ORDER_STATUSES[5], subtotalCents: 2500, created: "1 week ago" },
];

export const seedCultivars: Cultivar[] = [
  { id: 1, name: "Pinguicula 'Pirouette'", common: "Pirouette", genus: "Pinguicula", origin: "Hybrid", acquired: "2023-04-12", active: true, notes: "Fast growing, vigorous.", careNotes: "", listed: true },
  { id: 2, name: "P. agnata 'El Lobo'", common: "El Lobo", genus: "Pinguicula", origin: "Mexico", acquired: "2024-01-05", active: true, notes: "Needs dry winter rest.", careNotes: "", listed: false },
  { id: 3, name: "Pinguicula 'Johanna'", common: "P. agnata × P. debbertiana", genus: "Pinguicula", origin: "Hybrid", acquired: "2023-11-20", active: true, notes: "", careNotes: "", listed: true },
  { id: 4, name: "Pinguicula gigantea", common: "Giant Butterwort", genus: "Pinguicula", origin: "Mexico", acquired: "2022-09-14", active: true, notes: "Sticky on both sides of leaves.", careNotes: "", listed: false },
  { id: 5, name: "Pinguicula moranensis", common: "Mexican Butterwort", genus: "Pinguicula", origin: "Mexico", acquired: "2022-05-10", active: true, notes: "", careNotes: "", listed: true },
  { id: 6, name: "Pinguicula agnata", common: "Agnata", genus: "Pinguicula", origin: "Mexico", acquired: "2023-02-18", active: true, notes: "", careNotes: "", listed: false },
  { id: 7, name: "Pinguicula debbertiana", common: "Debbertiana", genus: "Pinguicula", origin: "Mexico", acquired: "2024-03-01", active: true, notes: "", careNotes: "", listed: false },
  { id: 8, name: "Pinguicula 'Tina'", common: "Tina", genus: "Pinguicula", origin: "Hybrid (Zecheri x Agnata)", acquired: "2023-08-30", active: true, notes: "", careNotes: "", listed: true },
  { id: 9, name: "Pinguicula 'Sethos'", common: "Sethos", genus: "Pinguicula", origin: "Hybrid (Ehlersiae x Moranensis)", acquired: "2023-07-15", active: true, notes: "", careNotes: "", listed: false },
  { id: 10, name: "Pinguicula esseriana", common: "Esseriana", genus: "Pinguicula", origin: "Mexico", acquired: "2023-10-05", active: true, notes: "", careNotes: "", listed: false },
  { id: 11, name: "Drosera capensis 'Red'", common: "Red Cape Sundew", genus: "Drosera", origin: "South Africa", acquired: "2022-06-20", active: true, notes: "Weed.", careNotes: "", listed: false },
];

export const seedPropagationBatches: PropagationBatch[] = [
  { id: "B-101", cultivar: "P. 'Pirouette'", targetId: 1, count: 42, stage: "establishment", started: "3 weeks ago", estReady: "Next week", notes: "" },
  { id: "B-102", cultivar: "P. gigantea", targetId: 5, count: 18, stage: "division", started: "5 days ago", estReady: "In 4 weeks", notes: "Slight browning on edges" },
  { id: "B-103", cultivar: "P. esseriana", targetId: 2, count: 65, stage: "ready", started: "2 months ago", estReady: "Now", notes: "Excellent coloration" },
  { id: "B-104", cultivar: "P. agnata", targetId: 3, count: 5, stage: "mother", started: "1 year ago", estReady: "N/A", notes: "Ready for division" },
  { id: "B-105", cultivar: "P. 'Tina'", targetId: 7, count: 30, stage: "division", started: "1 week ago", estReady: "In 3 weeks", notes: "" },
];

export const seedProtocols = [
  { id: 1, type: "Media Recipe", title: "1/2 MS Modification", content: "Modified Murashige and Skoog medium containing 50% macronutrients.", ingredients: ["1/2 MS salts", "30g/L Sucrose", "7g/L Agar", "pH 5.7"], lastUpdated: "March 2024" },
  { id: 2, type: "Sterilization", title: "Pinguicula Leaf Pulling Sterilization", content: "Standard protocol for surface sterilization of Pinguicula leaf cuttings before initiation.", ingredients: ["10% Bleach (0.5% NaOCl)", "0.1% Tween 20", "Sterile Water x3"], lastUpdated: "April 2024" },
  { id: 3, type: "Multiplication", title: "High-BA Multiplication Phase", content: "Used for rapid multiplication of recalcitrant species.", ingredients: ["1/2 MS Base", "1.0 mg/L BA", "0.1 mg/L NAA", "pH 5.7"], lastUpdated: "January 2024" },
];

export const seedListings = [
  { id: "LST-001", cultivar: "Pinguicula 'Pirouette'", sku: "PING-PIR-01", price: 20.0, shopify: "active", etsy: "active", stock: 12 },
  { id: "LST-002", cultivar: "Pinguicula agnata 'El Lobo'", sku: "PING-AGN-ELB", price: 25.0, shopify: "sold_out", etsy: "draft", stock: 0 },
  { id: "LST-003", cultivar: "Pinguicula esseriana", sku: "PING-ESS-01", price: 15.0, shopify: "syncing", etsy: "active", stock: 45 },
  { id: "LST-004", cultivar: "Drosera capensis 'Red'", sku: "DROS-CAP-RED", price: 10.0, shopify: "active", etsy: "active", stock: 54 },
];

export const DASHBOARD_CHANNEL_DATA = [
  { name: SALES_CHANNELS[1], value: 450 },
  { name: SALES_CHANNELS[0], value: 320 },
  { name: SALES_CHANNELS[2], value: 150 },
];

export const DASHBOARD_CULTIVAR_CHART_DATA = [
  { name: "'Pirouette'", value: 400 },
  { name: "'El Lobo'", value: 300 },
  { name: "gigantea", value: 300 },
  { name: "esseriana", value: 200 },
];
