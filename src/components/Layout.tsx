import { Outlet, NavLink, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  ShoppingCart,
  PackageSearch,
  Sprout,
  Flower2,
  Users,
  Truck,
  DollarSign,
  Receipt,
  PackageOpen,
  Store,
  FileSpreadsheet,
  FileBadge,
  ShieldCheck,
  UserCog,
  Repeat,
  UploadCloud,
  History,
  Settings,
  Bell,
  Search,
  ChevronRight,
  ChevronDown,
  Menu,
  List,
  CheckSquare,
  PieChart,
  TrendingUp,
  Car,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Input } from "./ui/Input";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationCenter } from "./ui/NotificationCenter";
import { TasksPanel } from "./ui/TasksPanel";
import { KeyboardReference } from "./ui/KeyboardReference";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
  { name: "Inventory", href: "/inventory", icon: PackageSearch },
  { name: "Propagation", href: "/propagation", icon: Sprout },
  { name: "Cultivars", href: "/cultivars", icon: Flower2 },
  { name: "Listings", href: "/listings", icon: List },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Shipping", href: "/shipping", icon: Truck },
];

const FINANCE_ITEMS = [
  { name: "Overview", href: "/finances", icon: PieChart },
  { name: "Expenses", href: "/finances/expenses", icon: Receipt },
  { name: "Revenue", href: "/finances/revenue", icon: TrendingUp },
  { name: "Subscriptions", href: "/finances/subscriptions", icon: Repeat },
  { name: "Supplies", href: "/finances/supplies", icon: PackageOpen },
  { name: "Production", href: "/finances/production", icon: PackageSearch },
  { name: "Vendors", href: "/finances/vendors", icon: Store },
  { name: "Mileage", href: "/finances/mileage", icon: Car },
  { name: "Reports", href: "/finances/tax-report", icon: FileSpreadsheet },
];

const MOBILE_NAV_ITEMS = [
  { name: "Home", href: "/", icon: LayoutDashboard },
  { name: "Inventory", href: "/inventory", icon: PackageSearch },
  { name: "Propagation", href: "/propagation", icon: Sprout },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
];

export function Layout() {
  const [financesOpen, setFinancesOpen] = useState(() => window.location.pathname.startsWith("/finances"));
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [keyboardRefOpen, setKeyboardRefOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { setCommandPaletteOpen, notifications, tasks, settings, addToast } = useApp();
  const { isAdmin, user, profileChecked, orgRole, activeOrgId, orgChecked, signOut } = useAuth();

  const canManage = orgRole === "owner" || orgRole === "manager";
  const isFinancesActive = location.pathname.startsWith("/finances");
  const unreadCount = notifications.filter(n => !n.read).length;
  const pendingTasksCount = tasks.filter(t => !t.completed).length;

  useEffect(() => {
    let lastKey = "";
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs/textareas
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement).isContentEditable) {
        return;
      }

      const now = Date.now();
      if (now - lastKeyTime > 1000) {
        lastKey = "";
      }

      if (e.key === '?') {
        e.preventDefault();
        setKeyboardRefOpen(true);
      } else if (e.key === '/' && e.metaKey) {
        e.preventDefault();
        setKeyboardRefOpen(true);
      } else if (e.key === 'k' && e.metaKey) {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (e.key === 'n' && e.metaKey) {
        e.preventDefault();
        addToast({ title: 'Quick Add Triggered', status: 'info' });
      } else if (e.key === 'g') {
        lastKey = 'g';
        lastKeyTime = now;
      } else if (lastKey === 'g') {
        switch (e.key) {
          case 'd': navigate('/'); break;
          case 'o': navigate('/orders'); break;
          case 'i': navigate('/inventory'); break;
          case 'p': navigate('/propagation'); break;
          case 'c': navigate('/cultivars'); break;
          case 'l': navigate('/listings'); break;
          case 'u': navigate('/customers'); break;
          case 's': navigate('/shipping'); break;
          case 'f': navigate('/finances'); break;
        }
        lastKey = "";
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, setCommandPaletteOpen, addToast]);

  const getBreadcrumb = () => {
    const path = location.pathname;
    if (path === "/") return "Dashboard";
    const parts = path.split("/").filter(Boolean);
    return parts.map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ")).join(" / ");
  };

  // Workspace gate — a signed-in user who belongs to no organization can't see
  // any shared data. New users land here until an admin adds them. (Must come
  // AFTER all hooks above so the hook count is stable between renders.)
  if (user && profileChecked && orgChecked && !activeOrgId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base p-6">
        <div className="max-w-sm text-center space-y-3">
          <div className="text-lg font-semibold text-text-primary">No workspace yet</div>
          <p className="text-sm text-text-secondary">
            Your account isn't part of a Canyon Exotics workspace. Ask an administrator to add you to the team, then
            sign out and back in.
          </p>
          <button
            onClick={async () => { await signOut(); navigate("/sign-in", { replace: true }); }}
            className="text-sm text-accent-brand hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      // h-dvh (not h-screen): iOS Safari's 100vh is taller than the visible
      // viewport when the URL bar shows, which clips the bottom of the app.
      "flex h-dvh bg-bg-base text-text-primary overflow-hidden",
      settings.density === 'compact' ? 'font-compact' : ''
    )}>
      {/* Sidebar - hidden on mobile and when printing */}
      <aside className="hidden md:flex w-[240px] flex-shrink-0 bg-bg-elevated backdrop-blur-xl border-r border-border-subtle flex-col z-20 no-print">
        <div className="p-6 pb-2">
          <div className="text-xl font-semibold tracking-tight h-8 flex items-center">
            <span>CEOS</span>
          </div>
          <div className="text-xs text-text-tertiary">Canyon Exotics</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-2 py-2 hover:bg-bg-hover rounded-md text-sm transition-colors",
                  isActive ? "bg-bg-active text-text-primary border-l-2 border-accent-brand rounded-l-none" : "text-text-secondary"
                )
              }
            >
              <item.icon className="w-5 h-5 opacity-70" strokeWidth={1.5} />
              {item.name}
            </NavLink>
          ))}

          {/* Finances — owners & managers only */}
          {canManage && (
          <div>
            <button
              onClick={() => { navigate("/finances"); setFinancesOpen(true); }}
              className={cn(
                "w-full flex items-center justify-between px-2 py-2 hover:bg-bg-hover rounded-md text-sm transition-colors mt-2",
                isFinancesActive ? "text-text-primary" : "text-text-secondary"
              )}
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 opacity-70" strokeWidth={1.5} />
                Finances
              </div>
              <span
                role="button"
                aria-label={financesOpen ? "Collapse Finances" : "Expand Finances"}
                onClick={(e) => { e.stopPropagation(); setFinancesOpen((o) => !o); }}
                className="p-1 -m-1 rounded hover:bg-bg-active"
              >
                <ChevronDown
                  className={cn("w-4 h-4 transition-transform", financesOpen ? "rotate-180" : "")}
                />
              </span>
            </button>
            {financesOpen && (
              <div className="mt-2 ml-6 pl-2 border-l border-border-subtle space-y-1">
                {FINANCE_ITEMS.map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    end={item.href === "/finances"}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 px-2 py-2 hover:bg-bg-hover rounded-md text-sm transition-colors relative",
                        isActive ? "text-text-primary bg-bg-active" : "text-text-secondary"
                      )
                    }
                  >
                    {({isActive}) => (
                      <>
                        {isActive && <div className="absolute left-[-17px] top-1/2 -translate-y-1/2 w-[2px] h-4 bg-accent-brand" />}
                        <item.icon className="w-4 h-4 opacity-70" strokeWidth={1.5} />
                        {item.name}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
          )}

          {canManage && (
          <NavLink
            to="/licenses"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-2 py-2 mt-2 hover:bg-bg-hover rounded-md text-sm transition-colors",
                isActive ? "bg-bg-active text-text-primary border-l-2 border-accent-brand rounded-l-none" : "text-text-secondary"
              )
            }
          >
            <FileBadge className="w-5 h-5 opacity-70" strokeWidth={1.5} />
            Licenses
          </NavLink>
          )}

          <NavLink
            to="/team"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-2 py-2 hover:bg-bg-hover rounded-md text-sm transition-colors",
                isActive ? "bg-bg-active text-text-primary border-l-2 border-accent-brand rounded-l-none" : "text-text-secondary"
              )
            }
          >
            <UserCog className="w-5 h-5 opacity-70" strokeWidth={1.5} />
            Team
          </NavLink>
          <NavLink
            to="/activity"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-2 py-2 hover:bg-bg-hover rounded-md text-sm transition-colors",
                isActive ? "bg-bg-active text-text-primary border-l-2 border-accent-brand rounded-l-none" : "text-text-secondary"
              )
            }
          >
            <History className="w-5 h-5 opacity-70" strokeWidth={1.5} />
            Activity
          </NavLink>
          {canManage && (
          <NavLink
            to="/import"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-2 py-2 hover:bg-bg-hover rounded-md text-sm transition-colors",
                isActive ? "bg-bg-active text-text-primary border-l-2 border-accent-brand rounded-l-none" : "text-text-secondary"
              )
            }
          >
            <UploadCloud className="w-5 h-5 opacity-70" strokeWidth={1.5} />
            Import
          </NavLink>
          )}
          {isAdmin && (
            <NavLink
              to="/admin/access-requests"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-2 py-2 hover:bg-bg-hover rounded-md text-sm transition-colors",
                  isActive ? "bg-bg-active text-text-primary border-l-2 border-accent-brand rounded-l-none" : "text-text-secondary",
                )
              }
            >
              <ShieldCheck className="w-5 h-5 opacity-70" strokeWidth={1.5} />
              Access Requests
            </NavLink>
          )}
        </nav>
        
        <div className="p-2 border-t border-border-subtle space-y-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-2 py-2 hover:bg-bg-hover rounded-md text-sm transition-colors mt-2",
                isActive ? "bg-bg-active text-text-primary border-l-2 border-accent-brand rounded-l-none" : "text-text-secondary"
              )
            }
          >
            <Settings className="w-5 h-5 opacity-70" strokeWidth={1.5} />
            Settings
          </NavLink>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-dvh relative">
        {/* Topbar - hidden when printing */}
        <header className="min-h-[56px] flex-shrink-0 pt-[env(safe-area-inset-top)] bg-bg-elevated backdrop-blur-md border-b border-border-subtle flex items-center px-4 md:px-6 justify-between z-10 no-print">
          <div className="flex items-center text-sm text-text-secondary truncate pr-4">
            {getBreadcrumb()}
          </div>
          <div className="hidden md:block flex-1 max-w-md mx-6">
            <div 
              className="relative group cursor-text"
              onClick={() => setCommandPaletteOpen(true)}
            >
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary group-hover:text-text-secondary transition-colors" />
              <div className="w-full pl-8 pr-2 py-2 bg-bg-base border border-border-subtle rounded-md text-sm text-text-tertiary flex items-center justify-between group-hover:border-border-strong transition-colors">
                <span>Search everywhere...</span>
                <kbd className="font-sans text-[10px] px-2 py-2 rounded bg-bg-elevated border border-border-subtle">⌘K</kbd>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-2 relative">
            <button className="md:hidden relative p-2.5 rounded-lg transition-colors text-text-secondary hover:text-text-primary active:bg-bg-hover" onClick={() => setCommandPaletteOpen(true)} aria-label="Search">
              <Search className="w-5 h-5" />
            </button>
            <button
              className={cn(
                "relative p-2.5 rounded-lg transition-colors active:bg-bg-hover",
                tasksOpen ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
              )}
              onClick={() => {
                 setTasksOpen(!tasksOpen);
                 if (notificationsOpen) setNotificationsOpen(false);
              }}
            >
              <CheckSquare className="w-5 h-5" strokeWidth={1.5} />
              {pendingTasksCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-accent-brand rounded-full border border-bg-base shadow-sm"></span>
              )}
            </button>
            <TasksPanel open={tasksOpen} onClose={() => setTasksOpen(false)} />

            <button
              className={cn(
                "relative p-2.5 rounded-lg transition-colors active:bg-bg-hover",
                notificationsOpen ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
              )}
              onClick={() => {
                 setNotificationsOpen(!notificationsOpen);
                 if (tasksOpen) setTasksOpen(false);
              }}
            >
              <Bell className="w-5 h-5" strokeWidth={1.5} />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-status-info rounded-full border border-bg-base shadow-sm"></span>
              )}
            </button>
            <NotificationCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
            <NavLink
              to="/settings"
              title={user?.email ?? undefined}
              className="hidden md:flex w-8 h-8 rounded bg-bg-active items-center justify-center border border-border-subtle font-medium text-sm text-text-primary select-none cursor-pointer hover:bg-bg-hover transition-colors uppercase"
            >
              {(user?.email ?? "?").slice(0, 2)}
            </NavLink>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto relative z-0 pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
          <Outlet />
        </main>

        {/* Mobile Bottom Nav — extends under the iPhone home indicator */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-[calc(64px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-bg-elevated backdrop-blur-xl border-t border-border-subtle flex justify-around items-center z-40 no-print">
          {MOBILE_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center w-full h-full text-[10px] gap-2 transition-colors",
                  isActive ? "text-accent-brand" : "text-text-secondary hover:text-text-primary"
                )
              }
            >
              <item.icon className="w-5 h-5" strokeWidth={1.5} />
              {item.name}
            </NavLink>
          ))}
          <button 
            className={cn(
              "flex flex-col items-center justify-center w-full h-full text-[10px] gap-2 text-text-secondary hover:text-text-primary transition-colors",
              mobileMenuOpen && "text-text-primary"
            )}
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="w-5 h-5" strokeWidth={1.5} />
            More
          </button>
        </div>

        <KeyboardReference open={keyboardRefOpen} onClose={() => setKeyboardRefOpen(false)} />

        {/* Mobile More Sheet */}
        {mobileMenuOpen && (
          <>
            <div className="md:hidden fixed inset-0 bg-[#0E0F11]/80 backdrop-blur-sm z-50 transition-opacity" onClick={() => setMobileMenuOpen(false)} />
            <div className="md:hidden fixed bottom-0 left-0 right-0 max-h-[80dvh] overflow-y-auto bg-bg-base/95 backdrop-blur-md border-t border-border-subtle rounded-t-2xl z-50 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] flex flex-col gap-6 slide-in-from-bottom-full animate-in duration-200 ease-out">
               <div>
                  <h3 className="text-xs uppercase tracking-wide text-text-tertiary mb-2">Management</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/cultivars" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Flower2 className="w-4 h-4 text-text-secondary"/> Cultivars</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/listings" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><List className="w-4 h-4 text-text-secondary"/> Listings</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/customers" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Users className="w-4 h-4 text-text-secondary"/> Customers</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/shipping" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Truck className="w-4 h-4 text-text-secondary"/> Shipping</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/finances/production" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Sprout className="w-4 h-4 text-text-secondary"/> Production</NavLink>
                  </div>
               </div>
               <div>
                  <h3 className="text-xs uppercase tracking-wide text-text-tertiary mb-2">Finances & Audit</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/finances" end className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><PieChart className="w-4 h-4 text-text-secondary"/> Overview</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/finances/expenses" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Receipt className="w-4 h-4 text-text-secondary"/> Expenses</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/finances/supplies" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><PackageOpen className="w-4 h-4 text-text-secondary"/> Supplies</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/finances/vendors" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Store className="w-4 h-4 text-text-secondary"/> Vendors</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/finances/subscriptions" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Repeat className="w-4 h-4 text-text-secondary"/> Subscriptions</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/finances/tax-report" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><FileSpreadsheet className="w-4 h-4 text-text-secondary"/> Tax Report</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/licenses" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><FileBadge className="w-4 h-4 text-text-secondary"/> Licenses</NavLink>
                  </div>
               </div>
               <div>
                  <h3 className="text-xs uppercase tracking-wide text-text-tertiary mb-2">Workspace</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/activity" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><History className="w-4 h-4 text-text-secondary"/> Activity</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/import" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><UploadCloud className="w-4 h-4 text-text-secondary"/> Import</NavLink>
                    {isAdmin && <NavLink onClick={() => setMobileMenuOpen(false)} to="/team" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><UserCog className="w-4 h-4 text-text-secondary"/> Team</NavLink>}
                    {isAdmin && <NavLink onClick={() => setMobileMenuOpen(false)} to="/admin/access-requests" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><ShieldCheck className="w-4 h-4 text-text-secondary"/> Access</NavLink>}
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/settings" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Settings className="w-4 h-4 text-text-secondary"/> Settings</NavLink>
                  </div>
               </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
