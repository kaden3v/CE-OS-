import React from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, FileSearch, Filter } from "lucide-react";
import { Button } from "./Button";

export function LoadingTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full">
      <table className="w-full text-sm text-left">
        <thead className="text-[12px] uppercase tracking-wide text-text-secondary border-b border-border-subtle">
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-2 font-medium">
                <div className="h-4 bg-bg-elevated rounded animate-pulse" style={{ width: `${Math.random() * 40 + 40}%`, animationDuration: '1.2s' }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-transparent">
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="border-b border-border-subtle/50 last:border-0">
              {Array.from({ length: cols }).map((_, j) => (
                <td key={j} className="px-4 py-2">
                  <div className="h-4 bg-bg-elevated rounded animate-pulse" style={{ width: `${Math.random() * 60 + 20}%`, animationDuration: '1.2s', '--tw-pulse-opacity': '0.6' } as any} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LoadingList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border-subtle">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-bg-elevated animate-pulse" />
            <div className="space-y-2">
              <div className="h-3 w-32 bg-bg-elevated rounded animate-pulse" />
              <div className="h-3 w-48 bg-bg-elevated rounded animate-pulse" />
            </div>
          </div>
          <div className="h-3 w-16 bg-bg-elevated rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return <div className="w-full h-full bg-bg-elevated/60 rounded-lg animate-pulse" />;
}

export function ErrorState({ title = "Couldn't load data", description = "There was a problem loading this information.", onRetry }: { title?: string, description?: string, onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center h-[300px]">
      <AlertCircle className="w-12 h-12 text-status-alert mb-4 opacity-80" strokeWidth={1} />
      <h3 className="text-base font-medium text-text-primary mb-2">{title}</h3>
      <p className="text-sm text-text-secondary mb-6 max-w-sm">{description}</p>
      {onRetry && (
        <div className="flex items-center gap-2">
          <Button variant="default" onClick={onRetry}>Try again</Button>
          <Button variant="ghost">View status</Button>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon = FileSearch, title = "No results", description = "No items match your criteria.", action }: { icon?: any, title?: string, description?: string, action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center h-[300px] bg-bg-elevated backdrop-blur-md rounded-lg">
      <div className="w-24 h-24 rounded-2xl border border-border-subtle flex items-center justify-center mb-6 bg-bg-base/50">
        <Icon className="w-12 h-12 text-text-tertiary" strokeWidth={1} />
      </div>
      <h3 className="text-base font-medium text-text-primary mb-2">{title}</h3>
      <p className="text-sm text-text-secondary mb-6 max-w-sm">{description}</p>
      {action}
    </div>
  );
}

export function ZeroResultState({ onClearOption }: { onClearOption?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-base border border-dashed border-border-strong rounded-lg my-4">
      <Filter className="w-8 h-8 text-text-tertiary mb-2" strokeWidth={1.5} />
      <h3 className="text-sm font-medium text-text-primary mb-2">No matching results</h3>
      <p className="text-xs text-text-secondary mb-4">Try adjusting your filters.</p>
      {onClearOption && (
        <Button variant="outline" size="sm" onClick={onClearOption}>Clear filters</Button>
      )}
    </div>
  );
}
