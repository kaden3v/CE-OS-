import { motion, AnimatePresence } from "framer-motion";
import { X, Search, PlayCircle, ArrowRight, Flower2, Users, PackageSearch, ShoppingCart, Receipt, Repeat, PackageOpen, Store, Factory } from "lucide-react";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_MIN_CHARS = 2;
const SEARCH_LIMIT_PER_TYPE = 5;

type Command = {
  id: string;
  label: string;
  group: string;
  icon?: React.ReactNode;
  onSelect: () => void;
};

export function CommandPalette() {
  const { isCommandPaletteOpen, setCommandPaletteOpen, setGlobalOrderViewId } = useApp();
  const { activeOrgId } = useAuth();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [results, setResults] = useState<Command[]>([]);
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

  // Live data search across the org's records (RLS-scoped). The query is
  // debounced; % and _ are escaped so they can't act as wildcards.
  useEffect(() => {
    const q = query.trim();
    if (!supabase || !activeOrgId || q.length < SEARCH_MIN_CHARS) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
      const db = supabase as any;
      const [cult, cust, inv, ord, ven, sup, sub, exp, run] = await Promise.all([
        db.from("cultivars").select("id,name").eq("org_id", activeOrgId).ilike("name", like).limit(SEARCH_LIMIT_PER_TYPE),
        db.from("customers").select("id,name").eq("org_id", activeOrgId).ilike("name", like).limit(SEARCH_LIMIT_PER_TYPE),
        db.from("inventory").select("id,name").eq("org_id", activeOrgId).ilike("name", like).limit(SEARCH_LIMIT_PER_TYPE),
        db.from("orders").select("id, customers!inner(name)").eq("org_id", activeOrgId).ilike("customers.name", like).limit(SEARCH_LIMIT_PER_TYPE),
        db.from("vendors").select("id,name").eq("org_id", activeOrgId).ilike("name", like).limit(SEARCH_LIMIT_PER_TYPE),
        db.from("supplies").select("id,name").eq("org_id", activeOrgId).ilike("name", like).limit(SEARCH_LIMIT_PER_TYPE),
        db.from("recurring_expenses").select("id,name").eq("org_id", activeOrgId).ilike("name", like).limit(SEARCH_LIMIT_PER_TYPE),
        db.from("expenses").select("id,description,amount").eq("org_id", activeOrgId).ilike("description", like).limit(SEARCH_LIMIT_PER_TYPE),
        db.from("production_runs").select("id,description").eq("org_id", activeOrgId).ilike("description", like).limit(SEARCH_LIMIT_PER_TYPE),
      ]);
      if (cancelled) return;
      const found: Command[] = [];
      (cult.data ?? []).forEach((r: { id: string; name: string }) =>
        found.push({ id: `cult-${r.id}`, group: "Cultivars", label: r.name, icon: <Flower2 className="w-4 h-4 text-text-tertiary" />, onSelect: () => handleNavigate("/cultivars") }));
      (cust.data ?? []).forEach((r: { id: string; name: string }) =>
        found.push({ id: `cust-${r.id}`, group: "Customers", label: r.name, icon: <Users className="w-4 h-4 text-text-tertiary" />, onSelect: () => handleNavigate("/customers") }));
      (inv.data ?? []).forEach((r: { id: string; name: string }) =>
        found.push({ id: `inv-${r.id}`, group: "Inventory", label: r.name, icon: <PackageSearch className="w-4 h-4 text-text-tertiary" />, onSelect: () => handleNavigate("/inventory") }));
      (ord.data ?? [])
        .filter((r: { customers: { name: string } | null }) => r.customers)
        .forEach((r: { id: string; customers: { name: string } }) =>
          found.push({
            id: `ord-${r.id}`,
            group: "Orders",
            label: `${r.id.slice(0, 8)} · ${r.customers.name}`,
            icon: <ShoppingCart className="w-4 h-4 text-text-tertiary" />,
            onSelect: () => {
              setGlobalOrderViewId(r.id);
              handleNavigate("/orders");
            },
          }));
      (ven.data ?? []).forEach((r: { id: string; name: string }) =>
        found.push({ id: `ven-${r.id}`, group: "Vendors", label: r.name, icon: <Store className="w-4 h-4 text-text-tertiary" />, onSelect: () => handleNavigate(`/finances/vendors/${r.id}`) }));
      (sup.data ?? []).forEach((r: { id: string; name: string }) =>
        found.push({ id: `sup-${r.id}`, group: "Supplies", label: r.name, icon: <PackageOpen className="w-4 h-4 text-text-tertiary" />, onSelect: () => handleNavigate("/finances/supplies") }));
      (sub.data ?? []).forEach((r: { id: string; name: string }) =>
        found.push({ id: `sub-${r.id}`, group: "Subscriptions", label: r.name, icon: <Repeat className="w-4 h-4 text-text-tertiary" />, onSelect: () => handleNavigate("/finances/subscriptions") }));
      (exp.data ?? []).forEach((r: { id: string; description: string | null; amount: number }) =>
        found.push({ id: `exp-${r.id}`, group: "Expenses", label: `${r.description ?? "Expense"} · $${Number(r.amount).toFixed(2)}`, icon: <Receipt className="w-4 h-4 text-text-tertiary" />, onSelect: () => handleNavigate("/finances/expenses") }));
      (run.data ?? []).forEach((r: { id: string; description: string | null }) =>
        found.push({ id: `run-${r.id}`, group: "Production", label: r.description ?? "Production run", icon: <Factory className="w-4 h-4 text-text-tertiary" />, onSelect: () => handleNavigate("/finances/production") }));
      setResults(found);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeOrgId]);

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
      { id: "nav-finances", group: "Navigation", label: "Go to Finances Overview", onSelect: () => handleNavigate("/finances") },
      { id: "nav-revenue", group: "Navigation", label: "Go to Revenue", onSelect: () => handleNavigate("/finances/revenue") },
      { id: "nav-expenses", group: "Navigation", label: "Go to Expenses", onSelect: () => handleNavigate("/finances/expenses") },
      { id: "nav-subscriptions", group: "Navigation", label: "Go to Subscriptions", onSelect: () => handleNavigate("/finances/subscriptions") },
      { id: "nav-supplies", group: "Navigation", label: "Go to Supplies", onSelect: () => handleNavigate("/finances/supplies") },
      { id: "nav-production", group: "Navigation", label: "Go to Production", onSelect: () => handleNavigate("/finances/production") },
      { id: "nav-vendors", group: "Navigation", label: "Go to Vendors", onSelect: () => handleNavigate("/finances/vendors") },
      { id: "nav-mileage", group: "Navigation", label: "Go to Mileage", onSelect: () => handleNavigate("/finances/mileage") },
      { id: "nav-reports", group: "Navigation", label: "Go to Reports", onSelect: () => handleNavigate("/finances/reports") },
      { id: "nav-licenses", group: "Navigation", label: "Go to Licenses", onSelect: () => handleNavigate("/licenses") },
      { id: "nav-settings", group: "Navigation", label: "Go to Settings", onSelect: () => handleNavigate("/settings") },
    );
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const navMatches = q ? commands.filter(c => c.label.toLowerCase().includes(q)) : commands;
    // Data results first — they're what the user is most likely hunting for.
    return [...results, ...navMatches];
  }, [commands, results, query]);

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
                placeholder="Search plants, customers, orders, or pages..."
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
                  No matches for "{query}".
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
