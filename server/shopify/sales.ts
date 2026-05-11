import { shopifyGraphQL } from './client.js';

/**
 * Returns the gross sales total for a date range on Shopify.
 * Used to populate the "Reported (1099-K)" total automatically.
 *
 * Strict: includes all orders created within the range, regardless of
 * fulfillment status. This matches what Shopify Payments reports on a 1099-K
 * (gross volume, no refunds deducted).
 */

const SALES_QUERY = /* GraphQL */ `
  query Sales($query: String!) {
    orders(first: 250, query: $query) {
      edges {
        node {
          totalPriceSet { shopMoney { amount currencyCode } }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

type Resp = {
  orders: {
    edges: Array<{ node: { totalPriceSet: { shopMoney: { amount: string; currencyCode: string } } } }>;
    pageInfo: { hasNextPage: boolean };
  };
};

export async function grossSales(args: { startDate: string; endDate: string }): Promise<{ grossCents: number; count: number; hasMore: boolean }> {
  // Shopify's query syntax: created_at:>=YYYY-MM-DD created_at:<=YYYY-MM-DD
  const q = `created_at:>=${args.startDate} created_at:<=${args.endDate}`;
  const data = await shopifyGraphQL<Resp>(SALES_QUERY, { query: q });
  let cents = 0;
  for (const e of data.orders.edges) {
    cents += Math.round(parseFloat(e.node.totalPriceSet.shopMoney.amount) * 100);
  }
  return { grossCents: cents, count: data.orders.edges.length, hasMore: data.orders.pageInfo.hasNextPage };
}
