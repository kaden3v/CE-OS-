import { cn } from "@/lib/utils";
import React from "react";

export function Badge({
  className,
  children,
  variant = "default",
}: {
  className?: string;
  children: React.ReactNode;
  variant?: "default" | "brand" | "outline";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded flex-shrink-0 px-2 py-1 text-[10px] font-medium tracking-wide uppercase",
        variant === "default" && "bg-bg-elevated text-text-secondary border border-border-subtle",
        variant === "brand" && "bg-accent-brand-dim text-accent-brand border border-accent-brand/20",
        variant === "outline" && "bg-transparent text-text-secondary border border-border-strong",
        className
      )}
    >
      {children}
    </span>
  );
}
