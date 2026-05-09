import React from "react";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, FileSearch, Filter } from "lucide-react";
import { Button } from "./Button";

export type DataViewState = "loading" | "error" | "empty" | "ready";

export function resolveDataViewState(
  isLoading: boolean,
  isError: boolean,
  isEmpty: boolean
): DataViewState {
  if (isLoading) return "loading";
  if (isError) return "error";
  if (isEmpty) return "empty";
  return "ready";
}

export type StateRendererProps<T> = {
  state: DataViewState;
  data: T;
  children: (data: T) => React.ReactNode;
  errorFallback?: React.ReactNode;
  emptyFallback?: React.ReactNode;
  loadingFallback?: React.ReactNode;
};

export function StateRenderer<T>({
  state,
  data,
  children,
  errorFallback,
  emptyFallback,
  loadingFallback,
}: StateRendererProps<T>) {
  if (state === "loading") {
    return <>{loadingFallback ?? null}</>;
  }
  if (state === "error") {
    return <>{errorFallback ?? <ErrorState />}</>;
  }
  if (state === "empty") {
    return <>{emptyFallback ?? <EmptyState />}</>;
  }
  return <>{children(data)}</>;
}

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
                  <div
                    className="h-4 bg-bg-elevated rounded animate-pulse"
                    style={
                      {
                        width: `${Math.random() * 60 + 20}%`,
                        animationDuration: "1.2s",
                        ["--tw-pulse-opacity"]: "0.6",
                      } as CSSProperties
                    }
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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

export function EmptyState({ icon: Icon = FileSearch, title = "No results", description = "No items match your criteria.", action }: { icon?: LucideIcon, title?: string, description?: string, action?: React.ReactNode }) {
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
