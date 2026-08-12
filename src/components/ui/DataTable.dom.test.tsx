// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { DataTable } from "./DataTable";

afterEach(cleanup);

type Order = { id: string; customer: string; total: string };

const ROWS: Order[] = [
  { id: "a1b2c3d4", customer: "Marcus Aldana", total: "$42.00" },
  { id: "e5f6g7h8", customer: "Rae Okonjo", total: "$18.50" },
];

const COLUMNS = [
  { accessorKey: "id", header: "Order #", meta: { mobileHidden: true } },
  { accessorKey: "customer", header: "Customer", meta: { mobileTitle: true } },
  { accessorKey: "total", header: "Total" },
];

/** The mobile card list; the desktop table is the sibling marked hidden md:block. */
const cardRegion = () => document.querySelector(".md\\:hidden") as HTMLElement;

describe("DataTable mobile cards", () => {
  it("renders one card per row alongside the table", () => {
    render(<DataTable columns={COLUMNS as any} data={ROWS} />);
    const cards = cardRegion();
    expect(within(cards).getByText("Marcus Aldana")).toBeTruthy();
    expect(within(cards).getByText("Rae Okonjo")).toBeTruthy();
    // Same data still present in the desktop table.
    expect(screen.getAllByText("Marcus Aldana").length).toBe(2);
  });

  it("omits mobileHidden columns from the card but keeps them in the table", () => {
    render(<DataTable columns={COLUMNS as any} data={ROWS} />);
    expect(within(cardRegion()).queryByText("a1b2c3d4")).toBeNull();
    expect(screen.getByText("a1b2c3d4")).toBeTruthy(); // still in the table
  });

  it("labels each remaining field with its column header", () => {
    render(<DataTable columns={COLUMNS as any} data={ROWS} />);
    const cards = cardRegion();
    expect(within(cards).getAllByText("Total").length).toBe(ROWS.length);
    expect(within(cards).getByText("$42.00")).toBeTruthy();
  });

  it("makes cards real buttons when the row is clickable", () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={COLUMNS as any} data={ROWS} onRowClick={onRowClick} />);
    const buttons = within(cardRegion()).getAllByRole("button");
    expect(buttons.length).toBe(ROWS.length);
    fireEvent.click(buttons[0]);
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
  });

  it("renders no buttons when rows aren't clickable", () => {
    render(<DataTable columns={COLUMNS as any} data={ROWS} />);
    expect(within(cardRegion()).queryAllByRole("button").length).toBe(0);
  });

  it("shows an empty message in both views", () => {
    render(<DataTable columns={COLUMNS as any} data={[]} />);
    expect(screen.getAllByText("No results.").length).toBe(2);
  });

  it("falls back to the first visible column as the heading", () => {
    const cols = [
      { accessorKey: "customer", header: "Customer" },
      { accessorKey: "total", header: "Total" },
    ];
    render(<DataTable columns={cols as any} data={ROWS} />);
    const cards = cardRegion();
    // No mobileTitle set → first column heads the card, so it isn't rendered
    // as a labelled row and its header never appears inside the card.
    expect(within(cards).queryByText("Customer")).toBeNull();
    expect(within(cards).getAllByText("Total").length).toBe(ROWS.length);
  });
});
