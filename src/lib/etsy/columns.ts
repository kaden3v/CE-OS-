/**
 * Etsy CSV column maps.
 *
 * ⚠️ THIS IS THE ONE FILE TO ADJUST if your export's headers differ. Etsy has
 * changed column names over the years and they vary slightly by shop/region.
 * Each field lists known header aliases; matching is case-insensitive and
 * whitespace-trimmed (see `pick`).
 *
 * Three exports are supported:
 *  - sold_orders : EtsySoldOrders{year}.csv      (one row per order)
 *  - order_items : EtsySoldOrderItems{year}.csv  (one row per line item)
 *  - payments    : etsy_payment_account.csv      (financial ledger)
 */

export type CsvType = "sold_orders" | "order_items" | "payments";

export type ColumnMap = Record<string, string[]>;

export const SOLD_ORDERS_COLUMNS: ColumnMap = {
  orderId: ["Order ID", "Order Id"],
  saleDate: ["Sale Date", "Date Paid", "Date"],
  buyer: ["Buyer", "Buyer User ID"],
  fullName: ["Full Name", "Ship Name", "Name"],
  numItems: ["Number of Items", "Quantity", "Num Items"],
  orderValue: ["Order Value", "Order Total", "Adjusted Order Total"],
  orderShipping: ["Order Shipping", "Shipping"],
  orderSalesTax: ["Order Sales Tax", "Sales Tax", "Tax"],
  itemTotal: ["Item Total", "Subtotal"],
  discount: ["Discount Amount", "Discount"],
  currency: ["Currency"],
  shipCity: ["Ship City", "City"],
  shipState: ["Ship State", "State"],
  shipZip: ["Ship Zipcode", "Ship Zip", "Zipcode"],
  shipCountry: ["Ship Country", "Country"],
  status: ["Status", "Order Status"],
};

export const ORDER_ITEMS_COLUMNS: ColumnMap = {
  orderId: ["Order ID", "Order Id"],
  saleDate: ["Sale Date", "Date Paid", "Date"],
  title: ["Item Name", "Title", "Listing Title"],
  sku: ["SKU"],
  quantity: ["Quantity", "Qty"],
  price: ["Price", "Item Price"],
  itemTotal: ["Item Total", "Line Item Total"],
  transactionId: ["Transaction ID", "Transaction Id"],
  listingId: ["Listing ID", "Listing Id"],
  variations: ["Variations"],
  currency: ["Currency"],
};

export const PAYMENTS_COLUMNS: ColumnMap = {
  date: ["Date"],
  type: ["Type"],
  title: ["Title"],
  info: ["Info"],
  currency: ["Currency"],
  amount: ["Amount"],
  feesTaxes: ["Fees & Taxes", "Fees and Taxes", "Fees"],
  net: ["Net"],
  taxDetails: ["Tax Details"],
};

/** Header sets used to auto-detect which export a file is. */
export const SIGNATURES: Array<{ type: CsvType; required: string[] }> = [
  // payments ledger: unique combo of Type + Net + Fees & Taxes
  { type: "payments", required: ["Type", "Net"] },
  // order items: per-line Title alongside an Order ID
  { type: "order_items", required: ["Order ID", "Title"] },
  // sold orders: Order ID without per-line Title
  { type: "sold_orders", required: ["Order ID"] },
];
