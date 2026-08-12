import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Portal } from "./Portal";

export function Toasts() {
  const { toasts, removeToast } = useApp();

  // z-toast, not z-50: <Toasts /> mounts before the router in App.tsx, so at an
  // equal z-index every modal (later in the DOM) painted over it — errors
  // raised from inside a dialog were never seen.
  return (
    <Portal>
      <div className="fixed top-[calc(1rem+env(safe-area-inset-top))] right-4 left-4 sm:left-auto z-toast flex flex-col gap-2 sm:w-[360px] pointer-events-none">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
          ))}
        </AnimatePresence>
      </div>
    </Portal>
  );
}

const STATUS_CONFIG = {
  ok: {
    Icon: CheckCircle2,
    iconClass: "text-status-ok",
    bgClass: "bg-status-ok/15",
    borderClass: "border-status-ok/30",
    accentClass: "bg-status-ok",
  },
  info: {
    Icon: Info,
    iconClass: "text-status-info",
    bgClass: "bg-status-info/15",
    borderClass: "border-status-info/30",
    accentClass: "bg-status-info",
  },
  warn: {
    Icon: AlertTriangle,
    iconClass: "text-status-warn",
    bgClass: "bg-status-warn/15",
    borderClass: "border-status-warn/30",
    accentClass: "bg-status-warn",
  },
  alert: {
    Icon: AlertCircle,
    iconClass: "text-status-alert",
    bgClass: "bg-status-alert/15",
    borderClass: "border-status-alert/30",
    accentClass: "bg-status-alert",
  },
} as const;

type ToastStatus = keyof typeof STATUS_CONFIG;

const ToastItem: React.FC<{ toast: any; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (toast.status === "alert") return; // alerts are sticky
    const duration = toast.duration || (toast.status === "warn" ? 8000 : 4000);
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const status: ToastStatus = (toast.status as ToastStatus) ?? "info";
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.info;
  const Icon = cfg.Icon;

  return (
    // framer-motion, not `animate-in slide-in-from-right-8`: those are
    // tailwindcss-animate classes and that package isn't installed, so the
    // entrance never rendered. framer-motion is already a dependency and drives
    // every other overlay animation — and it gives the exit the toast never had.
    <motion.div
      layout
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 32 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      role="status"
      aria-live={status === "alert" ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto relative bg-[rgba(255,255,255,0.06)] backdrop-blur-md border rounded-lg p-3 pl-4 shadow-lg flex items-start gap-3 overflow-hidden",
        cfg.borderClass,
      )}
    >
      {/* Left accent bar */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", cfg.accentClass)} />

      {/* Icon */}
      <div
        className={cn(
          "shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
          cfg.bgClass,
        )}
      >
        <Icon className={cn("w-4 h-4", cfg.iconClass)} strokeWidth={2} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 pt-0.5">
        <h4 className="text-sm font-medium text-text-primary leading-tight">{toast.title}</h4>
        {toast.description && <p className="text-xs text-text-secondary mt-1 leading-snug">{toast.description}</p>}
      </div>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-text-tertiary hover:text-text-primary p-1 -mr-1 -mt-1 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};
