import type { ReactNode } from 'react';

export type PropertyType = 'text' | 'number' | 'date' | 'select' | 'status' | 'user' | 'tags' | 'readonly';

export type PropertyDef<T> = {
  id: string;
  label: string;
  type: PropertyType;
  value: (record: T) => any;
  /** Edit handler. If omitted, the property is read-only. */
  onCommit?: (record: T, next: any) => Promise<void> | void;
  options?: Array<{ value: string; label: string }>;
};

export type ActionItem<T> = {
  id: string;
  label: string;
  /** Filter: predicate decides whether the action applies to this record's state. */
  applies?: (record: T) => boolean;
  shortcut?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  destructive?: boolean;
  /** Primary lives in the header button. Only one primary at a time. */
  primary?: boolean;
  /** Optional: ask for a typed-confirm string. */
  confirm?: {
    title: string;
    /** What the user must type. Often the record ID. */
    typeToConfirm: string;
    confirmLabel: string;
  };
  run: (record: T) => void | Promise<void>;
};

export type TabDef<T> = {
  id: string;
  label: string;
  content: (record: T) => ReactNode;
  badge?: (record: T) => number | string | undefined;
};

export type RecordDrawerConfig<T> = {
  /** Record type identifier. */
  type: string;
  /** Title for the drawer header — clickable to edit if onTitleCommit provided. */
  title: (record: T) => string;
  onTitleCommit?: (record: T, next: string) => Promise<void> | void;
  /** Optional status chip rendered next to the title. */
  status?: (record: T) => { label: string; tone: 'ok' | 'warn' | 'alert' | 'info' | 'neutral' } | null;
  properties: PropertyDef<T>[];
  /** The Overview tab body to the right of the property grid. */
  overviewBody?: (record: T) => ReactNode;
  tabs?: TabDef<T>[];
  actions: ActionItem<T>[];
};
