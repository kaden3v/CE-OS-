import { createContext, useContext, useState, ReactNode } from 'react';

type SettingsState = {
  developerMode: boolean;
  demoMode: boolean;
  loadingMode: boolean;
  errorMode: boolean;
  emptyMode: boolean;
  density: 'comfortable' | 'compact';
  /** Cash recognizes events when money moves. Accrual recognizes when work is done. */
  accountingMethod: 'cash' | 'accrual';
  /** Fiscal year start month (1-12). Calendar year = 1 (default). */
  fiscalYearStartMonth: number;
  /** Last year's federal tax liability (cents). Used by safe-harbor quarterly calc. */
  priorYearTaxCents: number;
  /** Last year's AGI (cents). >$150k triggers 110% safe-harbor multiplier. */
  priorYearAgiCents: number;
};

type Toast = {
  id: string;
  title: string;
  description?: string;
  status: 'ok' | 'info' | 'warn' | 'alert';
  duration?: number;
  /** Action shown inline on the toast (undo, retry, etc.). */
  action?: { label: string; run: () => void };
};

type Notification = {
  id: string;
  title: string;
  description: string;
  time: string;
  status: 'ok' | 'info' | 'warn' | 'alert';
  read: boolean;
};

export type Task = {
  id: string;
  title: string;
  due: string;
  type: string;
  completed: boolean;
};

interface AppContextType {
  settings: SettingsState;
  updateSettings: (updates: Partial<SettingsState>) => void;
  // Toasts
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  // Notifications
  notifications: Notification[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'time'>) => void;
  // Tasks
  tasks: Task[];
  addTask: (task: Omit<Task, 'id' | 'completed'>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  // Command Palette
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  // Order Detail Slide-in (Global)
  globalOrderViewId: string | null;
  setGlobalOrderViewId: (id: string | null) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>({
    developerMode: new URLSearchParams(window.location.search).get('dev') === '1',
    demoMode: false,
    loadingMode: false,
    errorMode: false,
    emptyMode: false,
    density: 'comfortable',
    accountingMethod: 'accrual',
    fiscalYearStartMonth: 1,
    priorYearTaxCents: 0,
    priorYearAgiCents: 0,
  });

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', title: "Transfer P. 'Pirouette' batch #402 to establishment", due: "Today", type: "propagation", completed: false },
    { id: '2', title: "Renew AZ Dept. of Agriculture License", due: "In 3 days", type: "license", completed: false },
    { id: '3', title: "Reorder LFS (Low stock: 2 bales left)", due: "This week", type: "supply", completed: false },
  ]);
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [globalOrderViewId, setGlobalOrderViewId] = useState<string | null>(null);

  const updateSettings = (updates: Partial<SettingsState>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { ...toast, id }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const addNotification = (notif: Omit<Notification, 'id' | 'read' | 'time'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [{ ...notif, id, read: false, time: 'Just now' }, ...prev]);
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const addTask = (task: Omit<Task, 'id' | 'completed'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setTasks(prev => [{ ...task, id, completed: false }, ...prev]);
  };

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  return (
    <AppContext.Provider value={{
      settings,
      updateSettings,
      toasts,
      addToast,
      removeToast,
      notifications,
      addNotification,
      markNotificationRead,
      markAllNotificationsRead,
      tasks,
      addTask,
      toggleTask,
      deleteTask,
      isCommandPaletteOpen,
      setCommandPaletteOpen,
      globalOrderViewId,
      setGlobalOrderViewId
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
