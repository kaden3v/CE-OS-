import { cn } from "@/lib/utils";
import React from "react";
import { FIELD_BASE } from "./field";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>;
};

export function Input({ className, ref, ...props }: Props) {
  return <input ref={ref} className={cn(FIELD_BASE, className)} {...props} />;
}
