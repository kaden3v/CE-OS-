// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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
  it("renders the six primary sections with their routes", () => {
    renderAt("/finances");
    const expected: [string, string][] = [
      ["Overview", "/finances"],
      ["Revenue", "/finances/revenue"],
      ["Goals", "/finances/goals"],
      ["Expenses", "/finances/expenses"],
      ["Production", "/finances/production"],
      ["Reports", "/finances/reports"],
    ];
    for (const [label, href] of expected) {
      const link = screen.getByRole("link", { name: label });
      expect(link.getAttribute("href")).toBe(href);
    }
  });

  it("marks only the current section active; Overview matches exactly", () => {
    renderAt("/finances/expenses");
    expect(screen.getByRole("link", { name: "Expenses" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBeNull();
  });

  it("Manage is a dropdown, not a link to a hub page", () => {
    renderAt("/finances");
    const button = screen.getByRole("button", { name: /Manage/ });
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Vendors" })).toBeNull(); // closed

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const expected: [string, string][] = [
      ["Vendors", "/finances/vendors"],
      ["Categories", "/finances/categories"],
      ["Rules", "/finances/rules"],
      ["Supplies", "/finances/supplies"],
      ["Subscriptions", "/finances/subscriptions"],
      ["Mileage", "/finances/mileage"],
    ];
    for (const [label, href] of expected) {
      const item = screen.getByRole("menuitem", { name: new RegExp(label) });
      expect(item.getAttribute("href")).toBe(href);
    }
  });

  it("shows which manage record you're on, in the pill itself", () => {
    renderAt("/finances/vendors");
    expect(screen.getByRole("button", { name: /Manage · Vendors/ })).toBeTruthy();
  });

  it("recognizes manage detail routes (e.g. a vendor page)", () => {
    renderAt("/finances/vendors/abc-123");
    expect(screen.getByRole("button", { name: /Manage · Vendors/ })).toBeTruthy();
  });

  it("closes on Escape", () => {
    renderAt("/finances");
    const button = screen.getByRole("button", { name: /Manage/ });
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});
