import { describe, it, expect } from "vitest";
import { titleForPath } from "./useDocumentTitle";

describe("titleForPath", () => {
  it("names the root route Dashboard", () => {
    expect(titleForPath("/")).toBe("Dashboard · CEOS");
  });

  it("title-cases a single segment", () => {
    expect(titleForPath("/orders")).toBe("Orders · CEOS");
  });

  it("joins nested segments", () => {
    expect(titleForPath("/finances/vendors")).toBe("Finances · Vendors · CEOS");
  });

  it("keeps known acronyms and multi-word slugs readable", () => {
    expect(titleForPath("/inventory/qr-codes")).toBe("Inventory · QR Codes · CEOS");
    expect(titleForPath("/shipping/print-queue")).toBe("Shipping · Print Queue · CEOS");
    expect(titleForPath("/admin/access-requests")).toBe("Admin · Access Requests · CEOS");
  });

  it("ignores a trailing slash", () => {
    expect(titleForPath("/orders/")).toBe("Orders · CEOS");
  });
});
