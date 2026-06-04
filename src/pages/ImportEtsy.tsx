import { useRef, useState } from "react";
import {
  Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2, ShoppingBag, Receipt, Users, ListOrdered,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useApp } from "@/contexts/AppContext";
import { useEtsyImport } from "@/hooks/useEtsyImport";
import type { CsvType } from "@/lib/etsy/columns";

const TYPE_LABEL: Record<CsvType, string> = {
  sold_orders: "Sold Orders",
  order_items: "Order Items",
  payments: "Payment Ledger",
};

function SummaryTile({ icon: Icon, label, value }: { icon: typeof ShoppingBag; label: string; value: number }) {
  return (
    <div className="bg-bg-elevated backdrop-blur-md rounded-[16px] border border-border-subtle p-6 flex flex-col gap-2">
      <Icon className="w-5 h-5 text-text-tertiary" strokeWidth={1.5} />
      <div className="text-4xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-text-secondary uppercase tracking-wide">{label}</div>
    </div>
  );
}

export default function ImportEtsy() {
  const { addToast } = useApp();
  const { files, plan, addFiles, removeFile, clear, commit, committing, outcome, canCommit } = useEtsyImport();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const csvs = Array.from(list).filter((f) => f.name.toLowerCase().endsWith(".csv"));
    if (!csvs.length) {
      addToast({ title: "No CSV files", description: "Drop Etsy .csv exports.", status: "warn" });
      return;
    }
    addFiles(csvs);
  };

  const handleCommit = async () => {
    const res = await commit();
    if (res.errors.length && res.ordersWritten + res.expensesWritten === 0) {
      addToast({ title: "Import had problems", description: res.errors[0], status: "alert" });
    } else {
      addToast({
        title: "Import complete",
        description: `${res.ordersWritten} orders, ${res.expensesWritten} expenses, ${res.duplicatesSkipped} duplicates skipped`,
        status: "ok",
      });
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em]">Import from Etsy</h1>
          <p className="text-sm text-text-secondary mt-2 max-w-2xl">
            Upload your Etsy CSV exports — <span className="text-text-primary">Sold Orders</span>,{" "}
            <span className="text-text-primary">Order Items</span>, and the{" "}
            <span className="text-text-primary">Payment account</span> ledger. Everything is staged, de-duplicated,
            and reviewed here before anything is written.
          </p>
        </div>
        {files.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear}>Clear all</Button>
        )}
      </div>

      {!canCommit && (
        <div className="p-3 rounded-md bg-status-warn/10 border border-status-warn/30 text-xs text-status-warn">
          You can parse and preview here, but committing writes to your account — sign in to save.
        </div>
      )}

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-[12px] border border-dashed p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
          dragging ? "border-accent-brand bg-accent-brand-dim" : "border-border-strong hover:bg-bg-hover"
        }`}
      >
        <div className="w-12 h-12 rounded-2xl border border-border-subtle bg-bg-base/50 flex items-center justify-center">
          <Upload className="w-5 h-5 text-text-tertiary" strokeWidth={1.5} />
        </div>
        <div className="text-sm text-text-primary">Drop Etsy CSV files here, or click to browse</div>
        <div className="text-xs text-text-tertiary">Multiple files welcome — type is auto-detected</div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* Parsed files */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <Card key={f.fileName} className="p-4 flex items-center gap-4">
              <FileSpreadsheet className="w-5 h-5 text-text-tertiary shrink-0" strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{f.fileName}</div>
                <div className="text-xs text-text-secondary mt-1 flex items-center gap-2 flex-wrap">
                  {f.csvType ? (
                    <>
                      <Badge variant="brand">{TYPE_LABEL[f.csvType]}</Badge>
                      <span>{f.rows.length} rows</span>
                    </>
                  ) : (
                    <span className="text-status-alert">Unrecognized format</span>
                  )}
                  {f.errors.map((e, i) => (
                    <span key={i} className="text-status-warn">· {e}</span>
                  ))}
                </div>
              </div>
              <button onClick={() => removeFile(f.fileName)} aria-label="Remove" className="text-text-tertiary hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Plan preview */}
      {plan && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <SummaryTile icon={ShoppingBag} label="Orders" value={plan.orders.length} />
            <SummaryTile icon={ListOrdered} label="Line items" value={plan.items.length} />
            <SummaryTile icon={Receipt} label="Expenses" value={plan.expenses.length} />
            <SummaryTile icon={Users} label="Customers" value={plan.customers.length} />
          </div>

          {(plan.skipped.deposits > 0 || plan.skipped.unmapped > 0) && (
            <p className="text-xs text-text-tertiary">
              Skipped {plan.skipped.deposits} deposit transfer(s) and {plan.skipped.unmapped} unmapped row(s) — these
              aren't revenue or expenses.
            </p>
          )}

          {plan.skipped.unmatchedSales > 0 && (
            <div className="p-3 rounded-md bg-status-warn/10 border border-status-warn/30 text-xs text-status-warn">
              {plan.skipped.unmatchedSales} sale(s) in the payment ledger couldn't be matched to an order and were
              not imported as revenue. Include the matching <span className="font-medium">Sold Orders</span> CSV for
              this period so these orders are captured.
            </div>
          )}

          {plan.orders.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border-subtle text-xs uppercase tracking-wide text-text-secondary">
                Orders preview (first 8)
              </div>
              <table className="w-full text-sm text-left">
                <thead className="text-[12px] uppercase tracking-wide text-text-secondary border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-2 font-medium">Order #</th>
                    <th className="px-4 py-2 font-medium">Customer</th>
                    <th className="px-4 py-2 font-medium">Placed</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.orders.slice(0, 8).map((o) => (
                    <tr key={o.externalId} className="border-b border-border-subtle/50 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">{o.externalId}</td>
                      <td className="px-4 py-2">{o.customerName ?? "—"}</td>
                      <td className="px-4 py-2 text-text-secondary">{o.placedAt?.slice(0, 10) ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">${o.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <div className="flex items-center justify-end gap-3">
            <Button
              variant="brand"
              disabled={!canCommit || committing}
              onClick={handleCommit}
            >
              {committing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <>Commit import</>}
            </Button>
          </div>
        </>
      )}

      {/* Outcome */}
      {outcome && (
        <Card className="p-6 space-y-3">
          <div className="flex items-center gap-2">
            {outcome.errors.length ? (
              <AlertCircle className="w-5 h-5 text-status-warn" strokeWidth={1.5} />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-status-ok" strokeWidth={1.5} />
            )}
            <h2 className="text-base font-medium">Import result</h2>
          </div>
          <div className="text-sm text-text-secondary">
            {outcome.ordersWritten} orders · {outcome.itemsWritten} line items · {outcome.expensesWritten} expenses ·{" "}
            {outcome.customersWritten} customers added · {outcome.duplicatesSkipped} duplicates skipped.
          </div>
          {outcome.errors.length > 0 && (
            <ul className="text-xs text-status-warn space-y-1 list-disc pl-5">
              {outcome.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
