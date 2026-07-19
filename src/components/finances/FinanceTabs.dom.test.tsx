// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { FinanceTabs } from "./FinanceTabs";

afterEach(cleanup);

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <FinanceTabs />
    </MemoryRouter>,
  );

describe("FinanceTabs", () => {
  it("renders every finance section — reporting and records — on the one bar", () => {
    renderAt("/finances");
    const expected: [string, string][] = [
      ["Overview", "/finances"],
      ["Revenue", "/finances/revenue"],
      ["Goals", "/finances/goals"],
      ["Expenses", "/finances/expenses"],
      ["Production", "/finances/production"],
      ["Reports", "/finances/reports"],
      ["Vendors", "/finances/vendors"],
      ["Categories", "/finances/categories"],
      ["Rules", "/finances/rules"],
      ["Supplies", "/finances/supplies"],
      ["Subscriptions", "/finances/subscriptions"],
      ["Mileage", "/finances/mileage"],
    ];
    for (const [label, href] of expected) {
      const link = screen.getByRole("link", { name: label });
      expect(link.getAttribute("href")).toBe(href);
    }
    // No dropdown, no hub link — twelve flat links and nothing else.
    expect(screen.getAllByRole("link")).toHaveLength(expected.length);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("marks only the current section active; Overview matches exactly", () => {
    renderAt("/finances/rules");
    expect(screen.getByRole("link", { name: "Rules" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBeNull();
  });

  it("record pills light up on their detail routes too", () => {
    renderAt("/finances/vendors/abc-123");
    expect(screen.getByRole("link", { name: "Vendors" }).getAttribute("aria-current")).toBe("page");
  });

  it("centers the bar within the header", () => {
    renderAt("/finances");
    const nav = screen.getByRole("navigation", { name: "Finance sections" });
    expect(nav.parentElement?.className).toContain("justify-center");
  });
});
