// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ActivityList } from "./ActivityList";
import { formatBusinessDate } from "@/lib/dates";
import type { ActivityRow } from "@/hooks/useActivityFeed";

afterEach(cleanup);

const ev = (over: Partial<ActivityRow>): ActivityRow => ({
  action: "created",
  actor_id: null,
  created_at: "2024-03-10T12:00:00Z",
  entity: "orders",
  entity_id: "o1",
  id: "a1",
  org_id: "org1",
  summary: "Etsy order #1 synced",
  ...over,
});

const names = new Map([["u2", "Dana"]]);

describe("ActivityList", () => {
  it("labels a null-actor (automated) row as System, not a teammate", () => {
    render(<ActivityList events={[ev({})]} nameById={names} onSelect={() => {}} />);
    expect(screen.getByText("System")).toBeTruthy();
    expect(screen.queryByText("A teammate")).toBeNull();
  });

  it("resolves a known actor to their name", () => {
    render(<ActivityList events={[ev({ id: "a2", actor_id: "u2", action: "updated" })]} nameById={names} onSelect={() => {}} />);
    expect(screen.getByText("Dana")).toBeTruthy();
  });

  it("renders a date-group header when grouped", () => {
    render(<ActivityList events={[ev({})]} nameById={names} onSelect={() => {}} grouped />);
    expect(screen.getByText(formatBusinessDate("2024-03-10T12:00:00Z"))).toBeTruthy();
  });

  it("fires onSelect with the clicked event", () => {
    const onSelect = vi.fn();
    const target = ev({ id: "a9", summary: "Etsy order #9 synced" });
    render(<ActivityList events={[target]} nameById={names} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Etsy order #9 synced/ }));
    expect(onSelect).toHaveBeenCalledWith(target);
  });
});
