import { cn } from "@/lib/utils";
import React from "react";

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-bg-elevated backdrop-blur-md rounded-[12px] border border-border-subtle overflow-hidden",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
