import { useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { Download, ExternalLink } from 'lucide-react';
import { DataTable } from '@/components/data/DataTable';
import { RecordDrawer } from '@/components/record/RecordDrawer';
import { Topbar } from '@/components/nav/Topbar';
import { PeriodPicker } from '@/components/finance/PeriodPicker';
import { vendorConfig, type VendorRecord } from '@/components/record/configs/vendor';
import type { ColumnDef } from '@/components/data/types';
import { listTransactions, listVendors } from '@/lib/finance/store';
import { defaultPeriod } from '@/lib/finance/period';
import { accountName } from '@/lib/finance/accounts';
import { formatCents, type PeriodSelection } from '@/lib/finance/types';
import { toCsv, downloadCsv, timestampedFilename } from '@/lib/finance/csv';
import { useApp } from '@/contexts/AppContext';

/**
 * Vendors are projections of the ledger — there's no separate "vendor"
 * entity yet. Every distinct `vendor` string on a journal entry rolls up
 * into one row here. Pass 3 will introduce a real vendor record with
 * contact info, payment terms, etc.
 */
export default function Vendors() {
  const { settings, addToast } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState<PeriodSelection>(() => defaultPeriod(settings.fiscalYearStartMonth));

  const periodArg = { start: period.current.start, end: period.current.end };

  const vendors = useMemo<VendorRecord[]>(() => {
    const rolled = listVendors({ period: periodArg, method: settings.accountingMethod });
    return rolled.map(v => {
      const transactions = listTransactions({
        period: periodArg,
        method: settings.accountingMethod,
        vendors: [v.name],
      });
      return {
        id: slug(v.name),
        name: v.name,
        primaryAccount: v.categoryCode,
        totalCents: v.totalCents,
        lastDate: v.lastDate,
        transactionCount: transactions.length,
        transactions,
      };
    });
  }, [period, settings.accountingMethod]);

  // Drill-down
  const openId = params.get('id');
  const openIndex = useMemo(() => vendors.findIndex(v => v.id === openId), [vendors, openId]);
  const openVendor = openIndex >= 0 ? vendors[openIndex] : null;
  const openRecord = (id: string) => { const n = new URLSearchParams(params); n.set('id', id); setParams(n, { replace: false }); };
  const closeRecord = () => { const n = new URLSearchParams(params); n.delete('id'); setParams(n, { replace: true }); };

  // Drawer actions
  const config = useMemo(() => vendorConfig({
    onNewExpense: (v) => {
      addToast({ title: `Open Expenses → New, pre-fill ${v.name}`, status: 'info' });
      navigate(`/finances/expenses?vendor=${encodeURIComponent(v.name)}`);
    },
    onFlag: (v) => addToast({ title: `Flagged ${v.name} for review`, status: 'warn' }),
    onOpenTransaction: (tx) => {
      closeRecord();
      navigate(`/finances/expenses?id=${tx.id}`);
    },
  }), [navigate, addToast]);

  // Columns
  const columns: ColumnDef<VendorRecord>[] = useMemo(() => [
    {
      id: 'name', accessor: 'name', header: 'Vendor', width: 220, pin: 'left',
      cell: (v) => <span className="font-medium text-text-primary">{v.name}</span>,
    },
    {
      id: 'primaryAccount', accessor: 'primaryAccount', header: 'Primary GL', width: 220, filterable: true, groupable: true,
      cell: (v) => (
        <span className="text-text-secondary">
          <span className="font-mono text-text-tertiary text-[11px] mr-2">{v.primaryAccount}</span>
          {accountName(v.primaryAccount)}
        </span>
      ),
    },
    {
      id: 'totalCents', accessor: 'totalCents', header: 'Total spent', width: 120, numeric: true,
      cell: (v) => <span className="tabular-nums font-medium text-text-primary">{formatCents(v.totalCents)}</span>,
    },
    {
      id: 'transactionCount', accessor: 'transactionCount', header: 'Txns', width: 80, numeric: true,
      cell: (v) => <span className="tabular-nums text-text-secondary">{v.transactionCount}</span>,
    },
    {
      id: 'lastDate', accessor: 'lastDate', header: 'Last activity', width: 130,
      cell: (v) => <span className="tabular-nums text-text-secondary">{v.lastDate}</span>,
    },
    {
      id: 'drill', header: '', width: 60, sortable: false, filterable: false,
      cell: (v) => (
        <button
          data-table-cell-stop
          onClick={(e) => { e.stopPropagation(); navigate(`/finances/expenses?vendor=${encodeURIComponent(v.name)}`); }}
          aria-label={`See expenses for ${v.name}`}
          className="text-text-tertiary hover:text-text-primary p-1 rounded hover:bg-bg-hover transition-colors duration-[120ms]"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ], [navigate]);

  const onExportCsv = () => {
    const csv = toCsv(vendors, [
      { header: 'Vendor',         value: v => v.name },
      { header: 'Primary GL',     value: v => v.primaryAccount },
      { header: 'Primary GL Name', value: v => accountName(v.primaryAccount) },
      { header: 'Total Spent',    value: v => (v.totalCents / 100).toFixed(2) },
      { header: 'Transactions',   value: v => v.transactionCount },
      { header: 'Last Activity',  value: v => v.lastDate },
    ]);
    downloadCsv(csv, timestampedFilename(`vendors-${period.current.label.replace(/\s+/g, '-').toLowerCase()}`));
    addToast({ title: `Exported ${vendors.length} vendors`, status: 'ok' });
  };

  return (
    <>
      <Topbar
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} accountingMethod={settings.accountingMethod} fiscalYearStartMonth={settings.fiscalYearStartMonth} />
            <button
              onClick={onExportCsv}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border-subtle text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[120ms]"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
              Export CSV
            </button>
          </>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        <p className="text-[12px] text-text-tertiary">
          Vendors are projected from the ledger. Every expense that names a vendor rolls up here.
          A real vendor directory with contact + payment terms ships in Pass 3.
        </p>

        <DataTable<VendorRecord>
          storageKey="vendors.v2"
          rows={vendors}
          columns={columns}
          getRowId={(v) => v.id}
          onRowOpen={(v) => openRecord(v.id)}
          emptyState={{
            title: 'No vendors in this period',
            description: 'As you log expenses, vendors appear here grouped by name.',
            action: { label: 'Log an expense', onClick: () => navigate('/finances/expenses') },
          }}
          rowLabel={(v) => `${v.name}, ${formatCents(v.totalCents)} across ${v.transactionCount} transactions`}
        />
      </div>

      <RecordDrawer
        open={!!openVendor}
        record={openVendor}
        config={config}
        onClose={closeRecord}
        onPrev={openIndex > 0 ? () => openRecord(vendors[openIndex - 1].id) : undefined}
        onNext={openIndex >= 0 && openIndex < vendors.length - 1 ? () => openRecord(vendors[openIndex + 1].id) : undefined}
      />
    </>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
