import { createContext, useContext, useState, ReactNode } from 'react';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useEntity } from '@/hooks/useEntity';
import type { Tables } from '@/lib/database.types';

type SettingsState = {
  developerMode: boolean;
  loadingMode: boolean;
  errorMode: boolean;
  emptyMode: boolean;
  density: 'comfortable' | 'compact';
};

type ToastStatus = 'ok' | 'info' | 'warn' | 'alert';
type ToastInput = 'ok' | 'info' | 'warn' | 'alert' | 'success' | 'error';

type Toast = {
  id: string;
  title: string;
  description?: string;
  status: ToastStatus;
  duration?: number;
};

const normalizeStatus = (s?: ToastInput): ToastStatus => {
  if (s === 'success') return 'ok';
  if (s === 'error') return 'alert';
  return (s as ToastStatus) ?? 'info';
};

type Notification = {
  id: string;
  title: string;
  description: string;
  time: string;
  status: 'ok' | 'info' | 'warn' | 'alert';
  read: boolean;
};

export type Task = Tables<'tasks'>;

interface AppContextType {
  settings: SettingsState;
  updateSettings: (updates: Partial<SettingsState>) => void;
  // Toasts
  toasts: Toast[];
  addToast: (
    titleOrToast: string | (Omit<Toast, 'id' | 'status'> & { status?: ToastInput }),
    status?: ToastInput,
    description?: string,
    duration?: number,
  ) => void;
  removeToast: (id: string) => void;
  // Notifications
  notifications: Notification[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'time'>) => void;
  // Tasks (persisted to Supabase when authed; localStorage in demo mode)
  tasks: Task[];
  tasksLoading: boolean;
  addTask: (task: { title: string; due?: string | null; type?: string | null }) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  // Command Palette
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  // Order Detail Slide-in (Global)
  globalOrderViewId: string | null;
  setGlobalOrderViewId: (id: string | null) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = usePersistedState<SettingsState>('settings', {
    developerMode: new URLSearchParams(window.location.search).get('dev') === '1',
    loadingMode: false,
    errorMode: false,
    emptyMode: false,
    density: 'comfortable',
  });

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = usePersistedState<Notification[]>('notifications', []);

  const TASK_SEED: Task[] = [];

  const taskEntity = useEntity<Task>('tasks', TASK_SEED, {
    toRow: (t) => ({
      title: t.title,
      due: t.due,
      type: t.type,
      completed: t.completed,
    }),
  });
  const tasks = taskEntity.data;
  const tasksLoading = taskEntity.isLoading;
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [globalOrderViewId, setGlobalOrderViewId] = useState<string | null>(null);

  const updateSettings = (updates: Partial<SettingsState>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const addToast = (
    titleOrToast: string | (Omit<Toast, 'id' | 'status'> & { status?: ToastInput }),
    status?: ToastInput,
    description?: string,
    duration?: number,
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    const next: Toast =
      typeof titleOrToast === 'string'
        ? { id, title: titleOrToast, status: normalizeStatus(status), description, duration }
        : { id, ...titleOrToast, status: normalizeStatus(titleOrToast.status) };
    setToasts(prev => [...prev, next]);
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

  const addTask: AppContextType['addTask'] = async (task) => {
    await taskEntity.add({
      id: crypto.randomUUID(),
      title: task.title,
      due: task.due ?? null,
      type: task.type ?? null,
      completed: false,
      updated_at: new Date().toISOString(),
      user_id: '',
    } as Task);
  };

  const toggleTask: AppContextType['toggleTask'] = async (id) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    await taskEntity.update(id, { completed: !t.completed } as Partial<Task>);
  };

  const deleteTask: AppContextType['deleteTask'] = async (id) => {
    await taskEntity.remove(id);
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
      tasksLoading,
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
