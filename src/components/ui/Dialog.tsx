import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  width?: number;
}

export function Dialog({ open, onOpenChange, title, description, children, width = 480 }: DialogProps) {
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
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative bg-[rgba(255,255,255,0.06)] backdrop-blur-md border border-border-subtle rounded-xl shadow-2xl p-6 w-full"
            style={{ maxWidth: width }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
              {description && <p className="text-sm text-text-secondary mt-2">{description}</p>}
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
