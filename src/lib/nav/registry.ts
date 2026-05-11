/**
 * Central registry of everything the navigation shell knows about:
 *   - routes (destinations)
 *   - actions (verbs the user can invoke)
 *   - sections (sidebar groupings)
 *   - shortcuts (keybindings)
 *
 * The Sidebar, Topbar, CommandPalette, and ShortcutOverlay all read from here.
 * Adding a new destination means adding one entry — no edits in three places.
 */

import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, ShoppingCart, PackageSearch, PackageOpen, Sprout, Flower2,
  Users, Truck, List, Receipt, Store, FileSpreadsheet, FileBadge, History,
  Settings, Bot, BarChart3, Printer, QrCode, GitBranch, TrendingUp,
  ClipboardList, Calendar,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SectionId =
  | 'operations'
  | 'inventory'
  | 'orders'
  | 'agents'
  | 'reports'
  | 'settings';

export type Route = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  section: SectionId;
  /** g-prefix mnemonic, e.g. `o` for `g o → orders`. */
  goto?: string;
  /** Synonyms boost palette fuzzy match. */
  keywords?: string[];
  /** Hidden from sidebar but reachable via palette/URL. */
  paletteOnly?: boolean;
};

export type Action = {
  id: string;
  label: string;
  /** When run from the palette. Receives the parsed argument string. */
  run: (ctx: ActionContext, arg?: string) => void | Promise<void>;
  icon?: LucideIcon;
  /** Section header in the palette. */
  group: 'navigation' | 'create' | 'agents' | 'system' | 'recent';
  keywords?: string[];
  /** If true, palette enters argument mode after selection. */
  takesArgument?: boolean;
  argumentPlaceholder?: string;
};

export type ActionContext = {
  navigate: (path: string) => void;
  toast: (title: string, status?: 'ok' | 'info' | 'warn' | 'alert') => void;
  setTheme?: (mode: 'light' | 'dark') => void;
};

export type Shortcut = {
  id: string;
  /** Display form, e.g. "⌘K", "g i", "?". */
  display: string;
  /** Keys as they arrive from KeyboardEvent: ["meta", "k"] or ["g", "i"]. */
  keys: string[];
  /** Sequence shortcuts ("g i") if true; otherwise single combo. */
  sequence?: boolean;
  description: string;
  group: 'global' | 'navigation' | 'table' | 'record';
};

// ─────────────────────────────────────────────────────────────────────────────
// Workspaces (placeholder — multi-tenant hook)
// ─────────────────────────────────────────────────────────────────────────────

export type Workspace = {
  id: string;
  name: string;
  short: string;
  /** Hex from brand palette (Canyon, Cream, Tan, or neutral). */
  swatch: string;
};

export const workspaces: Workspace[] = [
  { id: 'canyon-exotics', name: 'Canyon Exotics', short: 'CE', swatch: '#1A2E28' },
  { id: 'aeda',           name: 'AEDA',           short: 'AE', swatch: '#9A7B5B' },
  { id: 'rosette-admin',  name: 'Rosette Admin',  short: 'RA', swatch: '#5C6066' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────────────────

export const sections: Record<SectionId, { label: string; order: number }> = {
  operations: { label: 'Operations', order: 1 },
  inventory:  { label: 'Inventory',  order: 2 },
  orders:     { label: 'Orders',     order: 3 },
  agents:     { label: 'Agents',     order: 4 },
  reports:    { label: 'Reports',    order: 5 },
  settings:   { label: 'Settings',   order: 6 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

export const routes: Route[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/', icon: LayoutDashboard, section: 'operations', goto: 'd', keywords: ['home'] },

  { id: 'orders',      label: 'Orders',       href: '/orders',       icon: ShoppingCart, section: 'orders', goto: 'o' },
  { id: 'shipping',    label: 'Shipping',     href: '/shipping',     icon: Truck,        section: 'orders', goto: 's' },
  { id: 'print-queue', label: 'Print Queue',  href: '/shipping/print-queue', icon: Printer, section: 'orders', keywords: ['labels'] },
  { id: 'listings',    label: 'Listings',     href: '/listings',     icon: List,         section: 'orders', goto: 'l' },
  { id: 'customers',   label: 'Customers',    href: '/customers',    icon: Users,        section: 'orders', goto: 'u' },

  { id: 'inventory',   label: 'Inventory',    href: '/inventory',    icon: PackageSearch, section: 'inventory', goto: 'i' },
  { id: 'receiving',   label: 'Receiving',    href: '/receiving',    icon: PackageOpen,   section: 'inventory' },
  { id: 'propagation', label: 'Propagation',  href: '/propagation',  icon: Sprout,        section: 'inventory', goto: 'p' },
  { id: 'cultivars',   label: 'Cultivars',    href: '/cultivars',    icon: Flower2,       section: 'inventory', goto: 'c' },
  { id: 'breeding',    label: 'Breeding Tracker', href: '/cultivars/breeding', icon: GitBranch, section: 'inventory' },
  { id: 'qr-codes',    label: 'QR Codes',     href: '/inventory/qr-codes', icon: QrCode, section: 'inventory' },

  { id: 'agents-inbox', label: 'Agent Inbox',  href: '/agents',         icon: ClipboardList, section: 'agents', goto: 'i', paletteOnly: true, keywords: ['inbox', 'reports', 'bugs', 'tickets'] },
  { id: 'agents-runs',  label: 'Agent Runs',   href: '/agents/runs',    icon: Bot,           section: 'agents', goto: 'a', paletteOnly: true, keywords: ['claude', 'runs'] },

  { id: 'cultivar-profit', label: 'Cultivar Profit', href: '/cultivars/profit', icon: TrendingUp, section: 'reports' },
  { id: 'qr-analytics',    label: 'QR Analytics',     href: '/inventory/qr-codes/analytics', icon: BarChart3, section: 'reports' },
  { id: 'tax-report',      label: 'Tax Report',       href: '/finances/tax-report', icon: FileSpreadsheet, section: 'reports', goto: 'r', keywords: ['taxes', 'p&l', 'profit', 'loss', 'income statement', 'schedule c'] },
  { id: 'year-end',        label: 'Year-End Snapshot', href: '/finances/tax-report/year-end', icon: Calendar, section: 'reports', keywords: ['closed period', 'historical', 'archive'] },
  { id: 'form-1099k',      label: '1099-K Reconciliation', href: '/finances/tax-report/1099k', icon: FileSpreadsheet, section: 'reports', paletteOnly: true, keywords: ['1099', '1099-k', 'etsy gross', 'shopify gross', 'payment processor'] },
  { id: 'assets',          label: 'Assets & Depreciation', href: '/finances/assets', icon: BarChart3, section: 'reports', keywords: ['depreciation', 'capitalize', 'fixed assets', 'equipment'] },
  { id: 'expenses',        label: 'Expenses', href: '/finances/expenses', icon: Receipt, section: 'reports', goto: 'f', keywords: ['spending', 'receipts', 'deductions', 'ledger', 'transactions'] },
  { id: 'supplies',        label: 'Supplies', href: '/finances/supplies', icon: PackageOpen, section: 'reports', keywords: ['inventory', 'reorder', 'stock', 'pots', 'media'] },
  { id: 'vendors',         label: 'Vendors',  href: '/finances/vendors',  icon: Store,    section: 'reports', keywords: ['suppliers', 'merchants', 'payees'] },
  { id: 'licenses',        label: 'Licenses', href: '/licenses', icon: FileBadge, section: 'reports' },
  { id: 'audit-log',       label: 'Audit Log', href: '/audit', icon: History, section: 'reports', keywords: ['history', 'changelog', 'who changed'] },

  { id: 'settings', label: 'Settings', href: '/settings', icon: Settings, section: 'settings' },
];

export function routeById(id: string) { return routes.find(r => r.id === id); }
export function routeByHref(href: string) { return routes.find(r => r.href === href); }

/** For palette fuzzy index. */
export function routesAsCommands(): Action[] {
  return routes.map(r => ({
    id: `route:${r.id}`,
    label: `Go to ${r.label}`,
    icon: r.icon,
    group: 'navigation',
    keywords: [r.label.toLowerCase(), ...(r.keywords ?? [])],
    run: (ctx) => ctx.navigate(r.href),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions (verbs)
// ─────────────────────────────────────────────────────────────────────────────

export const actions: Action[] = [
  {
    id: 'create.order',
    label: 'Create order',
    group: 'create',
    keywords: ['new order', 'add'],
    run: (ctx) => { ctx.navigate('/orders'); ctx.toast('Create order', 'info'); },
  },
  {
    id: 'create.bug-report',
    label: 'Create bug report',
    group: 'create',
    keywords: ['report bug', 'new bug', 'issue'],
    run: (ctx) => ctx.toast('New bug report drafted', 'info'),
  },
  {
    id: 'create.expense',
    label: 'Log a new expense',
    group: 'create',
    keywords: ['expense', 'receipt', 'spend', 'add expense'],
    run: (ctx) => { ctx.navigate('/finances/expenses'); ctx.toast('Open the New expense modal at the top right', 'info'); },
  },
  {
    id: 'finance.drill.expenses',
    label: 'Drill into expenses by GL account',
    group: 'navigation',
    keywords: ['filter expenses', 'account', 'GL', 'category', 'schedule c'],
    takesArgument: true,
    argumentPlaceholder: '4-digit GL code (e.g. 6170 for shipping)…',
    run: (ctx, arg) => {
      const code = (arg ?? '').trim();
      if (!/^\d{4}$/.test(code)) { ctx.toast('Enter a 4-digit GL code', 'warn'); return; }
      ctx.navigate(`/finances/expenses?account=${code}`);
    },
  },
  {
    id: 'agent.run',
    label: 'Trigger Claude on report',
    group: 'agents',
    keywords: ['claude', 'run agent', 'analyze'],
    takesArgument: true,
    argumentPlaceholder: 'report ID (e.g. BR-1284)…',
    run: (ctx, arg) => ctx.toast(`Triggered Claude on ${arg ?? '(no ID)'}`, 'ok'),
  },
  {
    id: 'agent.approve',
    label: 'Approve agent feature',
    group: 'agents',
    keywords: ['approve', 'sign off', 'merge'],
    takesArgument: true,
    argumentPlaceholder: 'run ID…',
    run: (ctx, arg) => ctx.toast(`Approved ${arg ?? 'run'}`, 'ok'),
  },
  {
    id: 'theme.toggle',
    label: 'Switch to dark mode',
    group: 'system',
    keywords: ['theme', 'dark', 'light', 'appearance'],
    run: (ctx) => ctx.setTheme?.('dark'),
  },
  {
    id: 'theme.light',
    label: 'Switch to light mode',
    group: 'system',
    keywords: ['theme', 'light'],
    run: (ctx) => ctx.setTheme?.('light'),
  },
  {
    id: 'shortcuts.show',
    label: 'Show keyboard shortcuts',
    group: 'system',
    keywords: ['help', 'shortcuts', '?'],
    run: (_ctx) => window.dispatchEvent(new CustomEvent('shortcuts:show')),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Shortcuts (for the ? overlay)
// ─────────────────────────────────────────────────────────────────────────────

export const shortcuts: Shortcut[] = [
  // Global
  { id: 'palette',  display: '⌘K',  keys: ['meta', 'k'],     description: 'Open command palette',    group: 'global' },
  { id: 'sidebar',  display: '⌘\\', keys: ['meta', '\\'],    description: 'Toggle sidebar',          group: 'global' },
  { id: 'help',     display: '?',   keys: ['?'],             description: 'Show shortcuts',          group: 'global' },
  { id: 'escape',   display: 'esc', keys: ['Escape'],        description: 'Close modal / drawer',    group: 'global' },

  // Navigation
  { id: 'go.inbox',   display: 'g i', keys: ['g','i'], sequence: true, description: 'Go to agent inbox', group: 'navigation' },
  { id: 'go.agents',  display: 'g a', keys: ['g','a'], sequence: true, description: 'Go to agent runs',  group: 'navigation' },
  { id: 'go.orders',  display: 'g o', keys: ['g','o'], sequence: true, description: 'Go to orders',      group: 'navigation' },
  { id: 'go.reports', display: 'g r', keys: ['g','r'], sequence: true, description: 'Go to reports',     group: 'navigation' },
  { id: 'go.cultivars', display: 'g c', keys: ['g','c'], sequence: true, description: 'Go to cultivars', group: 'navigation' },
  { id: 'go.propagation', display: 'g p', keys: ['g','p'], sequence: true, description: 'Go to propagation', group: 'navigation' },
  { id: 'go.customers', display: 'g u', keys: ['g','u'], sequence: true, description: 'Go to customers', group: 'navigation' },
  { id: 'go.inventory', display: 'g v', keys: ['g','v'], sequence: true, description: 'Go to inventory', group: 'navigation' },
  { id: 'go.settings',  display: 'g s', keys: ['g','s'], sequence: true, description: 'Go to settings', group: 'navigation' },

  // Table
  { id: 'find',     display: '⌘F', keys: ['meta','f'], description: 'Focus search',           group: 'table' },
  { id: 'select-all', display: '⌘A', keys: ['meta','a'], description: 'Select all visible rows', group: 'table' },
  { id: 'arrow',    display: '↑ ↓', keys: ['ArrowDown'], description: 'Move row focus', group: 'table' },
  { id: 'open',     display: '↵',  keys: ['Enter'], description: 'Open focused row in drawer', group: 'table' },
  { id: 'toggle',   display: 'x',  keys: ['x'], description: 'Toggle row selection', group: 'table' },

  // Record drawer
  { id: 'next',     display: 'j',  keys: ['j'], description: 'Next record',  group: 'record' },
  { id: 'prev',     display: 'k',  keys: ['k'], description: 'Previous record', group: 'record' },
  { id: 'edit',     display: 'e',  keys: ['e'], description: 'Edit primary field', group: 'record' },
];

export function shortcutsByGroup() {
  const out: Record<Shortcut['group'], Shortcut[]> = {
    global: [], navigation: [], table: [], record: [],
  };
  for (const s of shortcuts) out[s.group].push(s);
  return out;
}
