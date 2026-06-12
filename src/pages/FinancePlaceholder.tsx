import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/StateRenderer";

interface FinancePlaceholderProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  blurb: string;
}

/**
 * Stand-in for finance sub-pages that aren't built yet (Revenue, Mileage). The
 * underlying tables exist (orders, mileage_log) — this is the routed shell so
 * the submenu and quick actions resolve. Styled like every other empty state.
 */
export default function FinancePlaceholder({ title, subtitle, icon, blurb }: FinancePlaceholderProps) {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-2">{title}</h1>
        <p className="text-sm text-text-secondary">{subtitle}</p>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <EmptyState icon={icon} title={`${title} coming soon`} description={blurb} />
      </div>
    </div>
  );
}
