import { motion, AnimatePresence } from "framer-motion";
import { X, Search, PlayCircle } from "lucide-react";
import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router";
import { useApp } from "@/contexts/AppContext";

export function CommandPalette() {
  const { isCommandPaletteOpen, setCommandPaletteOpen, settings, addToast } = useApp();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen(!isCommandPaletteOpen);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCommandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const handleNavigate = (path: string) => {
    navigate(path);
    setCommandPaletteOpen(false);
  };

  const handleDemoScenario = (scenario: string, path: string, msg: string) => {
    navigate(path);
    setCommandPaletteOpen(false);
    addToast(scenario, msg, "info", 5000);
  };

  return (
    <AnimatePresence>
      {isCommandPaletteOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-[#0E0F11]/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[15vh]"
            onClick={() => setCommandPaletteOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-[560px] bg-bg-base/90 backdrop-blur-lg border border-border-subtle rounded-xl overflow-hidden shadow-2xl mr-4 ml-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center px-4 py-2 border-b border-border-subtle">
                <Search className="w-5 h-5 text-text-tertiary mr-2" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type a command or search..."
                  className="flex-1 bg-transparent border-none outline-none text-text-primary placeholder:text-text-tertiary text-lg"
                />
                <button
                  onClick={() => setCommandPaletteOpen(false)}
                  className="text-text-secondary hover:text-text-primary rounded-md p-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="max-h-[360px] overflow-y-auto p-2">
                {settings.demoMode && (
                  <div className="mb-4">
                    <div className="px-2 py-2 text-xs font-medium text-accent-brand uppercase tracking-wider mb-2 flex items-center gap-2">
                      <PlayCircle className="w-3.5 h-3.5" /> Scenarios (Demo Mode)
                    </div>
                    <PaletteItem onSelect={() => handleDemoScenario("New Etsy Order", "/orders", "A new Etsy order was just placed. View the pending list.")} label="Run Scenario: Process New Etsy Order" icon={<PlayCircle className="w-4 h-4 text-text-tertiary"/>} />
                    <PaletteItem onSelect={() => handleDemoScenario("Heat Advisory", "/shipping", "A heat advisory is active in Arizona. Orders are on hold.")} label="Run Scenario: Check Shipping Weather" icon={<PlayCircle className="w-4 h-4 text-text-tertiary"/>} />
                    <PaletteItem onSelect={() => handleDemoScenario("License Expiry", "/licenses", "Your Export permit expires in 12 days.")} label="Run Scenario: Export License Expiry" icon={<PlayCircle className="w-4 h-4 text-text-tertiary"/>} />
                    <PaletteItem onSelect={() => handleDemoScenario("Batch Promotion", "/propagation", "Batch B-101 is ready for division.")} label="Run Scenario: Prop Batch Promotion" icon={<PlayCircle className="w-4 h-4 text-text-tertiary"/>} />
                    <PaletteItem onSelect={() => handleDemoScenario("Low Stock Reorder", "/finances/supplies", "Sphagnum moss is running low.")} label="Run Scenario: Low Stock Supplies Reorder" icon={<PlayCircle className="w-4 h-4 text-text-tertiary"/>} />
                  </div>
                )}

                <div className="px-2 py-2 text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
                  Navigation
                </div>
                <PaletteItem onSelect={() => handleNavigate('/orders')} label="Go to Orders" />
                <PaletteItem onSelect={() => handleNavigate('/inventory')} label="Go to Inventory" />
                <PaletteItem onSelect={() => handleNavigate('/propagation')} label="Go to Propagation" />
                <PaletteItem onSelect={() => handleNavigate('/customers')} label="Go to Customers" />
                <PaletteItem onSelect={() => handleNavigate('/shipping')} label="Go to Shipping" />
                <PaletteItem onSelect={() => handleNavigate('/shipping/print-queue')} label="Go to Print Queue" />
                <PaletteItem onSelect={() => handleNavigate('/finances/tax-report/year-end')} label="Go to Year-End Snapshot" />
              </div>

              <div className="px-4 py-2 border-t border-border-subtle text-xs text-text-tertiary flex items-center justify-center gap-4 bg-bg-base/30">
                <span><kbd className="font-sans px-2 py-2 rounded bg-bg-active border border-border-subtle">↑↓</kbd> to navigate</span>
                <span><kbd className="font-sans px-2 py-2 rounded bg-bg-active border border-border-subtle">↵</kbd> to select</span>
                <span><kbd className="font-sans px-2 py-2 rounded bg-bg-active border border-border-subtle">esc</kbd> to close</span>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function PaletteItem({ onSelect, label, icon }: { onSelect: () => void, label: string, icon?: React.ReactNode }) {
  return (
    <div
      onClick={onSelect}
      className="px-2 py-2 text-sm text-text-primary flex items-center gap-2 rounded-lg hover:bg-bg-active cursor-pointer transition-colors"
    >
      {icon}
      {label}
    </div>
  );
}
