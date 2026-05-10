import { NavLink, useLocation } from 'react-router';
import { useState } from 'react';
import { Search, Bell, ChevronDown, ChevronsLeft, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { routes, sections, workspaces, type SectionId } from '@/lib/nav/registry';
import { Tooltip } from '@/components/ui/Tooltip';

const SECTION_ORDER: SectionId[] = ['operations', 'inventory', 'orders', 'agents', 'reports', 'settings'];
// "Operations" is a virtual section that pulls in the dashboard.
const SECTION_MAP: Record<SectionId, SectionId> = {
  operations: 'operations', inventory: 'inventory', orders: 'orders',
  agents: 'agents', reports: 'reports', settings: 'settings',
};

type SidebarProps = {
  collapsed: boolean;
  onCollapseToggle: () => void;
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
};

export function Sidebar({ collapsed, onCollapseToggle, onOpenPalette }: SidebarProps) {
  const location = useLocation();
  const { notifications } = useApp();
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    operations: true, inventory: true, orders: true,
    agents: true, reports: false, settings: false,
  });
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState(workspaces[0]);
  const unread = notifications.filter(n => !n.read).length;

  const grouped = SECTION_ORDER.map(id => ({
    id,
    label: sections[id].label,
    items: routes.filter(r => SECTION_MAP[r.section] === id && !r.paletteOnly),
  })).filter(g => g.items.length > 0);

  const width = collapsed ? 'w-[56px]' : 'w-[240px]';

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col flex-shrink-0 bg-bg-elevated border-r border-border-subtle z-20 no-print',
        'transition-[width] duration-[160ms] ease-[cubic-bezier(0.2,0,0.2,1)]',
        width,
      )}
      aria-label="Primary navigation"
    >
      {/* Workspace switcher */}
      <div className="h-14 px-2 flex items-center border-b border-border-subtle relative">
        <button
          onClick={() => setWorkspaceMenuOpen(v => !v)}
          className={cn(
            'flex items-center gap-2 w-full h-10 px-2 rounded-md text-sm text-text-primary hover:bg-bg-hover',
            'transition-colors duration-[120ms]',
          )}
          aria-haspopup="menu"
          aria-expanded={workspaceMenuOpen}
        >
          <span
            className="w-6 h-6 rounded flex items-center justify-center text-[11px] font-semibold text-bg-base flex-shrink-0"
            style={{ background: activeWorkspace.swatch, color: '#F5F0E8' }}
            aria-hidden
          >
            {activeWorkspace.short}
          </span>
          {!collapsed && (
            <>
              <span className="truncate">{activeWorkspace.name}</span>
              <ChevronDown className="w-4 h-4 ml-auto text-text-tertiary" />
            </>
          )}
        </button>
        {workspaceMenuOpen && (
          <div
            role="menu"
            className="absolute left-2 right-2 top-full mt-1 z-30 bg-bg-elevated border border-border-subtle rounded-md shadow-2xl py-1"
          >
            {workspaces.map(w => (
              <button
                key={w.id}
                role="menuitem"
                onClick={() => { setActiveWorkspace(w); setWorkspaceMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-2 py-2 text-sm text-text-primary hover:bg-bg-hover"
              >
                <span className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-semibold flex-shrink-0" style={{ background: w.swatch, color: '#F5F0E8' }}>{w.short}</span>
                <span className="flex-1 text-left truncate">{w.name}</span>
                {w.id === activeWorkspace.id && <Check className="w-4 h-4 text-accent-brand" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-3" aria-label="Sections">
        {grouped.map(group => (
          <div key={group.id}>
            {!collapsed && (
              <button
                onClick={() => setOpenSections(s => ({ ...s, [group.id]: !s[group.id] }))}
                className="w-full px-2 py-1 flex items-center justify-between text-[11px] font-medium text-text-tertiary uppercase tracking-wider hover:text-text-secondary"
                aria-expanded={openSections[group.id]}
              >
                <span>{group.label}</span>
                <ChevronDown
                  className={cn('w-3 h-3 transition-transform duration-[160ms]',
                    openSections[group.id] ? '' : '-rotate-90')}
                />
              </button>
            )}
            {(collapsed || openSections[group.id]) && (
              <div className="mt-1 space-y-px">
                {group.items.map(item => (
                  <NavItem key={item.id} item={item} collapsed={collapsed} pathname={location.pathname} />
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Persistent bottom row */}
      <div className="border-t border-border-subtle p-2 space-y-px">
        <Tooltip label="Search (⌘K)" side="right" disabled={!collapsed}>
          <button
            onClick={onOpenPalette}
            className={cn(
              'w-full h-8 flex items-center gap-2 px-2 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover',
              'transition-colors duration-[120ms]',
            )}
            aria-label="Open command palette"
          >
            <Search className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Search</span>
                <kbd className="text-[11px] px-1.5 py-0.5 rounded bg-bg-active border border-border-subtle text-text-tertiary">⌘K</kbd>
              </>
            )}
          </button>
        </Tooltip>

        <Tooltip label="Notifications" side="right" disabled={!collapsed}>
          <NavLink
            to="/notifications"
            className={({ isActive }) => cn(
              'w-full h-8 flex items-center gap-2 px-2 rounded-md text-sm hover:bg-bg-hover relative',
              'transition-colors duration-[120ms]',
              isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
            )}
            aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          >
            <Bell className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            {!collapsed && <span className="flex-1 text-left">Notifications</span>}
            {unread > 0 && (
              <span className={cn(
                'rounded-full bg-accent-brand text-bg-base text-[11px] font-medium px-1.5',
                collapsed ? 'absolute top-1 right-1 w-2 h-2 p-0' : 'min-w-[18px] h-[18px] flex items-center justify-center',
              )} aria-hidden>
                {!collapsed && unread}
              </span>
            )}
          </NavLink>
        </Tooltip>

        <Tooltip label="Collapse sidebar (⌘\)" side="right" disabled={!collapsed}>
          <button
            onClick={onCollapseToggle}
            className={cn(
              'w-full h-8 flex items-center gap-2 px-2 rounded-md text-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-hover',
              'transition-colors duration-[120ms]',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronsLeft
              className={cn('w-4 h-4 transition-transform duration-[160ms]', collapsed && 'rotate-180')}
              strokeWidth={1.5}
            />
            {!collapsed && <span className="text-[11px] text-text-tertiary">Collapse</span>}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}

function NavItem({ item, collapsed, pathname }: {
  item: (typeof routes)[number];
  collapsed: boolean;
  pathname: string;
}) {
  const Icon = item.icon;
  const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

  return (
    <Tooltip label={item.label} side="right" disabled={!collapsed}>
      <NavLink
        to={item.href}
        end={item.href === '/'}
        className={cn(
          'group h-8 flex items-center gap-2 pr-2 rounded-md text-sm relative',
          'transition-colors duration-[120ms]',
          isActive
            ? 'text-text-primary bg-bg-active'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
          collapsed ? 'pl-2 justify-center' : 'pl-3',
        )}
        aria-current={isActive ? 'page' : undefined}
      >
        {isActive && (
          <span
            aria-hidden
            className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r"
            style={{ background: 'var(--color-accent-brand)' }}
          />
        )}
        <Icon className="w-4 h-4 flex-shrink-0 opacity-80" strokeWidth={1.5} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </NavLink>
    </Tooltip>
  );
}
