import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: "ok" | "warn" | "alert" | "info";
  className?: string;
}

const statusColors = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  alert: "bg-status-alert",
  info: "bg-status-info",
};

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-block w-[6px] h-[6px] rounded-full",
        statusColors[status],
        className
      )}
    />
  );
}
