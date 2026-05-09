import { motion, AnimatePresence } from "framer-motion";
import { X, Search, PlayCircle } from "lucide-react";
import React, { useEffect, useId, useState, useRef } from "react";
import { useNavigate } from "react-router";
import { useApp } from "@/contexts/AppContext";

type PaletteCommand = {
  id: string;
  group: "Scenarios (Demo Mode)" | "Navigation";
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
};

export function CommandPalette() {
  const { isCommandPaletteOpen, setCommandPaletteOpen, settings, addToast } = useApp();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const listboxId = useId();
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

  const handleDemoScenario = (scenario: string, path: string, msg: string) => {
    navigate(path);
    setCommandPaletteOpen(false);
    addToast(scenario, msg, "info", 5000);
  };

  const scenarioIcon = <PlayCircle className="w-4 h-4 text-text-tertiary" />;
  const commands: PaletteCommand[] = [
    ...(settings.demoMode
      ? [
          { id: "scenario-etsy-order", group: "Scenarios (Demo Mode)" as const, label: "Run Scenario: Process New Etsy Order", icon: scenarioIcon, onSelect: () => handleDemoScenario("New Etsy Order", "/orders", "A new Etsy order was just placed. View the pending list.") },
          { id: "scenario-weather", group: "Scenarios (Demo Mode)" as const, label: "Run Scenario: Check Shipping Weather", icon: scenarioIcon, onSelect: () => handleDemoScenario("Heat Advisory", "/shipping", "A heat advisory is active in Arizona. Orders are on hold.") },
          { id: "scenario-license", group: "Scenarios (Demo Mode)" as const, label: "Run Scenario: Export License Expiry", icon: scenarioIcon, onSelect: () => handleDemoScenario("License Expiry", "/licenses", "Your Export permit expires in 12 days.") },
          { id: "scenario-batch", group: "Scenarios (Demo Mode)" as const, label: "Run Scenario: Prop Batch Promotion", icon: scenarioIcon, onSelect: () => handleDemoScenario("Batch Promotion", "/propagation", "Batch B-101 is ready for division.") },
          { id: "scenario-supplies", group: "Scenarios (Demo Mode)" as const, label: "Run Scenario: Low Stock Supplies Reorder", icon: scenarioIcon, onSelect: () => handleDemoScenario("Low Stock Reorder", "/finances/supplies", "Sphagnum moss is running low.") },
        ]
      : []),
    { id: "nav-orders", group: "Navigation", label: "Go to Orders", onSelect: () => handleNavigate("/orders") },
    { id: "nav-inventory", group: "Navigation", label: "Go to Inventory", onSelect: () => handleNavigate("/inventory") },
    { id: "nav-propagation", group: "Navigation", label: "Go to Propagation", onSelect: () => handleNavigate("/propagation") },
    { id: "nav-customers", group: "Navigation", label: "Go to Customers", onSelect: () => handleNavigate("/customers") },
    { id: "nav-shipping", group: "Navigation", label: "Go to Shipping", onSelect: () => handleNavigate("/shipping") },
    { id: "nav-print-queue", group: "Navigation", label: "Go to Print Queue", onSelect: () => handleNavigate("/shipping/print-queue") },
  ];
  const visibleCommands = commands.filter((command) =>
    command.label.toLowerCase().includes(query.trim().toLowerCase())
  );
  const activeCommand = visibleCommands[activeIndex];

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex >= visibleCommands.length) {
      setActiveIndex(Math.max(visibleCommands.length - 1, 0));
    }
  }, [activeIndex, visibleCommands.length]);

  if (!isCommandPaletteOpen) return null;

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
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              <div className="flex items-center px-4 py-2 border-b border-border-subtle">
                <Search className="w-5 h-5 text-text-tertiary mr-2" />
                <h2 id={titleId} className="sr-only">Command palette</h2>
                <input
                  ref={inputRef}
                  type="text"
                  role="combobox"
                  aria-label="Search commands"
                  aria-expanded="true"
                  aria-controls={listboxId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeCommand ? `${listboxId}-${activeCommand.id}` : undefined}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setCommandPaletteOpen(false);
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveIndex((index) => visibleCommands.length ? Math.min(index + 1, visibleCommands.length - 1) : 0);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveIndex((index) => Math.max(index - 1, 0));
                    } else if (e.key === "Enter" && activeCommand) {
                      e.preventDefault();
                      activeCommand.onSelect();
                    }
                  }}
                  placeholder="Type a command or search..."
                  className="flex-1 bg-transparent border-none outline-none text-text-primary placeholder:text-text-tertiary text-lg"
                />
                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(false)}
                  aria-label="Close command palette"
                  className="text-text-secondary hover:text-text-primary rounded-md p-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div id={listboxId} role="listbox" aria-label="Command results" className="max-h-[360px] overflow-y-auto p-2">
                {visibleCommands.length === 0 ? (
                  <div role="status" className="px-2 py-6 text-center text-sm text-text-secondary">
                    No commands found.
                  </div>
                ) : (
                  (["Scenarios (Demo Mode)", "Navigation"] as const).map((group) => {
                    const groupCommands = visibleCommands.filter((command) => command.group === group);
                    if (!groupCommands.length) return null;

                    return (
                      <div key={group} className="mb-4 last:mb-0">
                        <div className={`px-2 py-2 text-xs font-medium uppercase tracking-wider mb-2 flex items-center gap-2 ${group === "Scenarios (Demo Mode)" ? "text-accent-brand" : "text-text-secondary"}`}>
                          {group === "Scenarios (Demo Mode)" && <PlayCircle className="w-3.5 h-3.5" />}
                          {group}
                        </div>
                        {groupCommands.map((command) => {
                          const commandIndex = visibleCommands.findIndex((item) => item.id === command.id);
                          return (
                            <React.Fragment key={command.id}>
                              <PaletteItem
                                id={`${listboxId}-${command.id}`}
                                onSelect={command.onSelect}
                                onActive={() => setActiveIndex(commandIndex)}
                                label={command.label}
                                icon={command.icon}
                                selected={commandIndex === activeIndex}
                              />
                            </React.Fragment>
                          );
                        })}
                      </div>
                    );
                  })
                )}
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

function PaletteItem({
  id,
  onSelect,
  onActive,
  label,
  icon,
  selected,
}: {
  key?: React.Key;
  id: string;
  onSelect: () => void;
  onActive: () => void;
  label: string;
  icon?: React.ReactNode;
  selected: boolean;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onMouseEnter={onActive}
      className={`px-2 py-2 text-sm text-text-primary flex items-center gap-2 rounded-lg hover:bg-bg-active cursor-pointer transition-colors ${selected ? "bg-bg-active" : ""}`}
    >
      {icon}
      {label}
    </div>
  );
}
