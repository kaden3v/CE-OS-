import { useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { Store, ShoppingBag, Send, Printer, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/data/DataTable';
import { RecordDrawer } from '@/components/record/RecordDrawer';
import { orderConfig, type OrderRecord } from '@/components/record/configs/order';
import type { ColumnDef } from '@/components/data/types';
import { useApiData } from '@/hooks/useApiData';
import { fetchOrders } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import type { ActivityEntry } from '@/components/record/ActivityFeed';
import { Topbar } from '@/components/nav/Topbar';

const STATUSES: OrderRecord['status'][] = ['Pending', 'Processing', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];

// Per-order activity log
const ACTIVITY: Record<string, ActivityEntry[]> = {};
function getActivity(id: string): ActivityEntry[] {
  return ACTIVITY[id] ?? [
    { id: '1', kind: 'system', actor: { name: 'System', initials: 'S' }, at: new Date(Date.now() - 3_600_000).toISOString(), text: 'Order placed via Etsy' },
    { id: '2', kind: 'system', actor: { name: 'System', initials: 'S' }, at: new Date(Date.now() - 1_800_000).toISOString(), text: 'Payment captured' },
  ];
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Orders() {
  const [params, setParams] = useSearchParams();
  const { addToast } = useApp();

  const fetcher = useCallback(async () => {
    const { orders } = await fetchOrders({ limit: 50 });
    return orders;
  }, []);
  const { data: orders, isLoading, isError, refetch } = useApiData<OrderRecord>(fetcher);

  const openId = params.get('id');
  const openIndex = useMemo(() => orders.findIndex(o => o.id === openId), [orders, openId]);
  const openOrder = openIndex >= 0 ? orders[openIndex] : null;

  function openRecord(id: string) {
    const next = new URLSearchParams(params); next.set('id', id);
    setParams(next, { replace: false });
  }
  function closeRecord() {
    const next = new URLSearchParams(params); next.delete('id');
    setParams(next, { replace: true });
  }

  function onAction(id: string, label: string) {
    ACTIVITY[id] = [
      ...getActivity(id),
      { id: String(Date.now()), kind: 'system', actor: { name: 'Kaden', initials: 'KC' }, at: new Date().toISOString(), text: label },
    ];
    addToast({
      title: `Order ${id}: ${label}`,
      status: 'ok',
      action: { label: 'Undo', run: () => addToast({ title: 'Reverted', status: 'info' }) },
    });
  }

  const config = useMemo(() => orderConfig({ onAction, getActivity }), []);

  const columns: ColumnDef<OrderRecord>[] = useMemo(() => [
    {
      id: 'id', accessor: 'id', header: 'Order #', width: 110, pin: 'left',
      cell: (row) => <span className="font-medium text-text-primary">{row.id}</span>,
    },
    {
      id: 'channel', accessor: 'channel', header: 'Channel', width: 110, filterable: true, groupable: true,
      options: [{ value: 'Etsy', label: 'Etsy' }, { value: 'Shopify', label: 'Shopify' }],
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5 text-text-secondary">
          {row.channel === 'Shopify' ? <Store className="w-3 h-3" /> : <ShoppingBag className="w-3 h-3" />}
          {row.channel}
        </span>
      ),
    },
    {
      id: 'customer', accessor: 'customer', header: 'Customer', width: 180, filterable: true,
      cell: (row) => <span className="text-text-primary">{row.customer}</span>,
    },
    {
      id: 'items', header: 'Items', width: 90, sortable: false,
      cell: (row) => <span className="text-text-secondary">{row.items.length}</span>,
    },
    {
      id: 'status', accessor: 'status', header: 'Status', width: 130, filterable: true, groupable: true,
      options: STATUSES.map(s => ({ value: s, label: s })),
      cell: (row) => {
        const dot = row.status === 'Cancelled' ? 'bg-status-alert'
          : row.status === 'Pending' ? 'bg-status-warn'
          : row.status === 'Shipped' || row.status === 'Delivered' ? 'bg-status-ok'
          : 'bg-status-info';
        return (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`w-2 h-2 rounded-full ${dot}`} />
            <span>{row.status}</span>
          </span>
        );
      },
    },
    {
      id: 'subtotal', header: 'Subtotal', width: 100, numeric: true,
      cell: (row) => `$${row.items.reduce((s, i) => s + i.qty * i.price, 0).toFixed(2)}`,
    },
    {
      id: 'created', accessor: 'created', header: 'Created', width: 110,
      cell: (row) => <span className="text-text-secondary tabular-nums">{row.created}</span>,
    },
  ], []);

  return (
    <>
      <Topbar
        actions={
          <button
            onClick={() => addToast({ title: 'New order created (placeholder)', status: 'info' })}
            className="h-8 px-3 rounded bg-accent-brand text-bg-base text-[13px] font-medium hover:opacity-90 transition-opacity duration-[120ms]"
          >
            New order
          </button>
        }
      />

      <div className="p-4 md:p-6">
        <DataTable<OrderRecord>
          storageKey="orders.v1"
          rows={orders}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={isLoading}
          isError={isError ? { message: isError.message, onRetry: refetch } : null}
          emptyState={{
            title: 'No orders yet',
            description: 'New Etsy and Shopify orders appear here as they come in.',
            action: { label: 'Create test order', onClick: () => addToast({ title: 'Test order created', status: 'ok' }) },
          }}
          onRowOpen={(row) => openRecord(row.id)}
          onSelectionChange={() => { /* selection mirror to parent if needed */ }}
          bulkActions={[
            { id: 'send',  label: 'Send to Claude', icon: Send,    run: (rows) => addToast({ title: `Sent ${rows.length} orders to Claude`, status: 'ok' }) },
            { id: 'print', label: 'Print labels',   icon: Printer, run: (rows) => addToast({ title: `Printing ${rows.length} labels`, status: 'info' }) },
            { id: 'cancel', label: 'Cancel', icon: Trash2, destructive: true,
              run: (rows) => addToast({ title: `Cancelled ${rows.length} orders`, status: 'warn', action: { label: 'Undo', run: () => addToast({ title: 'Reverted', status: 'info' }) } }) },
          ]}
          rowLabel={(row) => `Order ${row.id}, ${row.customer}, ${row.status}`}
        />
      </div>

      <RecordDrawer
        open={!!openOrder}
        record={openOrder}
        config={config}
        onClose={closeRecord}
        onPrev={openIndex > 0 ? () => openRecord(orders[openIndex - 1].id) : undefined}
        onNext={openIndex >= 0 && openIndex < orders.length - 1 ? () => openRecord(orders[openIndex + 1].id) : undefined}
      />
    </>
  );
}
