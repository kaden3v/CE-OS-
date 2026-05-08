import { cn } from "@/lib/utils";
import React from "react";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "bg-bg-elevated border border-border-strong rounded-[8px] px-2 py-2 text-sm placeholder:text-text-secondary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors",
        className
      )}
      {...props}
    />
  );
}
