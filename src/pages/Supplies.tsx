import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { useDataState } from "@/hooks/useDataState";
import { ErrorState, EmptyState } from "@/components/ui/StateRenderer";
import { PackageOpen } from "lucide-react";
import { CultivarName } from "@/components/ui/CultivarName";

const SUPPLIES = [
  { id: 1, name: "Long-fiber Sphagnum", stock: "2 bales", threshold: "3 bales", vendor: "Sphagnum Moss Co.", lastOrdered: "2 months ago", low: true },
  { id: 2, name: "Perlite", stock: "10 bags", threshold: "2 bags", vendor: "Home Depot", lastOrdered: "3 months ago", low: false },
  { id: 3, name: "Pumice", stock: "5 bags", threshold: "2 bags", vendor: "Local Nursery", lastOrdered: "1 month ago", low: false },
  { id: 4, name: "2-inch Nursery Pots", stock: "450 pcs", threshold: "100 pcs", vendor: "Amazon Business", lastOrdered: "4 months ago", low: false },
  { id: 5, name: "3-inch Nursery Pots", stock: "80 pcs", threshold: "100 pcs", vendor: "Amazon Business", lastOrdered: "4 months ago", low: true },
  { id: 6, name: "Plant Tags", stock: "1500 pcs", threshold: "500 pcs", vendor: "Etsy Print Shop", lastOrdered: "6 months ago", low: false },
  { id: 7, name: "Priority Mail Boxes", stock: "20 pcs", threshold: "50 pcs", vendor: "USPS", lastOrdered: "3 weeks ago", low: true },
  { id: 8, name: "Ice Packs (Phase 22)", stock: "120 pcs", threshold: "50 pcs", vendor: "Amazon Business", lastOrdered: "1 year ago", low: false },
];

export default function Supplies() {
  const { data, isLoading, isError, isEmpty } = useDataState(SUPPLIES);

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-2">Supplies</h1>
        <p className="text-sm text-text-secondary">Physical inventory for shipping and potting media.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading && Array.from({length: 6}).map((_, i) => (
          <Card key={i} className="p-4 h-[160px] animate-pulse bg-bg-elevated/50" />
        ))}
        {isError && <div className="col-span-full"><ErrorState /></div>}
        {!isLoading && !isError && isEmpty && (
           <div className="col-span-full">
              <EmptyState icon={PackageOpen} title="No supplies tracked" description="Physical inventory for shipping and potting media." action={<button className="px-4 py-2 border border-border-strong rounded-md hover:bg-bg-hover transition-colors mt-2 text-sm">Add Supply</button>} />
           </div>
        )}
        {!isLoading && !isError && !isEmpty && data.map((item) => (
          <Card key={item.id} className="p-4 hover:border-border-strong transition-colors cursor-pointer">
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-medium text-lg leading-tight">{item.name}</h3>
              {item.low && <Badge variant="default" className="text-status-alert border-status-alert/20">Low Stock</Badge>}
            </div>

            <div className="flex items-center gap-6 mb-4">
              <div>
                <span className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Current Stock</span>
                <span className="font-medium tabular-nums flex items-center gap-2">
                  <StatusDot status={item.low ? "alert" : "ok"} />
                  {item.stock}
                </span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Reorder At</span>
                <span className="text-text-secondary tabular-nums">{item.threshold}</span>
              </div>
            </div>

            <div className="text-xs text-text-secondary pt-2 border-t border-border-subtle flex justify-between items-center">
              <span>{item.vendor}</span>
              <span>Ordered {item.lastOrdered}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
