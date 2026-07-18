import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { ChevronDown, Store, Tags, Wand2, PackageOpen, Repeat, Car, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Primary in-page navigation for the consolidated Finance dashboard. The whole
 * section lives under a single sidebar entry; these tabs replace what used to
 * be nine separate sidebar items.
 *
 * Style: a segmented pill control (text-only — seven icon+label pairs read as
 * clutter). The active view is an elevated pill; the rest are quiet text. On
 * phones the group scrolls horizontally with the scrollbar hidden.
 *
 * "Manage" is a dropdown ON this bar (not a link to a hub page full of more
 * links — the owner explicitly didn't want a menu that opens another menu):
 * every operational record is one click away, and the pill shows which one
 * you're on.
 */
const TABS: { to: string; label: string; end?: boolean }[] = [
  { to: "/finances", label: "Overview", end: true },
  { to: "/finances/revenue", label: "Revenue" },
  { to: "/finances/goals", label: "Goals" },
  { to: "/finances/expenses", label: "Expenses" },
  { to: "/finances/production", label: "Production" },
  { to: "/finances/reports", label: "Reports" },
];

const MANAGE_ITEMS: { to: string; label: string; icon: LucideIcon; desc: string }[] = [
  { to: "/finances/vendors", label: "Vendors", icon: Store, desc: "Suppliers & 1099 contacts" },
  { to: "/finances/categories", label: "Categories", icon: Tags, desc: "Expense vocabulary & tax lines" },
  { to: "/finances/rules", label: "Rules", icon: Wand2, desc: "Auto-categorize expenses" },
  { to: "/finances/supplies", label: "Supplies", icon: PackageOpen, desc: "Consumables & reorder points" },
  { to: "/finances/subscriptions", label: "Subscriptions", icon: Repeat, desc: "Recurring bills, auto-logged" },
  { to: "/finances/mileage", label: "Mileage", icon: Car, desc: "Trips & standard-rate deduction" },
];

const pillCls = (active: boolean) =>
  cn(
    "px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors select-none",
    active
      ? "bg-bg-active text-text-primary font-medium shadow-sm ring-1 ring-border-strong/60"
      : "text-text-secondary hover:text-text-primary hover:bg-bg-hover/60",
  );

export function FinanceTabs() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const activeManageItem = MANAGE_ITEMS.find((m) => pathname === m.to || pathname.startsWith(`${m.to}/`)) ?? null;

  // Route changes (picking an item) close the menu; Escape closes it too.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="sticky top-0 z-20 border-b border-border-subtle bg-bg-base/95 backdrop-blur-md no-print">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-2.5 relative">
        <nav
          aria-label="Finance sections"
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border-subtle bg-bg-elevated/70 p-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => pillCls(isActive)}>
              {t.label}
            </NavLink>
          ))}
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={cn(pillCls(!!activeManageItem || open), "inline-flex items-center gap-1")}
          >
            {activeManageItem ? `Manage · ${activeManageItem.label}` : "Manage"}
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
          </button>
        </nav>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              role="menu"
              aria-label="Manage records"
              className="absolute top-full mt-1 right-4 md:right-8 z-50 w-72 rounded-xl border border-border-subtle bg-bg-elevated shadow-2xl p-1.5"
            >
              {MANAGE_ITEMS.map((m) => {
                const active = activeManageItem?.to === m.to;
                return (
                  <NavLink
                    key={m.to}
                    to={m.to}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                      active ? "bg-bg-active" : "hover:bg-bg-hover",
                    )}
                  >
                    <m.icon className={cn("w-4 h-4 shrink-0", active ? "text-accent-brand" : "text-text-tertiary")} strokeWidth={1.5} />
                    <span className="min-w-0">
                      <span className={cn("block text-sm", active ? "text-text-primary font-medium" : "text-text-primary")}>
                        {m.label}
                      </span>
                      <span className="block text-[11px] text-text-tertiary truncate">{m.desc}</span>
                    </span>
                  </NavLink>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
