import { cn } from "@/lib/utils";
import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline" | "brand";
  size?: "default" | "sm" | "icon";
  loading?: boolean;
};

function hasVisibleText(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some((child) => {
    if (typeof child === "string" || typeof child === "number") {
      return String(child).trim().length > 0;
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
      return hasVisibleText(child.props.children);
    }
    return false;
  });
}

export function Button({
  className,
  variant = "default",
  size = "default",
  children,
  loading = false,
  "aria-label": ariaLabel,
  title,
  disabled,
  ...props
}: ButtonProps) {
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
  const isIconOnly = !hasVisibleText(children);
  const accessibleName = ariaLabel ?? title ?? (isIconOnly ? "Icon button" : undefined);

  if (import.meta.env.DEV && isIconOnly && !ariaLabel && !title) {
    console.warn("Icon-only Button rendered without an aria-label or title.");
  }

  return (
    <button
      className={cn(
        "rounded-[8px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",
        variants[variant],
        sizes[size],
        className
      )}
      aria-busy={loading || undefined}
      aria-label={accessibleName}
      title={title}
      disabled={disabled || loading}
      {...props}
    >
      {children}
    </button>
  );
}
