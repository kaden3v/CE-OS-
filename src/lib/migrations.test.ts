import { describe, it, expect } from "vitest";
import { ENTITY_STORAGE_VERSION, migrate } from "./migrations";

describe("migrate", () => {
  it("normalizes legacy order rows with date-only created", () => {
    const raw = [
      {
        id: "ORD-1",
        channel: "Etsy",
        customer: "A",
        items: [{ name: "x", qty: 1, priceCents: 100 }],
        status: "Pending",
        created: "2024-06-01",
      },
    ];
    const out = migrate("orders", raw, ENTITY_STORAGE_VERSION);
    expect(Array.isArray(out)).toBe(true);
    expect((out[0] as { created: string }).created).toContain("T");
    expect((out[0] as { updatedAt?: string }).updatedAt).toBeDefined();
  });

  it("passes inventory blobs through unchanged", () => {
    const items = [{ id: "i1", stock: { juv: 1, mat: 0, flower: 0 } }];
    expect(migrate("inventory", items, ENTITY_STORAGE_VERSION)).toEqual(items);
  });
});
