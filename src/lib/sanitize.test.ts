import { describe, it, expect } from "vitest";
import { sanitizeHTML } from "./sanitize";

describe("sanitizeHTML", () => {
  it("removes script and marks modification", () => {
    const { clean, wasModified } = sanitizeHTML(
      '<p>Hi</p><script>alert(1)</script>'
    );
    expect(clean.toLowerCase()).not.toContain("<script");
    expect(wasModified).toBe(true);
  });

  it("keeps semantic markup in strict mode (happy path)", () => {
    const { clean, wasModified } = sanitizeHTML(
      "<p><strong>Bold</strong> and <em>italic</em></p>",
      { strict: true }
    );
    expect(clean).toContain("<strong>");
    expect(clean).toContain("<em>");
    expect(wasModified).toBe(false);
  });

  it("strips forbidden interactive tags in extended mode", () => {
    const { clean, wasModified } = sanitizeHTML("<form></form><p>x</p>");
    expect(clean.toLowerCase()).not.toContain("<form");
    expect(wasModified).toBe(true);
  });
});
