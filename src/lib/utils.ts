import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Two-letter initials from an email local-part for avatar chips. */
export function operatorInitials(email: string): string {
  const local = email.split("@")[0] ?? "?";
  const parts = local.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  const compact = local.replace(/[^a-zA-Z0-9]/g, "");
  return compact.slice(0, 2).toUpperCase() || "?";
}
