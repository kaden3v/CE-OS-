import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useEntity } from '@/hooks/useEntity';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

const ACTION_LABELS: Record<string, string> = {
  created: 'added',
  updated: 'updated',
  deleted: 'removed',
  imported: 'imported into',
};

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
  clearNotifications: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'time'>) => void;
  // Tasks (persisted to Supabase, shared across the org; assignable to teammates)
  tasks: Task[];
  addTask: (task: { title: string; due?: string | null; type?: string | null; assigned_to?: string | null }) => Promise<void>;
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
      assigned_to: t.assigned_to,
    }),
  });
  const tasks = taskEntity.data;
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [globalOrderViewId, setGlobalOrderViewId] = useState<string | null>(null);

  // All handlers are useCallback-stable (functional setState only) so the
  // context value below can be memoized. Critically, a stable `addToast` stops
  // consumers like AccessRequests — which list it in a useEffect dep chain —
  // from refiring on every unrelated toast (was an infinite refetch loop).
  const updateSettings = useCallback((updates: Partial<SettingsState>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, [setSettings]);

  const addToast = useCallback((
    titleOrToast: string | (Omit<Toast, 'id' | 'status'> & { status?: ToastInput }),
    status?: ToastInput,
    description?: string,
    duration?: number,
  ) => {
    const id = crypto.randomUUID();
    const next: Toast =
      typeof titleOrToast === 'string'
        ? { id, title: titleOrToast, status: normalizeStatus(status), description, duration }
        : { id, ...titleOrToast, status: normalizeStatus(titleOrToast.status) };
    setToasts(prev => [...prev, next]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addNotification = useCallback((notif: Omit<Notification, 'id' | 'read' | 'time'>) => {
    setNotifications(prev => [{ ...notif, id: crypto.randomUUID(), read: false, time: 'Just now' }, ...prev]);
  }, [setNotifications]);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, [setNotifications]);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, [setNotifications]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, [setNotifications]);

  // Real notification sources: teammates' changes (via the activity log) and
  // tasks assigned to the current user. RLS already limits events to the org;
  // we additionally drop our own actions.
  const { user, activeOrgId } = useAuth();
  useEffect(() => {
    if (!supabase || !user || !activeOrgId) return;
    const channel = supabase
      .channel(`notifs-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, (payload) => {
        const row = payload.new as Tables<'activity_log'>;
        // Only real teammate actions become notifications. Skip our own actions
        // and system/automated writes (e.g. Etsy sync inserts with actor_id null),
        // which otherwise flood the panel as "A teammate added orders" during a backfill.
        if (!row || row.org_id !== activeOrgId || !row.actor_id || row.actor_id === user.id) return;
        const entityLabel = row.entity.replace(/_/g, ' ');
        setNotifications(prev => [{
          id: `act-${row.id}`,
          title: `A teammate ${ACTION_LABELS[row.action] ?? row.action} ${entityLabel}`,
          description: row.summary ?? '',
          time: 'Just now',
          status: 'info' as const,
          read: false,
        }, ...prev].slice(0, 50));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, (payload) => {
        const row = payload.new as Tables<'tasks'>;
        if (!row || row.org_id !== activeOrgId) return;
        if (row.assigned_to === user.id && row.user_id !== user.id) {
          setNotifications(prev => [{
            id: `task-${row.id}`,
            title: 'Task assigned to you',
            description: row.title,
            time: 'Just now',
            status: 'info' as const,
            read: false,
          }, ...prev].slice(0, 50));
        }
      })
      .subscribe();
    return () => {
      void supabase!.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeOrgId]);

  const addTask = useCallback<AppContextType['addTask']>(async (task) => {
    await taskEntity.add({
      id: crypto.randomUUID(),
      title: task.title,
      due: task.due ?? null,
      type: task.type ?? null,
      assigned_to: task.assigned_to ?? null,
      completed: false,
      updated_at: new Date().toISOString(),
      user_id: '',
      org_id: null,
    } as Task);
  }, [taskEntity]);

  const toggleTask = useCallback<AppContextType['toggleTask']>(async (id) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    await taskEntity.update(id, { completed: !t.completed } as Partial<Task>);
  }, [taskEntity, tasks]);

  const deleteTask = useCallback<AppContextType['deleteTask']>(async (id) => {
    await taskEntity.remove(id);
  }, [taskEntity]);

  const value = useMemo<AppContextType>(() => ({
    settings,
    updateSettings,
    toasts,
    addToast,
    removeToast,
    notifications,
    addNotification,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
    tasks,
    addTask,
    toggleTask,
    deleteTask,
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    globalOrderViewId,
    setGlobalOrderViewId,
  }), [
    settings, updateSettings, toasts, addToast, removeToast,
    notifications, addNotification, markNotificationRead, markAllNotificationsRead, clearNotifications,
    tasks, addTask, toggleTask, deleteTask, isCommandPaletteOpen, globalOrderViewId,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
