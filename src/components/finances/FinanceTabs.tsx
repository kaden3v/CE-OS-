import { NavLink } from "react-router";
import { PieChart, TrendingUp, Target, Receipt, Factory, FileSpreadsheet, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Primary in-page navigation for the consolidated Finance dashboard. The whole
 * section lives under a single sidebar entry; these tabs replace what used to be
 * nine separate sidebar items. Operational records (vendors, supplies,
 * subscriptions, mileage) live behind "Manage".
 */
const TABS: { to: string; label: string; icon: typeof PieChart; end?: boolean }[] = [
  { to: "/finances", label: "Overview", icon: PieChart, end: true },
  { to: "/finances/revenue", label: "Revenue", icon: TrendingUp },
  { to: "/finances/goals", label: "Goals", icon: Target },
  { to: "/finances/expenses", label: "Expenses", icon: Receipt },
  { to: "/finances/production", label: "Production", icon: Factory },
  { to: "/finances/reports", label: "Reports", icon: FileSpreadsheet },
  { to: "/finances/manage", label: "Manage", icon: SlidersHorizontal },
];

export function FinanceTabs() {
  return (
    <div className="sticky top-0 z-10 border-b border-border-subtle bg-bg-base/95 backdrop-blur-md no-print">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <nav className="flex items-center gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-1.5 px-3 py-3 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
                  isActive
                    ? "border-accent-brand text-text-primary"
                    : "border-transparent text-text-secondary hover:text-text-primary",
                )
              }
            >
              <t.icon className="w-4 h-4" strokeWidth={1.5} />
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
