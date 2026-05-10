import { motion, AnimatePresence } from "framer-motion";
import { X, Search, PlayCircle, ArrowRight } from "lucide-react";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router";
import { useApp } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";

type Command = {
  id: string;
  label: string;
  group: string;
  icon?: React.ReactNode;
  onSelect: () => void;
};

export function CommandPalette() {
  const { isCommandPaletteOpen, setCommandPaletteOpen, addToast } = useApp();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
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
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandPaletteOpen]);

  const handleNavigate = (path: string) => {
    navigate(path);
    setCommandPaletteOpen(false);
  };

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [];
    list.push(
      { id: "nav-dash", group: "Navigation", label: "Go to Dashboard", onSelect: () => handleNavigate("/") },
      { id: "nav-orders", group: "Navigation", label: "Go to Orders", onSelect: () => handleNavigate("/orders") },
      { id: "nav-inventory", group: "Navigation", label: "Go to Inventory", onSelect: () => handleNavigate("/inventory") },
      { id: "nav-prop", group: "Navigation", label: "Go to Propagation", onSelect: () => handleNavigate("/propagation") },
      { id: "nav-cult", group: "Navigation", label: "Go to Cultivars", onSelect: () => handleNavigate("/cultivars") },
      { id: "nav-listings", group: "Navigation", label: "Go to Listings", onSelect: () => handleNavigate("/listings") },
      { id: "nav-customers", group: "Navigation", label: "Go to Customers", onSelect: () => handleNavigate("/customers") },
      { id: "nav-shipping", group: "Navigation", label: "Go to Shipping", onSelect: () => handleNavigate("/shipping") },
      { id: "nav-print", group: "Navigation", label: "Go to Print Queue", onSelect: () => handleNavigate("/shipping/print-queue") },
      { id: "nav-expenses", group: "Navigation", label: "Go to Expenses", onSelect: () => handleNavigate("/finances/expenses") },
      { id: "nav-supplies", group: "Navigation", label: "Go to Supplies", onSelect: () => handleNavigate("/finances/supplies") },
      { id: "nav-vendors", group: "Navigation", label: "Go to Vendors", onSelect: () => handleNavigate("/finances/vendors") },
      { id: "nav-tax", group: "Navigation", label: "Go to Tax Report", onSelect: () => handleNavigate("/finances/tax-report") },
      { id: "nav-licenses", group: "Navigation", label: "Go to Licenses", onSelect: () => handleNavigate("/licenses") },
      { id: "nav-settings", group: "Navigation", label: "Go to Settings", onSelect: () => handleNavigate("/settings") },
    );
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(c => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!isCommandPaletteOpen) return null;

  const onPaletteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[activeIndex]?.onSelect();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setCommandPaletteOpen(false);
    }
  };

  // Group filtered results
  const groups: Record<string, Command[]> = {};
  filtered.forEach(c => {
    if (!groups[c.group]) groups[c.group] = [];
    groups[c.group].push(c);
  });
  let runningIndex = 0;

  return (
    <AnimatePresence>
      {isCommandPaletteOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-[#0E0F11]/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[15vh]"
          onClick={() => setCommandPaletteOpen(false)}
          onKeyDown={onPaletteKeyDown}
        >
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-[560px] bg-bg-base/90 backdrop-blur-lg border border-border-subtle rounded-xl overflow-hidden shadow-2xl mr-4 ml-4"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
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
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div ref={listRef} className="max-h-[360px] overflow-y-auto p-2">
              {filtered.length === 0 && (
                <div className="px-2 py-2 text-sm text-text-tertiary text-center">
                  No commands match "{query}".
                </div>
              )}
              {Object.entries(groups).map(([group, items]) => (
                <div key={group} className="mb-4 last:mb-0">
                  <div className={cn(
                    "px-2 py-2 text-xs font-medium uppercase tracking-wider mb-2 flex items-center gap-2",
                    group === "Scenarios" ? "text-accent-brand" : "text-text-secondary",
                  )}>
                    {group === "Scenarios" && <PlayCircle className="w-3.5 h-3.5" />}
                    {group}
                  </div>
                  {items.map((cmd) => {
                    const idx = runningIndex++;
                    const isActive = idx === activeIndex;
                    return (
                      <div
                        key={cmd.id}
                        data-cmd-index={idx}
                        onClick={cmd.onSelect}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          "px-2 py-2 text-sm flex items-center gap-2 rounded-lg cursor-pointer transition-colors",
                          isActive ? "bg-bg-active text-text-primary" : "text-text-secondary",
                        )}
                      >
                        {cmd.icon ?? <ArrowRight className="w-4 h-4 text-text-tertiary opacity-50" />}
                        <span className="flex-1">{cmd.label}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="px-4 py-2 border-t border-border-subtle text-xs text-text-tertiary flex items-center justify-center gap-4 bg-bg-base/30">
              <span><kbd className="font-sans px-2 py-2 rounded bg-bg-active border border-border-subtle">↑↓</kbd> to navigate</span>
              <span><kbd className="font-sans px-2 py-2 rounded bg-bg-active border border-border-subtle">↵</kbd> to select</span>
              <span><kbd className="font-sans px-2 py-2 rounded bg-bg-active border border-border-subtle">esc</kbd> to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
