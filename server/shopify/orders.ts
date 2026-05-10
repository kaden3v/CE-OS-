import { shopifyGraphQL } from './client.js';

/**
 * Normalized order shape returned to the React app.
 *
 * Keep this in sync with `OrderRecord` in
 * src/components/record/configs/order.tsx so the page can drop in.
 * The two should eventually share a generated type — for now, hand-mirrored.
 */
export type ApiOrder = {
  id: string;            // human-readable "ORD-1284" or Shopify "#1284"
  shopifyId: string;     // gid://shopify/Order/...
  channel: 'Shopify' | 'Etsy';
  customer: string;
  items: Array<{ name: string; qty: number; price: number }>;
  status: 'Pending' | 'Processing' | 'Packed' | 'Shipped' | 'Delivered' | 'Cancelled';
  created: string;       // YYYY-MM-DD
};

export type OrdersPage = {
  orders: ApiOrder[];
  nextCursor: string | null;
};

// ── Query ────────────────────────────────────────────────────────────────────
// The GraphQL query is centralized here so a schema review pass can read one file.
// Filter: pull all non-archived orders; the caller can refine via query param later.
const ORDERS_QUERY = /* GraphQL */ `
  query Orders($limit: Int!, $cursor: String) {
    orders(first: $limit, after: $cursor, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          name
          createdAt
          displayFulfillmentStatus
          displayFinancialStatus
          cancelledAt
          customer {
            displayName
            firstName
            lastName
          }
          lineItems(first: 25) {
            edges {
              node {
                title
                quantity
                originalUnitPriceSet { shopMoney { amount } }
              }
            }
          }
        }
      }
    }
  }
`;

type RawOrder = {
  id: string;
  name: string;
  createdAt: string;
  displayFulfillmentStatus: string;
  displayFinancialStatus: string | null;
  cancelledAt: string | null;
  customer: { displayName?: string; firstName?: string; lastName?: string } | null;
  lineItems: { edges: Array<{ node: {
    title: string;
    quantity: number;
    originalUnitPriceSet: { shopMoney: { amount: string } };
  } }> };
};

type RawResponse = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: RawOrder }>;
  };
};

// ── API ──────────────────────────────────────────────────────────────────────
export async function listOrders({ limit, cursor }: { limit: number; cursor: string | null }): Promise<OrdersPage> {
  const data = await shopifyGraphQL<RawResponse>(ORDERS_QUERY, { limit, cursor });
  return {
    orders: data.orders.edges.map(e => normalize(e.node)),
    nextCursor: data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null,
  };
}

// ── Normalize ────────────────────────────────────────────────────────────────
function normalize(o: RawOrder): ApiOrder {
  return {
    id: o.name.replace(/^#/, 'ORD-'),
    shopifyId: o.id,
    channel: 'Shopify',
    customer: o.customer?.displayName || [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(' ') || 'Guest',
    items: o.lineItems.edges.map(li => ({
      name: li.node.title,
      qty: li.node.quantity,
      price: Number(li.node.originalUnitPriceSet.shopMoney.amount),
    })),
    status: deriveStatus(o),
    created: o.createdAt.split('T')[0],
  };
}

// Map Shopify's (fulfillment × financial × cancelled) combos to our flat status.
function deriveStatus(o: RawOrder): ApiOrder['status'] {
  if (o.cancelledAt) return 'Cancelled';
  switch (o.displayFulfillmentStatus) {
    case 'FULFILLED':         return 'Delivered'; // refine once we add tracking webhooks
    case 'PARTIALLY_FULFILLED': return 'Packed';
    case 'IN_PROGRESS':       return 'Processing';
    case 'ON_HOLD':           return 'Pending';
    case 'SCHEDULED':         return 'Pending';
    case 'UNFULFILLED':
    default:                  return o.displayFinancialStatus === 'PAID' ? 'Processing' : 'Pending';
  }
}
