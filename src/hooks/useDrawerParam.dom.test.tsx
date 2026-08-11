// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { useDrawerParam } from "./useDrawerParam";

afterEach(cleanup);

function Probe() {
  const [selectedId, setSelectedId] = useDrawerParam();
  const location = useLocation();
  return (
    <div>
      <output data-testid="selected">{selectedId ?? "none"}</output>
      <output data-testid="search">{location.search || "(empty)"}</output>
      <button onClick={() => setSelectedId("abc")}>open abc</button>
      <button onClick={() => setSelectedId("xyz")}>open xyz</button>
      <button onClick={() => setSelectedId(null)}>close</button>
    </div>
  );
}

const renderAt = (entries: string[]) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/orders" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );

const selected = () => screen.getByTestId("selected").textContent;
const search = () => screen.getByTestId("search").textContent;

describe("useDrawerParam", () => {
  it("starts closed when the param is absent", () => {
    renderAt(["/orders"]);
    expect(selected()).toBe("none");
  });

  it("opens from a deep link", () => {
    renderAt(["/orders?view=abc"]);
    expect(selected()).toBe("abc");
  });

  it("writes the id to the URL when opened", () => {
    renderAt(["/orders"]);
    fireEvent.click(screen.getByText("open abc"));
    expect(selected()).toBe("abc");
    expect(search()).toBe("?view=abc");
  });

  it("closing after opening returns to the list — back cancels the open", () => {
    renderAt(["/orders"]);
    fireEvent.click(screen.getByText("open abc"));
    fireEvent.click(screen.getByText("close"));
    expect(selected()).toBe("none");
    expect(search()).toBe("(empty)");
  });

  it("closing a deep-linked drawer strips the param in place", () => {
    // Nothing of ours on the stack to pop, so going back would leave the app.
    renderAt(["/orders?view=abc"]);
    fireEvent.click(screen.getByText("close"));
    expect(selected()).toBe("none");
    expect(search()).toBe("(empty)");
  });

  it("preserves other query params", () => {
    renderAt(["/orders?status=shipped"]);
    fireEvent.click(screen.getByText("open abc"));
    expect(search()).toContain("status=shipped");
    expect(search()).toContain("view=abc");
  });

  it("switching records replaces the id", () => {
    renderAt(["/orders"]);
    fireEvent.click(screen.getByText("open abc"));
    fireEvent.click(screen.getByText("open xyz"));
    expect(selected()).toBe("xyz");
    expect(search()).toBe("?view=xyz");
  });
});
