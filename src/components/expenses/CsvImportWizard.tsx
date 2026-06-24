import { useMemo, useRef, useState } from "react";
import { UploadCloud, Loader2, AlertTriangle, Copy, ArrowLeft } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { useApp } from "@/contexts/AppContext";
import { parseCsv, parseCsvAmount, parseCsvDate } from "@/lib/csv";
import { normalizeExpenseCategory } from "@/lib/scheduleC";
import { isInflow, passesPolarity, type Polarity } from "@/lib/expenseImport";
import { formatMoney } from "@/lib/format";
import { formatBusinessDate } from "@/lib/dates";
import type { Expense } from "./types";

export interface ImportRow {
  occurred_on: string;
  amount: number;
  description: string | null;
  category: string | null;
  category_legacy: string | null;
}

interface CsvImportWizardProps {
  open: boolean;
  onClose: () => void;
  existing: Expense[];
  onImport: (rows: ImportRow[]) => Promise<number>;
}

type Mapping = { date: number; amount: number; description: number; category: number };

const NONE = -1;
const selectCls =
  "w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong";
const selectClsSmall =
  "bg-bg-base border border-border-subtle rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-border-strong";

const guess = (headers: string[], re: RegExp): number => headers.findIndex((h) => re.test(h));

export function CsvImportWizard({ open, onClose, existing, onImport }: CsvImportWizardProps) {
  const { addToast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({ date: NONE, amount: NONE, description: NONE, category: NONE });
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [polarity, setPolarity] = useState<Polarity>("all");
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setDataRows([]);
    setMapping({ date: NONE, amount: NONE, description: NONE, category: NONE });
    setSkipDuplicates(true);
    setPolarity("all");
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      addToast({ title: "Empty file", description: "Need a header row and at least one data row.", status: "warn" });
      return;
    }
    const head = rows[0];
    setFileName(file.name);
    setHeaders(head);
    setDataRows(rows.slice(1));
    setMapping({
      date: guess(head, /date/i),
      amount: guess(head, /amount|total|debit|charge|price/i),
      description: guess(head, /desc|memo|note|detail|name/i),
      category: guess(head, /categ|type/i),
    });
    setStep("map");
  };

  const parsed = useMemo(() => {
    if (mapping.date === NONE || mapping.amount === NONE) return [];
    return dataRows.map((r) => {
      const occurred_on = parseCsvDate(r[mapping.date] ?? "");
      const raw = parseCsvAmount(r[mapping.amount] ?? "");
      const amount = raw == null ? null : Math.abs(raw);
      const inflow = isInflow(raw); // positive = money in (deposit/refund), not an expense
      const description = mapping.description >= 0 ? (r[mapping.description] ?? "").trim() || null : null;
      const rawCategory = mapping.category >= 0 ? (r[mapping.category] ?? "").trim() || null : null;
      const { category, legacy } = normalizeExpenseCategory(rawCategory);
      const valid = !!occurred_on && amount != null && amount > 0;
      const duplicate =
        valid &&
        existing.some((e) => e.occurred_on === occurred_on && Math.abs(Number(e.amount) - (amount as number)) < 0.005);
      return { occurred_on, amount, inflow, description, category, category_legacy: legacy, valid, duplicate };
    });
  }, [dataRows, mapping, existing]);

  const stats = useMemo(() => {
    const valid = parsed.filter((p) => p.valid);
    const inflows = valid.filter((p) => p.inflow);
    const eligible = valid.filter((p) => passesPolarity(polarity, p.inflow));
    const dupes = eligible.filter((p) => p.duplicate);
    const toImport = eligible.filter((p) => !skipDuplicates || !p.duplicate);
    return { total: parsed.length, valid: valid.length, inflows: inflows.length, dupes: dupes.length, toImport: toImport.length };
  }, [parsed, skipDuplicates, polarity]);

  const runImport = async () => {
    const rows: ImportRow[] = parsed
      .filter((p) => p.valid && passesPolarity(polarity, p.inflow) && (!skipDuplicates || !p.duplicate))
      .map((p) => ({
        occurred_on: p.occurred_on as string,
        amount: p.amount as number,
        description: p.description,
        category: p.category,
        category_legacy: p.category_legacy,
      }));
    if (rows.length === 0) {
      addToast({ title: "Nothing to import", description: "No valid rows after filtering.", status: "warn" });
      return;
    }
    setImporting(true);
    const count = await onImport(rows);
    setImporting(false);
    if (count > 0) {
      addToast({ title: "Import complete", description: `${count} expense${count === 1 ? "" : "s"} added · review categories.`, status: "ok" });
      close();
    }
  };

  return (
    <Modal open={open} onClose={close} title="Import Expenses from CSV" size="xl">
      <div className="p-4">
        {step === "upload" && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong py-12 text-text-secondary hover:bg-bg-hover transition-colors"
            >
              <UploadCloud className="w-8 h-8 opacity-70" />
              <span className="text-sm font-medium">Choose a CSV file</span>
              <span className="text-xs text-text-tertiary">Bank, Etsy, Shopify, or spreadsheet export</span>
            </button>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Map the columns in <span className="text-text-primary">{fileName}</span> ({dataRows.length} rows).
            </p>
            <div className="grid grid-cols-2 gap-4">
              {([
                ["date", "Date *"],
                ["amount", "Amount *"],
                ["description", "Description"],
                ["category", "Category"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">{label}</label>
                  <select
                    className={selectCls}
                    value={mapping[key]}
                    onChange={(e) => setMapping((m) => ({ ...m, [key]: Number(e.target.value) }))}
                  >
                    <option value={NONE}>{key === "date" || key === "amount" ? "— Select —" : "— None —"}</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep("upload")}><ArrowLeft className="w-4 h-4" /> Back</Button>
              <Button
                variant="brand"
                disabled={mapping.date === NONE || mapping.amount === NONE}
                onClick={() => setStep("preview")}
              >
                Preview
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="text-text-secondary">{stats.valid} valid of {stats.total}</span>
              {stats.inflows > 0 && polarity !== "out" && (
                <span className="flex items-center gap-1.5 text-status-warn" title="Positive amounts look like deposits/refunds — set Import to “Money out only” to skip them.">
                  <AlertTriangle className="w-3.5 h-3.5" /> {stats.inflows} look like income
                </span>
              )}
              {stats.dupes > 0 && (
                <span className="flex items-center gap-1.5 text-status-warn"><Copy className="w-3.5 h-3.5" /> {stats.dupes} likely duplicate{stats.dupes === 1 ? "" : "s"}</span>
              )}
              <div className="flex items-center gap-4 ml-auto">
                <label className="flex items-center gap-2 text-text-secondary">
                  Import
                  <select
                    className={selectClsSmall}
                    value={polarity}
                    onChange={(e) => setPolarity(e.target.value as Polarity)}
                    aria-label="Which rows to import"
                  >
                    <option value="all">All rows</option>
                    <option value="out">Money out only</option>
                    <option value="in">Money in only</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-text-secondary">
                  Skip duplicates
                  <Toggle checked={skipDuplicates} onChange={setSkipDuplicates} ariaLabel="Skip duplicates" />
                </label>
              </div>
            </div>

            <div className="max-h-[40vh] overflow-auto rounded-lg border border-border-subtle">
              <table className="w-full text-sm text-left">
                <thead className="text-[11px] uppercase tracking-wide text-text-secondary sticky top-0 bg-bg-elevated border-b border-border-subtle">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 200).map((p, i) => (
                    <tr key={i} className="border-b border-border-subtle/50 last:border-0">
                      <td className="px-3 py-1.5 whitespace-nowrap">{p.occurred_on ? formatBusinessDate(p.occurred_on) : <span className="text-status-alert">—</span>}</td>
                      <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">{p.amount != null ? formatMoney(p.amount) : <span className="text-status-alert">—</span>}</td>
                      <td className="px-3 py-1.5 max-w-[14rem] truncate text-text-secondary">{p.description ?? "—"}</td>
                      <td className="px-3 py-1.5 text-text-secondary">
                        {p.category ?? (p.category_legacy
                          ? <span className="text-status-warn" title={`“${p.category_legacy}” isn't a known category — imports as Needs review`}>Needs review</span>
                          : "—")}
                      </td>
                      <td className="px-3 py-1.5">
                        {!p.valid ? (
                          <span className="inline-flex items-center gap-1 text-status-alert text-xs"><AlertTriangle className="w-3.5 h-3.5" /> Invalid</span>
                        ) : !passesPolarity(polarity, p.inflow) ? (
                          <span className="text-text-tertiary text-xs">Skipped</span>
                        ) : p.inflow ? (
                          <Badge variant="outline" className="text-status-warn border-status-warn/40">Income</Badge>
                        ) : p.duplicate ? (
                          <Badge variant="outline" className="text-status-warn border-status-warn/40">Duplicate</Badge>
                        ) : (
                          <Badge variant="brand">New</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.length > 200 && <p className="text-xs text-text-tertiary">Showing first 200 of {parsed.length} rows; all valid rows import.</p>}

            <div className="flex justify-between pt-2 border-t border-border-subtle">
              <Button variant="ghost" onClick={() => setStep("map")}><ArrowLeft className="w-4 h-4" /> Back</Button>
              <Button variant="brand" disabled={importing || stats.toImport === 0} onClick={runImport}>
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                {importing ? "Importing…" : `Import ${stats.toImport} expense${stats.toImport === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
