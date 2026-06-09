import { DEMO_USER_ID, DEMO_EMAIL, type DemoProfile } from "./ids";

/**
 * Realistic demo dataset for Canyon Exotics. Rows are in DB-row shape (the same
 * shape Supabase would return) so the data layer maps them identically to the
 * live path. Cross-table references use the fixed IDs below.
 */

const U = DEMO_USER_ID;
const nowMs = Date.now();
const DAY = 86_400_000;
const iso = (msAgo: number) => new Date(nowMs - msAgo).toISOString();
const day = (daysFromNow: number) =>
  new Date(nowMs + daysFromNow * DAY).toISOString().split("T")[0];

// --- Fixed IDs --------------------------------------------------------------
const CV = {
  pirouette: "cv-pirouette",
  hamata: "cv-hamata",
  capensis: "cv-capensis",
  leucophylla: "cv-leucophylla",
  b52: "cv-b52",
};
const INV = {
  pirouette: "inv-pirouette",
  hamata: "inv-hamata",
  capensis: "inv-capensis",
  leucophylla: "inv-leucophylla",
  b52: "inv-b52",
};
const CUS = {
  sarah: "cus-sarah",
  marcus: "cus-marcus",
  priya: "cus-priya",
  john: "cus-john",
  alice: "cus-alice",
};
const ORD = { o1: "ord-1201", o2: "ord-1202", o3: "ord-1203", o4: "ord-1204", o5: "ord-1205" };
const VEN = { biotone: "ven-biotone", clearpot: "ven-clearpot", mossco: "ven-mossco", uline: "ven-uline" };
const SHIP = { s1: "shp-1", s2: "shp-2", s3: "shp-3" };

// --- cultivars --------------------------------------------------------------
const cultivars = [
  { id: CV.pirouette, name: "Pinguicula 'Pirouette'", genus: "Pinguicula", common: "Butterwort", origin: "Mexican hybrid", user_id: U, updated_at: iso(2 * DAY) },
  { id: CV.hamata, name: "Nepenthes hamata", genus: "Nepenthes", common: "Tropical pitcher", origin: "Sulawesi highlands", user_id: U, updated_at: iso(5 * DAY) },
  { id: CV.capensis, name: "Drosera capensis", genus: "Drosera", common: "Cape sundew", origin: "South Africa", user_id: U, updated_at: iso(1 * DAY) },
  { id: CV.leucophylla, name: "Sarracenia leucophylla", genus: "Sarracenia", common: "White-top pitcher", origin: "Gulf Coast, USA", user_id: U, updated_at: iso(8 * DAY) },
  { id: CV.b52, name: "Dionaea muscipula 'B52'", genus: "Dionaea", common: "Venus flytrap", origin: "Carolinas, USA", user_id: U, updated_at: iso(3 * DAY) },
];

// --- inventory --------------------------------------------------------------
const inventory = [
  { id: INV.pirouette, name: "Pinguicula 'Pirouette'", genus: "Pinguicula", common: "Butterwort", cultivar_id: CV.pirouette, stock_juv: 12, stock_mat: 8, stock_flower: 3, user_id: U, updated_at: iso(2 * DAY) },
  { id: INV.hamata, name: "Nepenthes hamata", genus: "Nepenthes", common: "Tropical pitcher", cultivar_id: CV.hamata, stock_juv: 4, stock_mat: 2, stock_flower: 0, user_id: U, updated_at: iso(5 * DAY) },
  { id: INV.capensis, name: "Drosera capensis", genus: "Drosera", common: "Cape sundew", cultivar_id: CV.capensis, stock_juv: 40, stock_mat: 18, stock_flower: 6, user_id: U, updated_at: iso(1 * DAY) },
  { id: INV.leucophylla, name: "Sarracenia leucophylla", genus: "Sarracenia", common: "White-top pitcher", cultivar_id: CV.leucophylla, stock_juv: 6, stock_mat: 3, stock_flower: 1, user_id: U, updated_at: iso(8 * DAY) },
  { id: INV.b52, name: "Dionaea muscipula 'B52'", genus: "Dionaea", common: "Venus flytrap", cultivar_id: CV.b52, stock_juv: 2, stock_mat: 1, stock_flower: 0, user_id: U, updated_at: iso(3 * DAY) },
];

// --- customers --------------------------------------------------------------
const customers = [
  { id: CUS.sarah, name: "Sarah Chen", email: "sarah.chen@example.com", etsy_handle: null, shopify_id: "shopify_8842", phone: "555-0142", notes: "Repeat buyer — prefers Pinguicula.", user_id: U, created_at: iso(120 * DAY), updated_at: iso(2 * DAY) },
  { id: CUS.marcus, name: "Marcus Aldana", email: "marcus@aldanaexotics.com", etsy_handle: "AldanaExotics", shopify_id: null, phone: null, notes: null, user_id: U, created_at: iso(90 * DAY), updated_at: iso(4 * DAY) },
  { id: CUS.priya, name: "Priya Patel", email: "priya.patel@example.com", etsy_handle: null, shopify_id: "shopify_9021", phone: "555-0188", notes: "Wholesale inquiries.", user_id: U, created_at: iso(60 * DAY), updated_at: iso(5 * DAY) },
  { id: CUS.john, name: "John Doe", email: "jdoe@example.com", etsy_handle: "JDoePlants", shopify_id: null, phone: null, notes: null, user_id: U, created_at: iso(30 * DAY), updated_at: iso(6 * DAY) },
  { id: CUS.alice, name: "Alice Smith", email: "alice@greenhousecollective.com", etsy_handle: null, shopify_id: null, phone: "555-0210", notes: "Greenhouse Collective — wholesale account.", user_id: U, created_at: iso(15 * DAY), updated_at: iso(7 * DAY) },
];

// --- subscriptions ----------------------------------------------------------
const subscriptions = [
  { id: "sub-1", customer_id: CUS.sarah, tier: "Rosette+", status: "active", billing_cycle: "monthly", price: 19, started_at: iso(120 * DAY), current_period_end: day(12), cancelled_at: null, notes: null, user_id: U, created_at: iso(120 * DAY), updated_at: iso(2 * DAY) },
  { id: "sub-2", customer_id: CUS.priya, tier: "Rosette+", status: "active", billing_cycle: "annual", price: 190, started_at: iso(60 * DAY), current_period_end: day(305), cancelled_at: null, notes: "Annual wholesale tier.", user_id: U, created_at: iso(60 * DAY), updated_at: iso(5 * DAY) },
];

// --- orders + order_items ---------------------------------------------------
const orders = [
  { id: ORD.o1, channel: "shopify", customer_id: CUS.sarah, external_id: "SHOP-1201", status: "pending", notes: null, subtotal: 85, shipping: 9, tax: 0, total: 94, placed_at: iso(0.1 * DAY), user_id: U, created_at: iso(0.1 * DAY), updated_at: iso(0.1 * DAY) },
  { id: ORD.o2, channel: "etsy", customer_id: CUS.marcus, external_id: "ETSY-3380", status: "processing", notes: "Gift wrap requested.", subtotal: 28.5, shipping: 6, tax: 0, total: 34.5, placed_at: iso(0.25 * DAY), user_id: U, created_at: iso(0.25 * DAY), updated_at: iso(0.2 * DAY) },
  { id: ORD.o3, channel: "shopify", customer_id: CUS.priya, external_id: "SHOP-1203", status: "packed", notes: null, subtotal: 96, shipping: 12, tax: 0, total: 108, placed_at: iso(0.5 * DAY), user_id: U, created_at: iso(0.5 * DAY), updated_at: iso(0.4 * DAY) },
  { id: ORD.o4, channel: "etsy", customer_id: CUS.john, external_id: "ETSY-3381", status: "shipped", notes: null, subtotal: 18, shipping: 5, tax: 0, total: 23, placed_at: iso(1 * DAY), user_id: U, created_at: iso(1 * DAY), updated_at: iso(0.8 * DAY) },
  { id: ORD.o5, channel: "wholesale", customer_id: CUS.alice, external_id: null, status: "delivered", notes: "Wholesale pallet.", subtotal: 220, shipping: 0, tax: 0, total: 220, placed_at: iso(3 * DAY), user_id: U, created_at: iso(3 * DAY), updated_at: iso(1.5 * DAY) },
];

const order_items = [
  { id: "oi-1", order_id: ORD.o1, cultivar_id: CV.pirouette, inventory_id: INV.pirouette, name_snapshot: "Pinguicula 'Pirouette'", qty: 2, price: 25, user_id: U, created_at: iso(0.1 * DAY) },
  { id: "oi-2", order_id: ORD.o1, cultivar_id: CV.leucophylla, inventory_id: INV.leucophylla, name_snapshot: "Sarracenia leucophylla", qty: 1, price: 35, user_id: U, created_at: iso(0.1 * DAY) },
  { id: "oi-3", order_id: ORD.o2, cultivar_id: CV.capensis, inventory_id: INV.capensis, name_snapshot: "Drosera capensis", qty: 1, price: 28.5, user_id: U, created_at: iso(0.25 * DAY) },
  { id: "oi-4", order_id: ORD.o3, cultivar_id: CV.hamata, inventory_id: INV.hamata, name_snapshot: "Nepenthes hamata", qty: 1, price: 60, user_id: U, created_at: iso(0.5 * DAY) },
  { id: "oi-5", order_id: ORD.o3, cultivar_id: CV.b52, inventory_id: INV.b52, name_snapshot: "Dionaea muscipula 'B52'", qty: 2, price: 18, user_id: U, created_at: iso(0.5 * DAY) },
  { id: "oi-6", order_id: ORD.o4, cultivar_id: CV.capensis, inventory_id: INV.capensis, name_snapshot: "Drosera capensis", qty: 1, price: 18, user_id: U, created_at: iso(1 * DAY) },
  { id: "oi-7", order_id: ORD.o5, cultivar_id: CV.leucophylla, inventory_id: INV.leucophylla, name_snapshot: "Sarracenia leucophylla", qty: 4, price: 35, user_id: U, created_at: iso(3 * DAY) },
  { id: "oi-8", order_id: ORD.o5, cultivar_id: CV.pirouette, inventory_id: INV.pirouette, name_snapshot: "Pinguicula 'Pirouette'", qty: 2, price: 40, user_id: U, created_at: iso(3 * DAY) },
];

// --- propagation_batches ----------------------------------------------------
const propagation_batches = [
  { id: "pb-1", batch_id: "BCH-001", cultivar: "Drosera capensis", stage: "division", count: 60, started: day(-21), est_ready: day(35), notes: "Leaf cuttings in LFS.", user_id: U, updated_at: iso(1 * DAY) },
  { id: "pb-2", batch_id: "BCH-002", cultivar: "Pinguicula 'Pirouette'", stage: "establishment", count: 24, started: day(-45), est_ready: day(20), notes: null, user_id: U, updated_at: iso(2 * DAY) },
  { id: "pb-3", batch_id: "BCH-003", cultivar: "Sarracenia leucophylla", stage: "mother", count: 8, started: day(-120), est_ready: null, notes: "Stock plants for rhizome division.", user_id: U, updated_at: iso(6 * DAY) },
  { id: "pb-4", batch_id: "BCH-004", cultivar: "Dionaea muscipula 'B52'", stage: "ready", count: 30, started: day(-90), est_ready: day(-2), notes: "Hardened off, ready to list.", user_id: U, updated_at: iso(0.5 * DAY) },
];

// --- listings ---------------------------------------------------------------
const listings = [
  { id: "lst-1", channel: "shopify", cultivar_id: CV.capensis, title: "Drosera capensis — Cape Sundew (starter)", price: 15, stock: 24, status: "active", external_id: "SHOP-LST-01", url: "https://canyonexotics.com/products/drosera-capensis", last_synced_at: iso(0.5 * DAY), user_id: U, created_at: iso(40 * DAY), updated_at: iso(0.5 * DAY) },
  { id: "lst-2", channel: "etsy", cultivar_id: CV.b52, title: "Venus Flytrap 'B52' — Large Traps", price: 22, stock: 12, status: "active", external_id: "ETSY-LST-02", url: "https://etsy.com/listing/b52", last_synced_at: iso(1 * DAY), user_id: U, created_at: iso(30 * DAY), updated_at: iso(1 * DAY) },
  { id: "lst-3", channel: "shopify", cultivar_id: CV.pirouette, title: "Pinguicula 'Pirouette' — Blooming Size", price: 28, stock: 0, status: "sold_out", external_id: "SHOP-LST-03", url: "https://canyonexotics.com/products/pinguicula-pirouette", last_synced_at: iso(2 * DAY), user_id: U, created_at: iso(25 * DAY), updated_at: iso(2 * DAY) },
  { id: "lst-4", channel: "etsy", cultivar_id: CV.hamata, title: "Nepenthes hamata — Highland Pitcher (rare)", price: 95, stock: 2, status: "draft", external_id: null, url: null, last_synced_at: null, user_id: U, created_at: iso(4 * DAY), updated_at: iso(4 * DAY) },
];

// --- vendors ----------------------------------------------------------------
const vendors = [
  { id: VEN.biotone, name: "BioTone Soils", category: "Media", contact_name: "Dana Reyes", contact_email: "orders@biotone.example", contact_phone: "555-0301", url: "https://biotone.example", notes: "Peat + perlite mixes.", user_id: U, created_at: iso(200 * DAY), updated_at: iso(20 * DAY) },
  { id: VEN.clearpot, name: "ClearPot Co.", category: "Containers", contact_name: "Sam Okafor", contact_email: "sales@clearpot.example", contact_phone: null, url: "https://clearpot.example", notes: null, user_id: U, created_at: iso(180 * DAY), updated_at: iso(15 * DAY) },
  { id: VEN.mossco, name: "MossCo Supply", category: "Media", contact_name: null, contact_email: "hello@mossco.example", contact_phone: "555-0322", url: null, notes: "Long-fiber sphagnum, NZ grade.", user_id: U, created_at: iso(150 * DAY), updated_at: iso(10 * DAY) },
  { id: VEN.uline, name: "Uline", category: "Shipping", contact_name: null, contact_email: null, contact_phone: "800-555-0000", url: "https://uline.example", notes: "Boxes + heat packs.", user_id: U, created_at: iso(140 * DAY), updated_at: iso(9 * DAY) },
];

// --- supplies ---------------------------------------------------------------
const supplies = [
  { id: "sup-1", name: "Long-fiber sphagnum (NZ)", unit: "kg", on_hand: 3, reorder_threshold: 5, cost: 28, vendor_id: VEN.mossco, notes: null, user_id: U, created_at: iso(60 * DAY), updated_at: iso(4 * DAY) },
  { id: "sup-2", name: "2.5\" clear pots", unit: "count", on_hand: 420, reorder_threshold: 200, cost: 0.35, vendor_id: VEN.clearpot, notes: null, user_id: U, created_at: iso(50 * DAY), updated_at: iso(8 * DAY) },
  { id: "sup-3", name: "Perlite (coarse)", unit: "L", on_hand: 8, reorder_threshold: 20, cost: 12, vendor_id: VEN.biotone, notes: "Below reorder point.", user_id: U, created_at: iso(45 * DAY), updated_at: iso(3 * DAY) },
  { id: "sup-4", name: "72-hr heat packs", unit: "count", on_hand: 60, reorder_threshold: 40, cost: 1.1, vendor_id: VEN.uline, notes: null, user_id: U, created_at: iso(35 * DAY), updated_at: iso(6 * DAY) },
  { id: "sup-5", name: "Shipping boxes 8x6x6", unit: "count", on_hand: 18, reorder_threshold: 25, cost: 0.9, vendor_id: VEN.uline, notes: "Reorder soon.", user_id: U, created_at: iso(30 * DAY), updated_at: iso(2 * DAY) },
];

// --- expenses ---------------------------------------------------------------
const expenses = [
  { id: "exp-1", amount: 84, category: "Media", description: "Sphagnum restock (3 kg)", vendor_id: VEN.mossco, receipt_url: null, occurred_on: day(-3), user_id: U, created_at: iso(3 * DAY), updated_at: iso(3 * DAY) },
  { id: "exp-2", amount: 147, category: "Containers", description: "Clear pots (case)", vendor_id: VEN.clearpot, receipt_url: null, occurred_on: day(-9), user_id: U, created_at: iso(9 * DAY), updated_at: iso(9 * DAY) },
  { id: "exp-3", amount: 66, category: "Shipping", description: "Heat packs + boxes", vendor_id: VEN.uline, receipt_url: null, occurred_on: day(-12), user_id: U, created_at: iso(12 * DAY), updated_at: iso(12 * DAY) },
  { id: "exp-4", amount: 210, category: "Utilities", description: "Greenhouse electricity", vendor_id: null, receipt_url: null, occurred_on: day(-20), user_id: U, created_at: iso(20 * DAY), updated_at: iso(20 * DAY) },
  { id: "exp-5", amount: 38, category: "Marketing", description: "Etsy listing fees", vendor_id: null, receipt_url: null, occurred_on: day(-40), user_id: U, created_at: iso(40 * DAY), updated_at: iso(40 * DAY) },
  { id: "exp-6", amount: 96, category: "Media", description: "Peat + perlite mix", vendor_id: VEN.biotone, receipt_url: null, occurred_on: day(-52), user_id: U, created_at: iso(52 * DAY), updated_at: iso(52 * DAY) },
];

// --- licenses ---------------------------------------------------------------
const licenses = [
  { id: "lic-1", name: "Nursery Stock Dealer License", issuer: "AZ Dept. of Agriculture", reference_number: "AZ-NSD-44821", status: "active", issued_on: day(-300), expires_on: day(45), notes: "Renew before expiry — 45-day window.", user_id: U, created_at: iso(300 * DAY), updated_at: iso(30 * DAY) },
  { id: "lic-2", name: "Phytosanitary Shipping Permit", issuer: "USDA APHIS", reference_number: "APHIS-PSP-1190", status: "active", issued_on: day(-120), expires_on: day(240), notes: null, user_id: U, created_at: iso(120 * DAY), updated_at: iso(20 * DAY) },
  { id: "lic-3", name: "CITES Export Permit (Nepenthes)", issuer: "US Fish & Wildlife", reference_number: "CITES-EX-7733", status: "active", issued_on: day(-400), expires_on: day(-10), notes: "Expired — renewal in progress.", user_id: U, created_at: iso(400 * DAY), updated_at: iso(10 * DAY) },
];

// --- qr_codes ---------------------------------------------------------------
const qr_codes = [
  { id: "qr-1", code: "drosera-capensis-starter-2026", cultivar_id: CV.capensis, inventory_id: INV.capensis, scan_count: 37, last_scanned_at: iso(1 * DAY), user_id: U, created_at: iso(40 * DAY), updated_at: iso(1 * DAY) },
  { id: "qr-2", code: "dionaea-b52-large-2026", cultivar_id: CV.b52, inventory_id: INV.b52, scan_count: 12, last_scanned_at: iso(4 * DAY), user_id: U, created_at: iso(20 * DAY), updated_at: iso(4 * DAY) },
  { id: "qr-3", code: "pinguicula-pirouette-blooming-2026", cultivar_id: CV.pirouette, inventory_id: INV.pirouette, scan_count: 5, last_scanned_at: null, user_id: U, created_at: iso(10 * DAY), updated_at: iso(10 * DAY) },
];

// --- shipments --------------------------------------------------------------
const shipments = [
  { id: SHIP.s1, order_id: ORD.o4, carrier: "USPS", tracking_number: "9400111899223344556677", status: "shipped", ship_to_state: "OR", ship_to_zip: "97201", shipped_at: iso(0.8 * DAY), delivered_at: null, weather_hold: false, weather_note: null, user_id: U, created_at: iso(1 * DAY), updated_at: iso(0.8 * DAY) },
  { id: SHIP.s2, order_id: ORD.o5, carrier: "UPS", tracking_number: "1Z999AA10123456784", status: "delivered", ship_to_state: "CA", ship_to_zip: "94107", shipped_at: iso(2.5 * DAY), delivered_at: iso(1.5 * DAY), weather_hold: false, weather_note: null, user_id: U, created_at: iso(3 * DAY), updated_at: iso(1.5 * DAY) },
  { id: SHIP.s3, order_id: ORD.o3, carrier: "USPS", tracking_number: null, status: "held", ship_to_state: "AZ", ship_to_zip: "85004", shipped_at: null, delivered_at: null, weather_hold: true, weather_note: "Heat advisory — holding until temps drop below 90°F.", user_id: U, created_at: iso(0.5 * DAY), updated_at: iso(0.4 * DAY) },
];

// --- print_jobs -------------------------------------------------------------
const print_jobs = [
  { id: "prn-1", kind: "label", shipment_id: SHIP.s1, status: "printed", payload: { tracking: "9400111899223344556677" }, printed_at: iso(0.8 * DAY), user_id: U, created_at: iso(1 * DAY), updated_at: iso(0.8 * DAY) },
  { id: "prn-2", kind: "invoice", shipment_id: SHIP.s2, status: "printed", payload: { order: ORD.o5 }, printed_at: iso(2.4 * DAY), user_id: U, created_at: iso(3 * DAY), updated_at: iso(2.4 * DAY) },
  { id: "prn-3", kind: "label", shipment_id: SHIP.s3, status: "pending", payload: null, printed_at: null, user_id: U, created_at: iso(0.5 * DAY), updated_at: iso(0.5 * DAY) },
];

// --- tasks ------------------------------------------------------------------
const tasks = [
  { id: "tsk-1", title: "Pot up BCH-001 divisions", due: day(2), type: "propagation", completed: false, user_id: U, updated_at: iso(1 * DAY) },
  { id: "tsk-2", title: "Renew nursery dealer license", due: day(40), type: "compliance", completed: false, user_id: U, updated_at: iso(2 * DAY) },
  { id: "tsk-3", title: "Restock sphagnum + perlite", due: day(1), type: "supplies", completed: false, user_id: U, updated_at: iso(0.5 * DAY) },
  { id: "tsk-4", title: "Photograph B52 batch for listing", due: day(-1), type: "listings", completed: true, user_id: U, updated_at: iso(3 * DAY) },
];

// --- access_requests --------------------------------------------------------
const access_requests = [
  { id: "req-1", email: "newgrower@example.com", name: "Jordan Lee", message: "Met you at the carnivorous plant show — would love access to track my own grows.", status: "pending", denial_reason: null, requested_at: iso(0.4 * DAY), decided_at: null, decided_by: null, invited_at: null, invite_expires_at: null, user_id: null },
  { id: "req-2", email: "wholesale@greenhousecollective.com", name: "Alice Smith", message: "Wholesale partner — need access for reorders.", status: "approved", denial_reason: null, requested_at: iso(10 * DAY), decided_at: iso(9 * DAY), decided_by: DEMO_USER_ID, invited_at: iso(9 * DAY), invite_expires_at: day(-2), user_id: null },
  { id: "req-3", email: "spam@example.com", name: null, message: null, status: "denied", denial_reason: "Could not verify identity.", requested_at: iso(20 * DAY), decided_at: iso(19 * DAY), decided_by: DEMO_USER_ID, invited_at: null, invite_expires_at: null, user_id: null },
];

// --- admin_emails -----------------------------------------------------------
const admin_emails = [
  { email: DEMO_EMAIL, added_at: iso(200 * DAY), added_by: null },
];

// --- mortality_events -------------------------------------------------------
const mortality_events = [
  { id: "mort-1", cultivar_id: CV.hamata, inventory_id: INV.hamata, count: 1, cause: "Damping off", notes: "Lost one juvenile to fungus.", noted_at: iso(7 * DAY), user_id: U, created_at: iso(7 * DAY) },
  { id: "mort-2", cultivar_id: CV.leucophylla, inventory_id: INV.leucophylla, count: 2, cause: "Shipping stress", notes: null, noted_at: iso(14 * DAY), user_id: U, created_at: iso(14 * DAY) },
];

export const DEMO_SEED: Record<string, Array<Record<string, unknown> & { id: string | number }>> = {
  cultivars,
  inventory,
  customers,
  subscriptions,
  orders,
  order_items,
  propagation_batches,
  listings,
  vendors,
  supplies,
  expenses,
  licenses,
  qr_codes,
  shipments,
  print_jobs,
  tasks,
  access_requests,
  mortality_events,
  // admin_emails is keyed by email, not id; handled via its own table store.
  admin_emails: admin_emails as unknown as Array<Record<string, unknown> & { id: string }>,
};

export const DEMO_PROFILE_SEED: DemoProfile = {
  display_name: "Demo Operator",
  notification_prefs: { low_stock: true, license_expiring: true, new_order: true, new_access_request: true },
  is_admin: true,
  // Null so a fresh demo session walks through onboarding (a real flow to test).
  onboarded_at: null,
};
