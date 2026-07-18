import { NavLink } from "react-router";
import { cn } from "@/lib/utils";

/**
 * Primary in-page navigation for the consolidated Finance dashboard. The whole
 * section lives under a single sidebar entry; these tabs replace what used to
 * be nine separate sidebar items. Operational records (vendors, supplies,
 * subscriptions, mileage, rules) live behind "Manage".
 *
 * Style: a segmented pill control (text-only — seven icon+label pairs read as
 * clutter). The active view is an elevated pill; the rest are quiet text. On
 * phones the group scrolls horizontally with the scrollbar hidden.
 */
const TABS: { to: string; label: string; end?: boolean }[] = [
  { to: "/finances", label: "Overview", end: true },
  { to: "/finances/revenue", label: "Revenue" },
  { to: "/finances/goals", label: "Goals" },
  { to: "/finances/expenses", label: "Expenses" },
  { to: "/finances/production", label: "Production" },
  { to: "/finances/reports", label: "Reports" },
  { to: "/finances/manage", label: "Manage" },
];

export function FinanceTabs() {
  return (
    <div className="sticky top-0 z-10 border-b border-border-subtle bg-bg-base/95 backdrop-blur-md no-print">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-2.5">
        <nav
          aria-label="Finance sections"
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border-subtle bg-bg-elevated/70 p-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  "px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors select-none",
                  isActive
                    ? "bg-bg-active text-text-primary font-medium shadow-sm ring-1 ring-border-strong/60"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-hover/60",
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
