import { cn } from "@/lib/utils";
import React, { forwardRef, useId } from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: React.ReactNode;
  error?: React.ReactNode;
  hideLabel?: boolean;
};

function getDefaultAutoComplete(type?: React.HTMLInputTypeAttribute): string | undefined {
  if (type === "email") return "email";
  if (type === "password") return "current-password";
  if (type === "search") return "off";
  return undefined;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({
  className,
  id,
  label,
  error,
  hideLabel = false,
  type,
  autoComplete,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}, ref) {
  const generatedId = useId();
  const inputId = id ?? `input-${generatedId}`;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [ariaDescribedBy, errorId].filter(Boolean).join(" ") || undefined;
  const input = (
    <input
      ref={ref}
      id={inputId}
      type={type}
      autoComplete={autoComplete ?? getDefaultAutoComplete(type)}
      aria-invalid={ariaInvalid ?? (error ? true : undefined)}
      aria-describedby={describedBy}
      className={cn(
        "bg-bg-elevated border border-border-strong rounded-[8px] px-2 py-2 text-sm placeholder:text-text-secondary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors",
        className
      )}
      {...props}
    />
  );

  if (!label && !error) return input;

  return (
    <div className="space-y-2 w-full">
      {label && (
        <label
          htmlFor={inputId}
          className={cn(
            "block text-xs font-medium text-text-secondary",
            hideLabel && "sr-only"
          )}
        >
          {label}
        </label>
      )}
      {input}
      {error && (
        <p id={errorId} className="text-xs text-status-alert">
          {error}
        </p>
      )}
    </div>
  );
});
