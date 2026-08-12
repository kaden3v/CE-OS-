import { useMemo, useRef, useState } from "react";
import { UploadCloud, Loader2, AlertTriangle, Copy, ArrowLeft, Wand2, Sparkles, Undo2, History } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { useApp } from "@/contexts/AppContext";
import { parseCsv, parseCsvAmount, parseCsvDate } from "@/lib/csv";
import { useCategoryBook } from "@/contexts/ExpenseCategoriesContext";
import {
  assignCsvExternalIds,
  categorizeImportRow,
  isInflow,
  passesPolarity,
  type ImportCategorySource,
  type Polarity,
} from "@/lib/expenseImport";
import { buildCategoryModel } from "@/lib/expenseCategorization";
import type { ExpenseRuleFields } from "@/lib/expenseRules";
import { formatMoney } from "@/lib/format";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/dates";
import type { Tables } from "@/lib/database.types";
import type { Expense } from "./types";
import { Select } from "@/components/ui/Select";

export type ImportBatch = Tables<"expense_import_batches">;

export interface ImportRow {
  occurred_on: string;
  amount: number;
  description: string | null;
  vendor_name: string | null;
  category: string | null;
  category_legacy: string | null;
  external_id: string;
  needs_review: boolean;
  /** Which stage categorized the row (rule/file/history) — for the summary toast. */
  category_source: ImportCategorySource | null;
  /** Vendor link applied by a rule, if any. */
  vendor_id: string | null;
}

interface CsvImportWizardProps {
  open: boolean;
  onClose: () => void;
  existing: Expense[];
  /** Active org — used to build deterministic external ids. */
  orgId: string | null;
  /** The org's rules, applied to each row before file/history categories. */
  rules: readonly ExpenseRuleFields[];
  /** Recent imports, newest first (drives the undo list on the upload step). */
  batches: ImportBatch[];
  onUndoBatch: (batch: ImportBatch) => Promise<void>;
  onImport: (rows: ImportRow[], fileName: string) => Promise<number>;
}

type Mapping = { date: number; amount: number; description: number; vendor: number; category: number };

const NONE = -1;
const selectCls =
  "w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong";
const selectClsSmall =
  "bg-bg-base border border-border-subtle rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-border-strong";

const guess = (headers: string[], re: RegExp): number => headers.findIndex((h) => re.test(h));

export function CsvImportWizard({
  open, onClose, existing, orgId, rules, batches, onUndoBatch, onImport,
}: CsvImportWizardProps) {
  const { addToast } = useApp();
  const book = useCategoryBook();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({ date: NONE, amount: NONE, description: NONE, vendor: NONE, category: NONE });
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [polarity, setPolarity] = useState<Polarity>("all");
  const [importing, setImporting] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setDataRows([]);
    setMapping({ date: NONE, amount: NONE, description: NONE, vendor: NONE, category: NONE });
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
      description: guess(head, /desc|memo|note|detail/i),
      vendor: guess(head, /vendor|merchant|payee|paid to|supplier/i),
      category: guess(head, /categ|type/i),
    });
    setStep("map");
  };

  // The history model learns from the loaded ledger once per open file.
  const model = useMemo(() => buildCategoryModel(existing, book.canonical), [existing, book]);
  const existingExternalIds = useMemo(
    () => new Set(existing.map((e) => e.external_id).filter((id): id is string => !!id)),
    [existing],
  );

  const parsed = useMemo(() => {
    if (mapping.date === NONE || mapping.amount === NONE) return [];
    const base = dataRows.map((r) => {
      const occurred_on = parseCsvDate(r[mapping.date] ?? "");
      const raw = parseCsvAmount(r[mapping.amount] ?? "");
      const amount = raw == null ? null : Math.abs(raw);
      const inflow = isInflow(raw); // positive = money in (deposit/refund), not an expense
      const description = mapping.description >= 0 ? (r[mapping.description] ?? "").trim() || null : null;
      const vendor_name = mapping.vendor >= 0 ? (r[mapping.vendor] ?? "").trim() || null : null;
      const fileCategoryRaw = mapping.category >= 0 ? (r[mapping.category] ?? "").trim() || null : null;
      const valid = !!occurred_on && amount != null && amount > 0;
      return { occurred_on, amount, inflow, description, vendor_name, fileCategoryRaw, valid };
    });

    // Deterministic idempotency keys over the valid rows, in file order — so the
    // same file always produces the same keys regardless of skip toggles.
    const validRows = base.filter((p) => p.valid);
    const ids = orgId
      ? assignCsvExternalIds(
          orgId,
          validRows.map((p) => ({ occurred_on: p.occurred_on as string, amount: p.amount as number, description: p.description })),
        )
      : validRows.map(() => "");
    let vi = 0;

    return base.map((p) => {
      if (!p.valid) {
        return { ...p, external_id: "", alreadyImported: false, duplicate: false,
          category: null as string | null, category_legacy: null as string | null,
          categorySource: null as ImportCategorySource | null, vendor_id: null as string | null, needs_review: true };
      }
      const external_id = ids[vi++];
      const alreadyImported = !!external_id && existingExternalIds.has(external_id);
      const duplicate = existing.some(
        (e) => e.occurred_on === p.occurred_on && Math.abs(Number(e.amount) - (p.amount as number)) < 0.005,
      );
      const cat = categorizeImportRow(
        { amount: p.amount as number, description: p.description, vendor_name: p.vendor_name, fileCategoryRaw: p.fileCategoryRaw },
        { book, rules, model },
      );
      return {
        ...p, external_id, alreadyImported, duplicate,
        category: cat.category, category_legacy: cat.category_legacy,
        categorySource: cat.categorySource, vendor_id: cat.vendor_id, needs_review: cat.needs_review,
      };
    });
  }, [dataRows, mapping, existing, existingExternalIds, orgId, book, rules, model]);

  const stats = useMemo(() => {
    const valid = parsed.filter((p) => p.valid);
    const inflows = valid.filter((p) => p.inflow);
    const eligible = valid.filter((p) => passesPolarity(polarity, p.inflow) && !p.alreadyImported);
    const already = valid.filter((p) => passesPolarity(polarity, p.inflow) && p.alreadyImported);
    const dupes = eligible.filter((p) => p.duplicate);
    const toImport = eligible.filter((p) => !skipDuplicates || !p.duplicate);
    const autoCategorized = toImport.filter((p) => p.categorySource != null);
    const skipReview = toImport.filter((p) => !p.needs_review);
    return {
      total: parsed.length,
      valid: valid.length,
      inflows: inflows.length,
      already: already.length,
      dupes: dupes.length,
      toImport: toImport.length,
      autoCategorized: autoCategorized.length,
      skipReview: skipReview.length,
    };
  }, [parsed, skipDuplicates, polarity]);

  const runImport = async () => {
    const rows: ImportRow[] = parsed
      .filter((p) => p.valid && passesPolarity(polarity, p.inflow) && !p.alreadyImported && (!skipDuplicates || !p.duplicate))
      .map((p) => ({
        occurred_on: p.occurred_on as string,
        amount: p.amount as number,
        description: p.description,
        vendor_name: p.vendor_name,
        category: p.category,
        category_legacy: p.category_legacy,
        external_id: p.external_id,
        needs_review: p.needs_review,
        category_source: p.categorySource,
        vendor_id: p.vendor_id,
      }));
    if (rows.length === 0) {
      addToast({ title: "Nothing to import", description: "No valid rows after filtering.", status: "warn" });
      return;
    }
    setImporting(true);
    const count = await onImport(rows, fileName);
    setImporting(false);
    if (count > 0) close();
  };

  const undoBatch = async (batch: ImportBatch) => {
    if (!confirm(`Undo “${batch.file_name || "import"}”? Its ${batch.row_count} imported expense${batch.row_count === 1 ? "" : "s"} will be deleted.`)) return;
    setUndoingId(batch.id);
    try {
      await onUndoBatch(batch);
    } finally {
      setUndoingId(null);
    }
  };

  const sourceBadge = (src: ImportCategorySource | null) => {
    if (src === "rule") {
      return <span className="inline-flex items-center gap-1 text-accent-brand" title="Categorized by one of your rules"><Wand2 className="w-3 h-3" /></span>;
    }
    if (src === "history") {
      return <span className="inline-flex items-center gap-1 text-accent-brand" title="Suggested from how you've categorized similar expenses"><Sparkles className="w-3 h-3" /></span>;
    }
    return null;
  };

  return (
    <Modal open={open} onClose={close} title="Import Expenses from CSV" size="xl">
      <div className="p-4">
        {step === "upload" && (
          <div className="space-y-4">
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
              <span className="text-xs text-text-tertiary">Bank or card statement, Etsy, Shopify, or spreadsheet export</span>
            </button>
            <p className="text-xs text-text-tertiary">
              Re-importing an overlapping statement is safe — rows you've already imported are recognized and skipped.
            </p>

            {batches.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wide text-text-secondary">
                  <History className="w-3.5 h-3.5" /> Recent imports
                </div>
                <ul className="divide-y divide-border-subtle/60 rounded-lg border border-border-subtle">
                  {batches.slice(0, 5).map((b) => (
                    <li key={b.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="truncate flex-1">{b.file_name || "CSV import"}</span>
                      <span className="text-xs text-text-tertiary whitespace-nowrap">
                        {b.row_count} {b.row_count === 1 ? "row" : "rows"} · {formatBusinessDateTime(b.created_at)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={undoingId === b.id || b.row_count === 0}
                        onClick={() => void undoBatch(b)}
                        title="Delete every expense this import created"
                      >
                        {undoingId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Undo
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                ["vendor", "Vendor / Merchant"],
                ["category", "Category"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">{label}</label>
                  <Select
                    className={selectCls}
                    value={mapping[key]}
                    onChange={(e) => setMapping((m) => ({ ...m, [key]: Number(e.target.value) }))}
                  >
                    <option value={NONE}>{key === "date" || key === "amount" ? "— Select —" : "— None —"}</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </Select>
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
              {stats.autoCategorized > 0 && (
                <span className="flex items-center gap-1.5 text-accent-brand" title="Categorized by your rules or from your history — the rest land uncategorized for review.">
                  <Wand2 className="w-3.5 h-3.5" /> {stats.autoCategorized} auto-categorized
                </span>
              )}
              {stats.already > 0 && (
                <span className="flex items-center gap-1.5 text-text-tertiary" title="These exact rows were imported before and are skipped automatically.">
                  <Copy className="w-3.5 h-3.5" /> {stats.already} already imported
                </span>
              )}
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
                  <Select
                    className={selectClsSmall}
                    value={polarity}
                    onChange={(e) => setPolarity(e.target.value as Polarity)}
                    aria-label="Which rows to import"
                  >
                    <option value="all">All rows</option>
                    <option value="out">Money out only</option>
                    <option value="in">Money in only</option>
                  </Select>
                </label>
                {/* Not a <label>: Toggle renders a role="switch" button that
                    carries its own accessible name, and a label pointing at a
                    button does nothing when clicked. */}
                <span className="flex items-center gap-2 text-text-secondary">
                  Skip duplicates
                  <Toggle checked={skipDuplicates} onChange={setSkipDuplicates} ariaLabel="Skip duplicates" />
                </span>
              </div>
            </div>

            <div className="max-h-[40vh] overflow-auto rounded-lg border border-border-subtle">
              <table className="w-full text-sm text-left">
                <thead className="text-[11px] uppercase tracking-wide text-text-secondary sticky top-0 bg-bg-elevated border-b border-border-subtle">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Vendor</th>
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
                      <td className="px-3 py-1.5 max-w-[9rem] truncate text-text-secondary">{p.vendor_name ?? "—"}</td>
                      <td className="px-3 py-1.5 max-w-[12rem] truncate text-text-secondary">{p.description ?? "—"}</td>
                      <td className="px-3 py-1.5 text-text-secondary">
                        <span className="inline-flex items-center gap-1.5">
                          {p.category ?? (p.category_legacy
                            ? <span className="text-status-warn" title={`“${p.category_legacy}” isn't a known category — imports as Needs review`}>Needs review</span>
                            : <span className="text-text-tertiary">Needs review</span>)}
                          {sourceBadge(p.categorySource)}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        {!p.valid ? (
                          <span className="inline-flex items-center gap-1 text-status-alert text-xs"><AlertTriangle className="w-3.5 h-3.5" /> Invalid</span>
                        ) : p.alreadyImported ? (
                          <span className="text-text-tertiary text-xs">Already imported</span>
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
            <p className="text-xs text-text-tertiary">
              Imported rows land in the review queue unless a rule filed them — a quick glance later keeps the books trustworthy.
            </p>

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
