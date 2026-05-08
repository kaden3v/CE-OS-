import { cn } from "@/lib/utils";
import React from "react";

export function Button({
  className,
  variant = "default",
  size = "default",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline" | "brand";
  size?: "default" | "sm" | "icon";
}) {
  const variants = {
    default: "bg-bg-elevated hover:bg-bg-hover text-text-primary border border-border-subtle",
    ghost: "hover:bg-bg-hover text-text-secondary hover:text-text-primary",
    outline: "border border-border-strong hover:bg-bg-hover text-text-primary",
    brand: "bg-accent-brand-dim text-accent-brand hover:bg-accent-brand hover:text-bg-base border border-accent-brand/20",
  };
  const sizes = {
    default: "px-4 py-2",
    sm: "px-2 py-2 text-xs",
    icon: "p-2",
  };
  return (
    <button
      className={cn(
        "rounded-[8px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
