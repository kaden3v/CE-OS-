import React from "react";

export function RechartsChart({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full relative [&_.recharts-cartesian-axis-tick-value]:fill-text-secondary [&_.recharts-tooltip-wrapper]:!outline-none [&_.recharts-default-tooltip]:!bg-bg-elevated [&_.recharts-default-tooltip]:!border-border-strong [&_.recharts-default-tooltip]:!text-sm [&_.recharts-default-tooltip]:!rounded-lg">
      <div className="absolute inset-0">
         {children}
      </div>
    </div>
  );
}
