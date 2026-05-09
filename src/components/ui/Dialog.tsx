import React, { useEffect, useId, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  width?: number;
  dirty?: boolean;
  confirmCloseMessage?: string;
  onInteractOutside?: () => boolean | void;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = 480,
  dirty = false,
  confirmCloseMessage = "Discard unsaved changes?",
  onInteractOutside,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const requestClose = (source: "escape" | "outside") => {
    if (source === "outside" && onInteractOutside?.() === false) return;
    if (dirty && !window.confirm(confirmCloseMessage)) return;
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
      return;
    }

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>(focusableSelector);
    window.setTimeout(() => (focusable ?? dialog)?.focus(), 0);
  }, [open]);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 bg-[#0E0F11]/60 backdrop-blur-sm"
            onClick={() => requestClose("outside")}
          />
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative bg-[rgba(255,255,255,0.06)] backdrop-blur-md border border-border-subtle rounded-xl shadow-2xl p-6 w-full"
            style={{ maxWidth: width }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                requestClose("escape");
                return;
              }
              if (e.key !== "Tab") return;

              const focusable: HTMLElement[] = Array.from(
                dialogRef.current?.querySelectorAll(focusableSelector) ?? []
              ).filter((el): el is HTMLElement => el instanceof HTMLElement).filter(
                (el) => el.getClientRects().length > 0 || el === document.activeElement
              );
              if (!focusable.length) {
                e.preventDefault();
                dialogRef.current?.focus();
                return;
              }

              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
          >
            <div className="mb-6">
              <h2 id={titleId} className="text-xl font-semibold text-text-primary">{title}</h2>
              {description && <p id={descriptionId} className="text-sm text-text-secondary mt-2">{description}</p>}
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
