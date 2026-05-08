import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  {
    category: "Global",
    items: [
      { keys: ["⌘", "K"], desc: "Open command palette" },
      { keys: ["⌘", "N"], desc: "Quick add (context-aware)" },
      { keys: ["⌘", "/"], desc: "Show this reference" },
      { keys: ["g", "d"], desc: "Go to Dashboard" },
      { keys: ["g", "o"], desc: "Go to Orders" },
      { keys: ["g", "i"], desc: "Go to Inventory" },
      { keys: ["g", "p"], desc: "Go to Propagation" },
      { keys: ["g", "c"], desc: "Go to Cultivars" },
      { keys: ["g", "u"], desc: "Go to Customers" },
      { keys: ["g", "s"], desc: "Go to Shipping" },
      { keys: ["g", "f"], desc: "Go to Finances" },
      { keys: ["g", "l"], desc: "Go to Listings" },
      { keys: ["?"], desc: "Show this reference" },
    ]
  },
  {
    category: "Within a list",
    items: [
      { keys: ["j", "/", "k"], desc: "Move selection down / up" },
      { keys: ["Enter"], desc: "Open selected" },
      { keys: ["x"], desc: "Toggle selection (multi-select)" },
      { keys: ["f"], desc: "Focus search" },
      { keys: ["r"], desc: "Refresh" },
    ]
  },
  {
    category: "In an open record",
    items: [
      { keys: ["e"], desc: "Edit" },
      { keys: ["⌘", "Enter"], desc: "Save" },
      { keys: ["Esc"], desc: "Close" },
    ]
  },
  {
    category: "In the command palette",
    items: [
      { keys: ["↑", "/", "↓"], desc: "Navigate" },
      { keys: ["Enter"], desc: "Execute" },
      { keys: ["Tab"], desc: "Move to next group" },
    ]
  }
];

export function KeyboardReference({ open, onClose }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-[#0E0F11]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8"
            onClick={onClose}
          >
            <motion.div
               initial={{ opacity: 0, scale: 0.95, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 10 }}
               transition={{ duration: 0.2 }}
               onClick={(e) => e.stopPropagation()}
               className="bg-bg-elevated/90 backdrop-blur-xl border border-border-subtle rounded-xl shadow-2xl w-full max-w-4xl max-h-full overflow-hidden flex flex-col"
            >
               <div className="flex items-center justify-between p-6 border-b border-border-subtle shrink-0">
                 <div>
                   <h2 className="text-xl font-semibold">Keyboard Shortcuts</h2>
                   <p className="text-sm text-text-secondary mt-2">Navigate and operate CEOS without a mouse.</p>
                 </div>
                 <button onClick={onClose} className="p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               
               <div className="p-6 overflow-y-auto w-full">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   {SHORTCUTS.map((section) => (
                     <div key={section.category}>
                       <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2 font-medium">{section.category}</h3>
                       <div className="space-y-2">
                         {section.items.map((item, idx) => (
                           <div key={idx} className="flex justify-between items-center text-sm py-2 border-b border-border-subtle/30 last:border-0 hover:bg-white/[0.02] -mx-2 px-2 rounded">
                             <span className="text-text-secondary">{item.desc}</span>
                             <div className="flex items-center gap-2 ml-4">
                               {item.keys.map((k, i) => (
                                 k === '/' ? <span key={i} className="text-text-tertiary">/</span> :
                                 <kbd key={i} className="min-w-[20px] inline-flex items-center justify-center px-2 py-2 rounded bg-bg-active border border-border-strong text-text-primary font-sans text-xs">
                                   {k}
                                 </kbd>
                               ))}
                             </div>
                           </div>
                         ))}
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
