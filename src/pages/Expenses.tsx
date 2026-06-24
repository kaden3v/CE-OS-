import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Plus, UploadCloud, Search, FileText, Trash2, X, Sparkles, ScanLine } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/hooks/useEntity";
import { supabase } from "@/lib/supabase";
import { friendlyDbError } from "@/lib/dbErrors";
import { mapToScheduleC } from "@/lib/scheduleC";
import { monthRange, quarterRange, ytdRange } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { uploadReceipt, removeReceipt, RECEIPT_ACCEPT, isAcceptedReceipt, receiptTooLarge } from "@/lib/receipts";
import { ExpenseModal } from "@/components/expenses/ExpenseModal";
import { ExpenseTable, type SortKey, type SortState } from "@/components/expenses/ExpenseTable";
import { CsvImportWizard, type ImportRow } from "@/components/expenses/CsvImportWizard";
import { ReceiptDrawer } from "@/components/expenses/ReceiptDrawer";
import { CategorySelect } from "@/components/expenses/CategorySelect";
import { SmartCategorizeModal, type SuggestionItem } from "@/components/expenses/SmartCategorizeModal";
import { suggestForRows } from "@/lib/expenseCategorization";
import { scanReceipt, type ReceiptDraft } from "@/lib/receiptScan";
import { summarizeWrites } from "@/lib/writeSummary";
import { isManaged, type Expense, type ExpenseFormData, type Vendor } from "@/components/expenses/types";

const SEED: Expense[] = [];

type Preset = "this_month" | "last_month" | "this_quarter" | "ytd" | "all" | "custom";
const PRESETS: { value: Preset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];

const resolveRange = (preset: Preset, from: string, to: string): { from?: string; to?: string } => {
  switch (preset) {
    case "this_month": return monthRange(0);
    case "last_month": return monthRange(-1);
    case "this_quarter": return quarterRange();
    case "ytd": return ytdRange();
    case "custom": return { from: from || undefined, to: to || undefined };
    default: return {};
  }
};

const sumInRange = (list: Expense[], r: { from?: string; to?: string }): number =>
  list.reduce((s, e) => (((!r.from || e.occurred_on >= r.from) && (!r.to || e.occurred_on <= r.to)) ? s + Number(e.amount) : s), 0);

const selectCls =
  "bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong";

export default function Expenses() {
  const { user, activeOrgId } = useAuth();
  const { addToast } = useApp();
  const location = useLocation();

  const { data: expenses, add, update, updateMany, remove, removeMany, isLoading, refresh } = useEntity<Expense>("expenses", SEED, {
    orderBy: "occurred_on",
    toRow: (e) => ({
      vendor_id: e.vendor_id,
      amount: e.amount,
      category: e.category,
      schedule_c_category: e.schedule_c_category,
      payment_method: e.payment_method,
      deductible: e.deductible,
      source: e.source,
      description: e.description,
      occurred_on: e.occurred_on,
      receipt_url: e.receipt_url,
    }),
  });
  const { data: vendors, add: addVendor } = useEntity<Vendor>("vendors", [], { toRow: (v) => ({ name: v.name }) });

  // UI state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>({ key: "occurred_on", dir: "desc" });

  // Filters
  const [preset, setPreset] = useState<Preset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [search, setSearch] = useState("");

  // Receipt attach (from the row paperclip on a row that has none)
  const attachRef = useRef<HTMLInputElement>(null);
  const [attachTarget, setAttachTarget] = useState<Expense | null>(null);

  // Scan receipt → drafted expense
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanDraft, setScanDraft] = useState<ReceiptDraft | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);

  // Rows whose inline suggestion is mid-write — guards against double-click dupes.
  const [pendingSuggestionIds, setPendingSuggestionIds] = useState<Set<string>>(new Set());

  // Opened from a Finances Overview quick action.
  useEffect(() => {
    if ((location.state as { openNew?: boolean } | null)?.openNew) openCreate();
  }, [location.state]);

  const clearScan = () => {
    setScanDraft(null);
    setScanFile(null);
  };

  const openCreate = () => {
    setEditing(null);
    clearScan();
    setModalOpen(true);
  };

  // Scan a receipt, then open the create modal pre-filled with whatever we read.
  const handleScanFile = async (file: File) => {
    if (!isAcceptedReceipt(file)) {
      addToast({ title: "Unsupported file", description: "Use an image (PNG/JPEG/WebP/HEIC) or PDF.", status: "warn" });
      return;
    }
    if (receiptTooLarge(file)) {
      addToast({ title: "File too large", description: "Max 10 MB.", status: "warn" });
      return;
    }
    const draft = await scanReceipt(file);
    setScanFile(file);
    setScanDraft(draft);
    setEditing(null);
    setModalOpen(true);
  };

  // ---- Derived: filtered + sorted rows, totals -----------------------------
  const range = useMemo(() => resolveRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (range.from && e.occurred_on < range.from) return false;
      if (range.to && e.occurred_on > range.to) return false;
      if (catFilter && e.category !== catFilter) return false;
      if (vendorFilter && e.vendor_id !== vendorFilter) return false;
      if (sourceFilter && (e.source ?? "manual") !== sourceFilter) return false;
      if (uncategorizedOnly && e.category) return false;
      if (q && !(e.description ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [expenses, range, catFilter, vendorFilter, sourceFilter, uncategorizedOnly, search]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    // Match the table's label: live vendor name, else the denormalized
    // vendor_name kept on synced/orphaned rows — so vendor sort isn't blank.
    const vName = (e: Expense) => {
      if (e.vendor_id) {
        const v = vendors.find((x) => x.id === e.vendor_id);
        if (v) return v.name;
      }
      return e.vendor_name ?? "";
    };
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case "amount": cmp = Number(a.amount) - Number(b.amount); break;
        case "category": cmp = (a.category ?? "").localeCompare(b.category ?? ""); break;
        case "vendor": cmp = vName(a).localeCompare(vName(b)); break;
        default: cmp = a.occurred_on.localeCompare(b.occurred_on);
      }
      return cmp * dir;
    });
  }, [filtered, sort, vendors]);

  const filteredTotal = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount), 0), [filtered]);

  // Stat cards
  const sumMonth = useMemo(() => sumInRange(expenses, monthRange(0)), [expenses]);
  const sumYtd = useMemo(() => sumInRange(expenses, ytdRange()), [expenses]);
  const topCategory = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const e of expenses) if (e.category) byCat[e.category] = (byCat[e.category] ?? 0) + Number(e.amount);
    return Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  }, [expenses]);
  const uncategorizedCount = useMemo(() => expenses.filter((e) => !e.category).length, [expenses]);

  // ---- Auto-categorization (learned from the ledger's own history) ---------
  const suggestions = useMemo(() => suggestForRows(expenses), [expenses]);
  const suggestionCategoryById = useMemo(
    () => new Map([...suggestions].map(([id, s]) => [id, s.category])),
    [suggestions],
  );
  const suggestionItems = useMemo<SuggestionItem[]>(() => {
    if (!smartOpen) return []; // only materialize the modal's row list when it's open
    const byId = new Map(expenses.map((e) => [e.id, e]));
    return [...suggestions.entries()]
      .map(([id, suggestion]) => {
        const expense = byId.get(id);
        return expense ? { expense, suggestion } : null;
      })
      .filter((it): it is SuggestionItem => it !== null);
  }, [suggestions, expenses, smartOpen]);

  // Write a category (and its Schedule C line) to one row — sync-safe even on
  // managed rows, so the inline accept works for Etsy/imported entries too.
  // Guarded so a double-click on the chip can't fire two writes.
  const applySuggestion = async (id: string, category: string) => {
    if (pendingSuggestionIds.has(id)) return;
    setPendingSuggestionIds((p) => { const n = new Set(p); n.add(id); return n; });
    try {
      const schedule_c_category = mapToScheduleC(category).scheduleC;
      const r = await update(id, { category, schedule_c_category } as Partial<Expense>);
      if (!r.ok) {
        addToast({ title: "Couldn't categorize", description: friendlyDbError({ code: r.code } as any), status: "alert" });
        return;
      }
      addToast({ title: "Categorized", description: category, status: "ok" });
    } finally {
      setPendingSuggestionIds((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  // Apply a batch of suggestions. Rows sharing a category are one query each
  // (suggestions cluster heavily), so N selections collapse to a few writes.
  const applySuggestions = async (selections: { id: string; category: string }[]) => {
    const byCategory = new Map<string, string[]>();
    for (const { id, category } of selections) {
      const ids = byCategory.get(category) ?? [];
      ids.push(id);
      byCategory.set(category, ids);
    }
    let ok = 0;
    let failed = 0;
    for (const [category, ids] of byCategory) {
      const schedule_c_category = mapToScheduleC(category).scheduleC;
      const r = await updateMany(ids, { category, schedule_c_category } as Partial<Expense>);
      if (r.ok) ok += ids.length;
      else failed += ids.length;
    }
    setSmartOpen(false);
    addToast(summarizeWrites(ok, failed, { verbPast: "categorized" }));
  };

  // ---- Selection -----------------------------------------------------------
  // Managed rows (Etsy/recurring/supplies/mileage) are read-only here, so only
  // hand-entered rows are selectable — bulk delete/recategorize can never touch
  // a system-generated row.
  const selectableRows = useMemo(() => sorted.filter((e) => !isManaged(e)), [sorted]);
  const allSelected = selectableRows.length > 0 && selectableRows.every((e) => selected.has(e.id));
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableRows.map((e) => e.id)));
  const clearSelection = () => setSelected(new Set());

  const onSort = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "category" || k === "vendor" ? "asc" : "desc" }));

  // ---- Receipt resolution for create/edit ----------------------------------
  // Uploads the new receipt (if any) but does NOT delete the old one yet — the
  // caller removes `staleToRemove` only after the DB write succeeds, so a failed
  // write never destroys the existing receipt or orphans the new upload.
  const resolveReceipt = async (
    base: Expense | null,
    file: File | null,
    removeFlag: boolean,
  ): Promise<{ url: string | null | undefined; ok: boolean; staleToRemove: string | null }> => {
    if (file) {
      if (!activeOrgId) return { url: undefined, ok: false, staleToRemove: null };
      try {
        const path = await uploadReceipt(activeOrgId, file);
        return { url: path, ok: true, staleToRemove: base?.receipt_url ?? null };
      } catch (err) {
        addToast({ title: "Receipt upload failed", description: err instanceof Error ? err.message : "Try again", status: "alert" });
        return { url: undefined, ok: false, staleToRemove: null };
      }
    }
    if (removeFlag && base?.receipt_url) {
      return { url: null, ok: true, staleToRemove: base.receipt_url };
    }
    return { url: undefined, ok: true, staleToRemove: null };
  };

  // ---- Create / edit via modal ---------------------------------------------
  const handleModalSubmit = async (data: ExpenseFormData, receipt: { file: File | null; remove: boolean }): Promise<boolean> => {
    const { url, ok, staleToRemove } = await resolveReceipt(editing, receipt.file, receipt.remove);
    if (!ok) return false;

    if (editing) {
      const patch: Partial<Expense> = { ...data };
      if (url !== undefined) patch.receipt_url = url;
      const r = await update(editing.id, patch);
      if (!r.ok) {
        if (typeof url === "string") await removeReceipt(url); // clean up the orphaned new upload
        addToast({ title: "Couldn't save", description: friendlyDbError({ code: r.code } as any), status: "alert" });
        return false;
      }
      if (staleToRemove) await removeReceipt(staleToRemove); // old receipt is now safe to drop
      addToast({ title: "Expense updated", status: "ok" });
      return true;
    }

    const r = await add({
      id: crypto.randomUUID(),
      ...data,
      receipt_url: url ?? null,
      source: "manual",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Expense);
    if (r.ok === false) {
      if (typeof url === "string") await removeReceipt(url); // clean up the orphaned new upload
      addToast({ title: "Couldn't save expense", description: friendlyDbError({ code: r.code } as any), status: "alert" });
      return false;
    }
    addToast({ title: "Expense logged", description: `${formatMoney(data.amount)} · ${data.category ?? "Uncategorized"}`, status: "ok" });
    return true;
  };

  const createVendor = async (name: string): Promise<Vendor | null> => {
    const r = await addVendor({
      id: crypto.randomUUID(),
      name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Vendor);
    if (r.ok === false) {
      addToast({ title: "Couldn't add vendor", description: friendlyDbError({ code: r.code } as any), status: "alert" });
      return null;
    }
    addToast({ title: "Vendor added", description: name, status: "ok" });
    return r.row;
  };

  // ---- Delete (single + bulk) ----------------------------------------------
  const deleteExpense = async (e: Expense) => {
    if (!confirm("Delete this expense?")) return;
    const r = await remove(e.id);
    if (!r.ok) {
      addToast({ title: "Couldn't delete", description: friendlyDbError({ code: r.code } as any), status: "alert" });
      return;
    }
    if (e.receipt_url) await removeReceipt(e.receipt_url); // only after the row is gone
    setSelected((prev) => { const n = new Set(prev); n.delete(e.id); return n; });
    addToast({ title: "Expense deleted", status: "info" });
  };

  const bulkDelete = async () => {
    const targets = expenses.filter((e) => selected.has(e.id) && !isManaged(e));
    if (targets.length === 0) return;
    if (!confirm(`Delete ${targets.length} expense${targets.length === 1 ? "" : "s"}?`)) return;
    const r = await removeMany(targets.map((e) => e.id));
    clearSelection();
    if (!r.ok) {
      addToast({ title: "Couldn't delete", description: friendlyDbError({ code: r.code } as any), status: "alert" });
      return;
    }
    for (const e of targets) if (e.receipt_url) await removeReceipt(e.receipt_url); // only after the rows are gone
    addToast(summarizeWrites(targets.length, 0, { verbPast: "deleted", successStatus: "info" }));
  };

  const bulkRecategorize = async (category: string) => {
    if (!category) return;
    const targets = expenses.filter((e) => selected.has(e.id) && !isManaged(e));
    if (targets.length === 0) return;
    const schedule_c_category = mapToScheduleC(category).scheduleC;
    const r = await updateMany(targets.map((e) => e.id), { category, schedule_c_category } as Partial<Expense>);
    clearSelection();
    if (!r.ok) {
      addToast({ title: "Couldn't re-categorize", description: friendlyDbError({ code: r.code } as any), status: "alert" });
      return;
    }
    addToast({ ...summarizeWrites(targets.length, 0, { verbPast: "re-categorized" }), description: category });
  };

  // ---- Attach receipt to an existing row -----------------------------------
  const onAttachReceipt = (e: Expense) => {
    setAttachTarget(e);
    attachRef.current?.click();
  };
  const handleAttachFile = async (file: File) => {
    const target = attachTarget;
    setAttachTarget(null);
    if (!target || !activeOrgId) return;
    if (!isAcceptedReceipt(file)) { addToast({ title: "Unsupported file", status: "warn" }); return; }
    if (receiptTooLarge(file)) { addToast({ title: "File too large", description: "Max 10 MB.", status: "warn" }); return; }
    let path: string;
    try {
      path = await uploadReceipt(activeOrgId, file);
    } catch (err) {
      addToast({ title: "Upload failed", description: err instanceof Error ? err.message : "Try again", status: "alert" });
      return;
    }
    const r = await update(target.id, { receipt_url: path } as Partial<Expense>);
    if (!r.ok) { await removeReceipt(path); addToast({ title: "Couldn't attach", status: "alert" }); return; }
    addToast({ title: "Receipt attached", status: "ok" });
  };

  // ---- CSV import ----------------------------------------------------------
  const importRows = async (rows: ImportRow[]): Promise<number> => {
    if (!supabase || !user || !activeOrgId) return 0;
    const payload = rows.map((r) => ({
      user_id: user.id,
      org_id: activeOrgId,
      amount: r.amount,
      occurred_on: r.occurred_on,
      description: r.description,
      category: r.category,
      category_legacy: r.category_legacy,
      schedule_c_category: r.category ? mapToScheduleC(r.category).scheduleC : null,
      source: "manual",
      deductible: true,
    }));
    const { data: inserted, error } = await supabase.from("expenses").insert(payload).select();
    if (error) {
      addToast({ title: "Import failed", description: friendlyDbError(error), status: "alert" });
      return 0;
    }
    await refresh();
    return inserted?.length ?? rows.length;
  };

  const isEmpty = !isLoading && expenses.length === 0;
  const showCustom = preset === "custom";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col relative">
      {/* hidden input for attach-to-existing-row */}
      <input
        ref={attachRef}
        type="file"
        accept={RECEIPT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleAttachFile(f);
          e.target.value = "";
        }}
      />
      {/* hidden input for scan-receipt → drafted expense. No `capture` attr: on
          mobile that forces the camera and hides the gallery/Files picker, which
          would block selecting a saved photo or a PDF receipt. */}
      <input
        ref={scanRef}
        type="file"
        accept={RECEIPT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleScanFile(f);
          e.target.value = "";
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Expenses</h1>
          <p className="text-sm text-text-secondary">A working ledger — categorize, attach receipts, import.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => scanRef.current?.click()}>
            <ScanLine className="w-4 h-4" /> Scan receipt
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <UploadCloud className="w-4 h-4" /> Import CSV
          </Button>
          <Button variant="brand" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Add Expense
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6">
        <StatTile label="This month" value={formatMoney(sumMonth)} />
        <StatTile label="YTD total" value={formatMoney(sumYtd)} />
        <StatTile label="Top category" value={topCategory} />
        <button
          type="button"
          onClick={() => { setUncategorizedOnly(true); setPreset("all"); setCatFilter(""); }}
          aria-label={`Filter to ${uncategorizedCount} uncategorized expenses`}
          className="text-left transition-transform hover:-translate-y-0.5"
        >
          <StatTile
            label="Uncategorized"
            value={String(uncategorizedCount)}
            trend={uncategorizedCount > 0 ? { value: "review", direction: "down", label: "tap to filter" } : undefined}
          />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select className={selectCls} value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
          {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {showCustom && (
          <>
            <Input type="date" className="w-auto" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span className="text-text-tertiary text-sm">to</span>
            <Input type="date" className="w-auto" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </>
        )}
        <div className="w-40">
          <CategorySelect value={catFilter} onChange={(c) => { setCatFilter(c); setUncategorizedOnly(false); }} blankLabel="All categories" />
        </div>
        <select className={selectCls} value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
          <option value="">All vendors</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select className={selectCls} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          <option value="">All sources</option>
          <option value="manual">Manual</option>
          <option value="etsy">Etsy</option>
          <option value="subscription">Subscriptions</option>
          <option value="supply_purchase">Supplies</option>
          <option value="mileage">Mileage</option>
        </select>
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input className="pl-9" placeholder="Search memo…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {(uncategorizedOnly || catFilter || vendorFilter || sourceFilter || search || preset !== "all") && (
          <button
            onClick={() => { setPreset("all"); setCatFilter(""); setVendorFilter(""); setSourceFilter(""); setSearch(""); setUncategorizedOnly(false); setCustomFrom(""); setCustomTo(""); }}
            className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-3 px-3 py-2 rounded-lg bg-bg-active/60 border border-border-subtle">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <div className="w-44">
              <CategorySelect value="" onChange={(c) => void bulkRecategorize(c)} blankLabel="Re-categorize…" />
            </div>
            <Button variant="outline" onClick={bulkDelete} className="text-status-alert">
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
            <button onClick={clearSelection} className="text-text-secondary hover:text-text-primary"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Smart-categorize nudge — learned from how you've categorized before */}
      {suggestions.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-3 px-3 py-2.5 rounded-lg bg-accent-brand/10 border border-accent-brand/30">
          <Sparkles className="w-4 h-4 text-accent-brand shrink-0" />
          <span className="text-sm">
            <span className="font-medium">{suggestions.size}</span>{" "}
            {suggestions.size === 1 ? "expense can" : "expenses can"} be auto-categorized from your history.
          </span>
          <Button variant="brand" className="ml-auto" onClick={() => setSmartOpen(true)}>
            Review &amp; apply
          </Button>
        </div>
      )}

      <Card className="flex-1 flex flex-col min-h-0 mb-12">
        {isLoading && <LoadingTable cols={9} rows={8} />}
        {isEmpty && (
          <EmptyState
            icon={FileText}
            title="No expenses yet"
            description="Log your first expense or import a CSV from your bank or marketplace."
            action={<Button variant="outline" onClick={openCreate}>Add Expense</Button>}
          />
        )}
        {!isLoading && !isEmpty && (
          <ExpenseTable
            rows={sorted}
            vendors={vendors}
            selected={selected}
            allSelected={allSelected}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            sort={sort}
            onSort={onSort}
            onStartEdit={(id) => { const e = sorted.find((x) => x.id === id); if (e) { clearScan(); setEditing(e); setModalOpen(true); } }}
            onDelete={deleteExpense}
            onOpenReceipt={setDrawerPath}
            onAttachReceipt={onAttachReceipt}
            suggestions={suggestionCategoryById}
            onApplySuggestion={applySuggestion}
            pendingSuggestionIds={pendingSuggestionIds}
            total={filteredTotal}
          />
        )}
      </Card>

      <ExpenseModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); clearScan(); }}
        vendors={vendors}
        editing={editing}
        draft={scanDraft}
        initialReceiptFile={scanFile}
        onSubmit={handleModalSubmit}
        onCreateVendor={createVendor}
      />
      <CsvImportWizard open={importOpen} onClose={() => setImportOpen(false)} existing={expenses} onImport={importRows} />
      <SmartCategorizeModal
        open={smartOpen}
        onClose={() => setSmartOpen(false)}
        items={suggestionItems}
        vendors={vendors}
        onApply={applySuggestions}
      />
      <ReceiptDrawer path={drawerPath} onClose={() => setDrawerPath(null)} />
    </div>
  );
}
