import React, { useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { X } from "lucide-react";
import { StatusDot } from "./StatusDot";

export function Toasts() {
  const { toasts, removeToast } = useApp();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[360px] pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

const ToastItem: React.FC<{ toast: any; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (toast.status === "alert") return; // sticky for alerts
    const duration = toast.duration || (toast.status === "warn" ? 8000 : 4000);
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div className="pointer-events-auto bg-[rgba(255,255,255,0.06)] backdrop-blur-md border border-border-subtle rounded-lg p-4 shadow-lg flex items-start gap-2 animate-in slide-in-from-right-8 fade-in duration-200 ease-out">
      <StatusDot status={toast.status} className="mt-2 flex-shrink-0" />
      <div className="flex-1">
        <h4 className="text-sm font-medium text-text-primary">{toast.title}</h4>
        {toast.description && (
          <p className="text-xs text-text-secondary mt-2">{toast.description}</p>
        )}
      </div>
      <button onClick={onDismiss} className="text-text-secondary hover:text-text-primary text-xs shrink-0 self-start p-2 transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
