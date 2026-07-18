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
  it("renders every finance section with its route", () => {
    renderAt("/finances");
    const expected: [string, string][] = [
      ["Overview", "/finances"],
      ["Revenue", "/finances/revenue"],
      ["Goals", "/finances/goals"],
      ["Expenses", "/finances/expenses"],
      ["Production", "/finances/production"],
      ["Reports", "/finances/reports"],
      ["Manage", "/finances/manage"],
    ];
    for (const [label, href] of expected) {
      const link = screen.getByRole("link", { name: label });
      expect(link.getAttribute("href")).toBe(href);
    }
  });

  it("marks only the current section active", () => {
    renderAt("/finances/expenses");
    expect(screen.getByRole("link", { name: "Expenses" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBeNull();
  });

  it("Overview matches exactly, not every /finances/* route", () => {
    renderAt("/finances/reports");
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "Reports" }).getAttribute("aria-current")).toBe("page");
  });
});
