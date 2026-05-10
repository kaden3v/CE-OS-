/**
 * Tiny Shopify Admin GraphQL client.
 *
 * Why hand-rolled: the official @shopify/admin-api-client pulls in extra deps
 * and OAuth helpers we don't need for a single-tenant custom app. fetch + a
 * 30-line wrapper is enough.
 */

type GqlError = { message: string; locations?: unknown; path?: unknown; extensions?: unknown };
type GqlResponse<T> = { data?: T; errors?: GqlError[]; extensions?: { cost?: ShopifyCost } };

export type ShopifyCost = {
  requestedQueryCost: number;
  actualQueryCost: number;
  throttleStatus: { maximumAvailable: number; currentlyAvailable: number; restoreRate: number };
};

export class ShopifyHttpError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function shopifyGraphQL<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  const version = process.env.SHOPIFY_API_VERSION ?? '2025-01';

  if (!shop || !token) {
    throw new ShopifyHttpError(500, 'Shopify is not configured. Set SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_TOKEN in .env.');
  }

  const url = `https://${shop}/admin/api/${version}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ShopifyHttpError(res.status, `Shopify responded ${res.status}`, text);
  }

  const json = (await res.json()) as GqlResponse<T>;

  if (json.errors?.length) {
    throw new ShopifyHttpError(502, json.errors.map(e => e.message).join('; '), json.errors);
  }
  if (!json.data) {
    throw new ShopifyHttpError(502, 'Shopify returned no data', json);
  }

  // Surface cost in dev so we can spot rate-limit pressure early.
  if (process.env.NODE_ENV !== 'production' && json.extensions?.cost) {
    const c = json.extensions.cost;
    console.log(`[shopify] cost=${c.actualQueryCost}/${c.requestedQueryCost} avail=${c.throttleStatus.currentlyAvailable}/${c.throttleStatus.maximumAvailable}`);
  }

  return json.data;
}
