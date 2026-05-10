import { Outlet, useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { Sidebar } from './nav/Sidebar';
import { Topbar } from './nav/Topbar';
import { CommandPalette } from './nav/CommandPalette';
import { ShortcutOverlay } from './nav/ShortcutOverlay';
import { useShortcuts } from '@/hooks/useShortcut';
import { shortcuts as registryShortcuts } from '@/lib/nav/registry';

const SIDEBAR_KEY = 'ce-os.sidebar.collapsed';

const GOTO_MAP: Record<string, string> = {
  'go.inbox': '/agents',
  'go.agents': '/agents/runs',
  'go.orders': '/orders',
  'go.reports': '/finances/tax-report',
  'go.cultivars': '/cultivars',
  'go.propagation': '/propagation',
  'go.customers': '/customers',
  'go.inventory': '/inventory',
  'go.settings': '/settings',
};

export function Layout() {
  const navigate = useNavigate();
  const { isCommandPaletteOpen, setCommandPaletteOpen, settings } = useApp();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0'); } catch { /* */ }
  }, [collapsed]);

  // Bind every registered shortcut. The palette and shortcut overlay also
  // own their own esc/⌘K handling; this is the global wiring.
  useShortcuts([
    {
      keys: ['meta', 'k'],
      allowInEditable: true,
      handler: (e) => { e.preventDefault(); setCommandPaletteOpen(!isCommandPaletteOpen); },
    },
    {
      keys: ['meta', '\\'],
      handler: (e) => { e.preventDefault(); setCollapsed(c => !c); },
    },
    {
      keys: ['?'],
      handler: (e) => { e.preventDefault(); setShortcutsOpen(v => !v); },
    },
    {
      keys: ['Escape'],
      allowInEditable: false,
      handler: () => { setShortcutsOpen(false); /* drawers/modals own their own esc */ },
    },
    // Sequence shortcuts
    ...registryShortcuts
      .filter(s => s.sequence)
      .map(s => ({
        keys: s.keys,
        sequence: true,
        handler: () => {
          const path = GOTO_MAP[s.id];
          if (path) navigate(path);
        },
      })),
  ], [isCommandPaletteOpen]);

  // External request to open shortcut overlay (palette command).
  useEffect(() => {
    const onShow = () => setShortcutsOpen(true);
    window.addEventListener('shortcuts:show', onShow);
    return () => window.removeEventListener('shortcuts:show', onShow);
  }, []);

  return (
    <div
      className={cn(
        'flex h-screen bg-bg-base text-text-primary overflow-hidden',
        settings.density === 'compact' && 'font-compact',
      )}
    >
      <Sidebar
        collapsed={collapsed}
        onCollapseToggle={() => setCollapsed(c => !c)}
        onOpenPalette={() => setCommandPaletteOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-screen relative">
        <Topbar />
        <main className="flex-1 overflow-auto relative z-0" id="main-content">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
      <ShortcutOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
