import { Send, Pause, CheckCircle, Printer, Trash2 } from 'lucide-react';
import { ActivityFeed, type ActivityEntry } from '../ActivityFeed';
import type { RecordDrawerConfig } from '../types';

export type OrderRecord = {
  id: string;
  channel: 'Etsy' | 'Shopify';
  customer: string;
  items: Array<{ name: string; qty: number; price: number }>;
  status: 'Pending' | 'Processing' | 'Packed' | 'Shipped' | 'Delivered' | 'Cancelled';
  created: string;
};

/**
 * Per-record-type drawer config. The RecordDrawer reads this — adding a new
 * record type means writing a new file here, not editing the drawer.
 */
export function orderConfig({
  onAction, getActivity,
}: {
  onAction: (id: string, label: string) => void;
  getActivity: (id: string) => ActivityEntry[];
}): RecordDrawerConfig<OrderRecord> {
  return {
    type: 'order',
    title: (r) => `Order ${r.id}`,
    status: (r) => {
      const tone = r.status === 'Cancelled' ? 'alert'
        : r.status === 'Pending' ? 'warn'
        : r.status === 'Shipped' || r.status === 'Delivered' ? 'ok'
        : 'info';
      return { label: r.status, tone };
    },
    properties: [
      { id: 'channel',  label: 'Channel',  type: 'select', value: r => r.channel,
        options: [{ value: 'Etsy', label: 'Etsy' }, { value: 'Shopify', label: 'Shopify' }],
        onCommit: (r, v) => onAction(r.id, `set channel to ${v}`) },
      { id: 'customer', label: 'Customer', type: 'text',   value: r => r.customer,
        onCommit: (r, v) => onAction(r.id, `renamed customer to ${v}`) },
      { id: 'status',   label: 'Status',   type: 'status', value: r => r.status },
      { id: 'created',  label: 'Created',  type: 'readonly', value: r => r.created },
      { id: 'total',    label: 'Total',    type: 'readonly',
        value: r => `$${r.items.reduce((s, i) => s + i.qty * i.price, 0).toFixed(2)}` },
    ],
    overviewBody: (r) => (
      <div>
        <h3 className="text-[12px] uppercase tracking-wider font-medium text-text-tertiary mb-2">Items</h3>
        <ul className="space-y-1">
          {r.items.map((i, idx) => (
            <li key={idx} className="flex items-center justify-between h-7 px-2 rounded hover:bg-bg-hover transition-colors duration-[120ms]">
              <span className="text-text-primary">{i.name} × {i.qty}</span>
              <span className="tabular-nums text-text-secondary">${(i.qty * i.price).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
    tabs: [
      {
        id: 'activity', label: 'Activity',
        content: (r) => (
          <ActivityFeed
            entries={getActivity(r.id)}
            onPostComment={async (text) => onAction(r.id, `commented: ${text}`)}
          />
        ),
      },
    ],
    actions: [
      {
        id: 'send-to-claude', label: 'Send to Claude', icon: Send, primary: true,
        applies: (r) => r.status === 'Pending',
        shortcut: 'enter',
        run: (r) => onAction(r.id, 'sent to Claude'),
      },
      {
        id: 'pause', label: 'Pause', icon: Pause, primary: true,
        applies: (r) => r.status === 'Processing',
        run: (r) => onAction(r.id, 'paused'),
      },
      {
        id: 'approve-build', label: 'Approve & build', icon: CheckCircle, primary: true,
        applies: (r) => r.status === 'Packed',
        run: (r) => onAction(r.id, 'approved and built'),
      },
      {
        id: 'print-label', label: 'Print label', icon: Printer, shortcut: 'p',
        applies: (r) => r.status !== 'Cancelled',
        run: (r) => onAction(r.id, 'printed label'),
      },
      {
        id: 'cancel', label: 'Cancel order', icon: Trash2, destructive: true,
        applies: (r) => r.status !== 'Cancelled' && r.status !== 'Delivered',
        confirm: {
          title: 'Cancel this order?',
          typeToConfirm: 'CANCEL',
          confirmLabel: 'Cancel order',
        },
        run: (r) => onAction(r.id, 'cancelled'),
      },
    ],
  };
}
