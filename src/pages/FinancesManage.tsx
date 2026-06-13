import { Link } from "react-router";
import { Store, PackageOpen, Repeat, Car, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * Landing for the operational finance records that used to each occupy their own
 * sidebar slot. Demoted here so the section reads as one dense dashboard.
 */
const ITEMS = [
  { to: "/finances/vendors", icon: Store, title: "Vendors", desc: "Suppliers, 1099 contractors, and contacts." },
  { to: "/finances/supplies", icon: PackageOpen, title: "Supplies", desc: "Consumable inventory, unit costs, and reorder points." },
  { to: "/finances/subscriptions", icon: Repeat, title: "Subscriptions", desc: "Recurring business expenses and upcoming renewals." },
  { to: "/finances/mileage", icon: Car, title: "Mileage", desc: "Business trips and the standard-rate deduction." },
] as const;

export default function FinancesManage() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">Manage</h1>
        <p className="text-sm text-text-secondary">Vendors, supplies, subscriptions, and mileage records.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ITEMS.map((i) => (
          <Link key={i.to} to={i.to}>
            <Card className="p-5 flex items-center gap-4 hover:border-border-strong transition-colors group">
              <div className="w-11 h-11 rounded-xl bg-bg-active border border-border-subtle flex items-center justify-center shrink-0">
                <i.icon className="w-5 h-5 text-text-secondary" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{i.title}</div>
                <div className="text-sm text-text-secondary">{i.desc}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-secondary shrink-0" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
