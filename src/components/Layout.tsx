import { Outlet, NavLink, Navigate, useLocation, useNavigate } from "react-router";
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
  History,
  Settings,
  Bell,
  Search,
  ChevronRight,
  ChevronDown,
  Clock,
  Menu,
  List,
  CheckSquare,
  LogOut,
  FileUp,
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
  { name: "Import", href: "/orders/import", icon: FileUp },
  { name: "Inventory", href: "/inventory", icon: PackageSearch },
  { name: "Propagation", href: "/propagation", icon: Sprout },
  { name: "Cultivars", href: "/cultivars", icon: Flower2 },
  { name: "Listings", href: "/listings", icon: List },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Shipping", href: "/shipping", icon: Truck },
];

const FINANCE_ITEMS = [
  { name: "Expenses", href: "/finances/expenses", icon: Receipt },
  { name: "Supplies", href: "/finances/supplies", icon: PackageOpen },
  { name: "Vendors", href: "/finances/vendors", icon: Store },
  { name: "Tax Report", href: "/finances/tax-report", icon: FileSpreadsheet },
];

const MOBILE_NAV_ITEMS = [
  { name: "Home", href: "/", icon: LayoutDashboard },
  { name: "Inventory", href: "/inventory", icon: PackageSearch },
  { name: "Propagation", href: "/propagation", icon: Sprout },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
];

export function Layout() {
  const [financesOpen, setFinancesOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [keyboardRefOpen, setKeyboardRefOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { setCommandPaletteOpen, notifications, tasks, settings, addToast } = useApp();
  const { isAdmin, user, onboardedAt, profileChecked, signOut } = useAuth();

  const accountInitials = (user?.email ?? "")
    .split("@")[0]
    .split(/[.\-_]/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "CE";

  const handleSignOut = async () => {
    setAccountMenuOpen(false);
    await signOut();
    navigate("/sign-in", { replace: true });
  };

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
          case 'f': navigate('/finances/expenses'); break;
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

  // First-login onboarding gate — must come AFTER all hooks above so we don't
  // change the hook count between renders. Unauthed users are already handled
  // by RequireAuth.
  if (user && profileChecked && !onboardedAt) {
    return <Navigate to="/welcome" replace />;
  }

  return (
    <div className={cn(
      "flex h-screen bg-bg-base text-text-primary overflow-hidden",
      settings.density === 'compact' ? 'font-compact' : '' 
    )}>
      {/* Sidebar - hidden on mobile and when printing */}
      <aside className="hidden md:flex w-[240px] flex-shrink-0 bg-bg-elevated backdrop-blur-xl border-r border-border-subtle flex-col z-20 no-print">
        <div className="p-6 pb-2">
          <div className="h-8 flex items-center justify-between">
            <span className="text-xl font-semibold tracking-[-0.02em]">CEOS</span>
            <span className="text-[10px] font-medium tracking-wide px-1.5 py-0.5 rounded bg-status-info/20 text-status-info">
              DEMO
            </span>
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

          {/* Finances Expandable */}
          <div>
            <button
              onClick={() => setFinancesOpen(!financesOpen)}
              className={cn(
                "w-full flex items-center justify-between px-2 py-2 hover:bg-bg-hover rounded-md text-sm transition-colors mt-2",
                isFinancesActive ? "text-text-primary" : "text-text-secondary"
              )}
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 opacity-70" strokeWidth={1.5} />
                Finances
              </div>
              <ChevronDown
                className={cn("w-4 h-4 transition-transform", financesOpen ? "rotate-180" : "")}
              />
            </button>
            {financesOpen && (
              <div className="mt-2 ml-6 pl-2 border-l border-border-subtle space-y-1">
                {FINANCE_ITEMS.map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
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
          <div className="mb-2 px-2">
             <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-2 flex items-center gap-2">
               <Clock className="w-3 h-3" /> Recent
             </div>
             <div className="space-y-1">
                <span className="text-xs text-text-tertiary block py-2">No recent items</span>
             </div>
          </div>
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
      <div className="flex-1 flex flex-col min-w-0 h-screen relative">
        {/* Topbar - hidden when printing */}
        <header className="h-[56px] flex-shrink-0 bg-bg-elevated backdrop-blur-md border-b border-border-subtle flex items-center px-4 md:px-6 justify-between z-10 no-print">
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
                <kbd className="font-sans text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated border border-border-subtle text-text-secondary">⌘K</kbd>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 relative">
            <button className="md:hidden relative transition-colors text-text-secondary hover:text-text-primary" onClick={() => setCommandPaletteOpen(true)}>
              <Search className="w-5 h-5" />
            </button>
            <button 
              className={cn(
                "relative transition-colors", 
                tasksOpen ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
              )}
              onClick={() => {
                 setTasksOpen(!tasksOpen);
                 if (notificationsOpen) setNotificationsOpen(false);
              }}
            >
              <CheckSquare className="w-5 h-5" strokeWidth={1.5} />
              {pendingTasksCount > 0 && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-accent-brand rounded-full border border-bg-base shadow-sm"></span>
              )}
            </button>
            <TasksPanel open={tasksOpen} onClose={() => setTasksOpen(false)} />
            
            <button 
              className={cn(
                "relative transition-colors", 
                notificationsOpen ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
              )}
              onClick={() => {
                 setNotificationsOpen(!notificationsOpen);
                 if (tasksOpen) setTasksOpen(false);
              }}
            >
              <Bell className="w-5 h-5" strokeWidth={1.5} />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-status-info rounded-full border border-bg-base shadow-sm"></span>
              )}
            </button>
            <NotificationCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
            <div className="relative hidden md:block">
              <button
                onClick={() => setAccountMenuOpen((o) => !o)}
                className="w-9 h-9 rounded-full bg-bg-active flex items-center justify-center border border-border-subtle font-medium text-xs text-text-primary select-none cursor-pointer hover:bg-bg-hover transition-colors"
                aria-label="Account menu"
              >
                {accountInitials}
              </button>
              {accountMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAccountMenuOpen(false)} />
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[200px] bg-bg-elevated backdrop-blur-md border border-border-subtle rounded-[10px] shadow-2xl p-1">
                    <div className="px-3 py-2 border-b border-border-subtle text-xs text-text-tertiary truncate">
                      {user?.email ?? "Signed in"}
                    </div>
                    <NavLink
                      to="/settings"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-2 px-2 py-2 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                    >
                      <Settings className="w-4 h-4" strokeWidth={1.5} /> Settings
                    </NavLink>
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                    >
                      <LogOut className="w-4 h-4" strokeWidth={1.5} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto relative z-0 pb-16 md:pb-0">
          <Outlet />
        </main>

        {/* Mobile Bottom Nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-[64px] bg-bg-elevated backdrop-blur-xl border-t border-border-subtle flex justify-around items-center z-40 no-print">
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
            <div className="md:hidden fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 transition-opacity" onClick={() => setMobileMenuOpen(false)} />
            <div className="md:hidden fixed bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto bg-bg-base/95 backdrop-blur-md border-t border-border-subtle rounded-t-2xl z-50 p-6 flex flex-col gap-6 slide-in-from-bottom-full animate-in duration-200 ease-out">
               <div>
                  <h3 className="text-xs uppercase tracking-wide text-text-tertiary mb-2">Management</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/cultivars" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Flower2 className="w-4 h-4 text-text-secondary"/> Cultivars</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/customers" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Users className="w-4 h-4 text-text-secondary"/> Customers</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/shipping" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Truck className="w-4 h-4 text-text-secondary"/> Shipping</NavLink>
                  </div>
               </div>
               <div>
                  <h3 className="text-xs uppercase tracking-wide text-text-tertiary mb-2">Finances & Audit</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/finances/expenses" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Receipt className="w-4 h-4 text-text-secondary"/> Expenses</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/finances/supplies" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><PackageOpen className="w-4 h-4 text-text-secondary"/> Supplies</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/finances/vendors" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Store className="w-4 h-4 text-text-secondary"/> Vendors</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/finances/tax-report" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><FileSpreadsheet className="w-4 h-4 text-text-secondary"/> Tax Report</NavLink>
                    <NavLink onClick={() => setMobileMenuOpen(false)} to="/licenses" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><FileBadge className="w-4 h-4 text-text-secondary"/> Licenses</NavLink>
                  </div>
               </div>
               <div>
                  <NavLink onClick={() => setMobileMenuOpen(false)} to="/settings" className="flex items-center gap-2 p-2 bg-bg-hover rounded-lg text-sm text-text-primary"><Settings className="w-4 h-4 text-text-secondary"/> Settings</NavLink>
               </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
