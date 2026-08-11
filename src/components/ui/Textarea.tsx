import { cn } from "@/lib/utils";
import React from "react";
import { FIELD_BASE } from "./field";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: React.Ref<HTMLTextAreaElement>;
};

export function Textarea({ className, ref, ...props }: Props) {
  return <textarea ref={ref} className={cn(FIELD_BASE, className)} {...props} />;
}
