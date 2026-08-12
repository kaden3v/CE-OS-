import { Fragment } from "react";
import { NavLink } from "react-router";
import { cn } from "@/lib/utils";

/**
 * Primary in-page navigation for the consolidated Finance dashboard. ONE flat,
 * centered pill bar with every section on it — no hub page, no dropdown (both
 * were tried; the owner wants everything one click away on a single menu).
 * A thin divider separates the reporting views from the operational records.
 * When the bar is wider than the viewport it scrolls horizontally (scrollbar
 * hidden); centering only applies while it fits.
 */
const TABS: { to: string; label: string; end?: boolean; divider?: boolean }[] = [
  { to: "/finances", label: "Overview", end: true },
  { to: "/finances/revenue", label: "Revenue" },
  { to: "/finances/goals", label: "Goals" },
  { to: "/finances/expenses", label: "Expenses" },
  { to: "/finances/production", label: "Production" },
  { to: "/finances/reports", label: "Reports" },
  { to: "/finances/vendors", label: "Vendors", divider: true },
  { to: "/finances/categories", label: "Categories" },
  { to: "/finances/rules", label: "Rules" },
  { to: "/finances/supplies", label: "Supplies" },
  { to: "/finances/subscriptions", label: "Subscriptions" },
  { to: "/finances/mileage", label: "Mileage" },
];

export function FinanceTabs() {
  return (
    <div className="sticky top-0 z-sticky border-b border-border-subtle bg-bg-base/95 backdrop-blur-md no-print">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-2.5 flex justify-center">
        <nav
          aria-label="Finance sections"
          className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-border-subtle bg-bg-elevated/70 p-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => (
            <Fragment key={t.to}>
              {t.divider && <span aria-hidden className="w-px h-4 bg-border-strong/60 mx-1.5 shrink-0" />}
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cn(
                    "px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors select-none",
                    isActive
                      ? "bg-bg-active text-text-primary font-medium shadow-sm ring-1 ring-border-strong/60"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-hover/60",
                  )
                }
              >
                {t.label}
              </NavLink>
            </Fragment>
          ))}
        </nav>
      </div>
    </div>
  );
}
