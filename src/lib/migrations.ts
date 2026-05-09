import { utcIsoNow } from "@/lib/dates";

/**
 * Stored entity blob layout. Bump {@link ENTITY_STORAGE_VERSION} on breaking schema changes
 * and add a branch in migrate-resource helpers below.
 */
export const ENTITY_STORAGE_VERSION = 2;

export type StoredEntityEnvelope<T = unknown> = {
  version: number;
  items: T[];
};

function extractStoredPayload(raw: unknown): { version: number; items: unknown[] } {
  if (Array.isArray(raw)) {
    return { version: 0, items: raw };
  }
  if (
    raw !== null &&
    typeof raw === "object" &&
    "items" in raw &&
    Array.isArray((raw as { items: unknown }).items)
  ) {
    const versionRaw = (raw as { version?: unknown }).version;
    const version = typeof versionRaw === "number" ? versionRaw : ENTITY_STORAGE_VERSION;
    return { version, items: (raw as { items: unknown[] }).items };
  }
  return { version: 0, items: [] };
}

function migrateOrderLine(line: unknown): unknown {
  if (!line || typeof line !== "object") return line;
  const L = line as Record<string, unknown>;
  if ("priceCents" in L && typeof L.priceCents === "number") {
    return line;
  }
  if ("price" in L && typeof L.price === "number") {
    const { price, ...rest } = L;
    return {
      ...rest,
      priceCents: Math.round(Number(price) * 100),
    };
  }
  return line;
}

function migrateOrderRow(row: unknown): unknown {
  if (!row || typeof row !== "object") return row;
  const r = row as Record<string, unknown>;
  const created = r.created;
  let createdOut = created;
  if (typeof created === "string" && /^\d{4}-\d{2}-\d{2}$/.test(created)) {
    createdOut = `${created}T12:00:00.000Z`;
  }
  const updatedAtRaw = r.updatedAt;
  const updatedAt =
    typeof updatedAtRaw === "string" && updatedAtRaw.length > 0
      ? updatedAtRaw
      : typeof createdOut === "string"
        ? createdOut
        : utcIsoNow();
  const itemsRaw = r.items;
  if (!Array.isArray(itemsRaw)) {
    return { ...r, created: createdOut, updatedAt };
  }
  const newLines = itemsRaw.map((line) => migrateOrderLine(line));
  return { ...r, created: createdOut, items: newLines, updatedAt };
}

function migrateOrderItems(_version: number, items: unknown[]): unknown[] {
  void _version;
  return items.map((row) => migrateOrderRow(row));
}

function migrateInventoryItems(_version: number, items: unknown[]): unknown[] {
  void _version;
  return items;
}

/**
 * Normalize raw localStorage JSON into an item array for Zod validation.
 * Every breaking entity schema change should bump {@link ENTITY_STORAGE_VERSION}
 * and extend the per-resource migration logic.
 */
export function migrate(
  resource: string,
  raw: unknown,
  _currentVersion: number
): unknown[] {
  void _currentVersion;
  const { version, items } = extractStoredPayload(raw);
  switch (resource) {
    case "orders":
      return migrateOrderItems(version, items);
    case "inventory":
      return migrateInventoryItems(version, items);
    default:
      return items;
  }
}
