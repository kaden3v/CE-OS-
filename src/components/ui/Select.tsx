import { cn } from "@/lib/utils";
import React from "react";
import { FIELD_BASE } from "./field";

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  ref?: React.Ref<HTMLSelectElement>;
};

/**
 * Native <select> with the shared field styling.
 *
 * Deliberately a single element rather than a wrapper div with an absolutely
 * positioned icon: that keeps it a drop-in for the raw `<select>`s it replaced,
 * so callers' width and layout classes land exactly where they always did. The
 * chevron comes from the `select-chevron` utility in index.css.
 */
export function Select({ className, children, ref, ...props }: Props) {
  return (
    <select
      ref={ref}
      className={cn(FIELD_BASE, "appearance-none pr-8 select-chevron", className)}
      {...props}
    >
      {children}
    </select>
  );
}
