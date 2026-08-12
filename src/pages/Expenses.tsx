import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Plus, UploadCloud, Search, FileText, Trash2, X, Sparkles, ScanLine, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingTable, EmptyState, ErrorState } from "@/components/ui/StateRenderer";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/hooks/useEntity";
import { supabase } from "@/lib/supabase";
import { friendlyDbError } from "@/lib/dbErrors";
import { logActivity } from "@/lib/activity";
import { useCategoryBook } from "@/contexts/ExpenseCategoriesContext";
import { monthRange, quarterRange, ytdRange } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { uploadReceipt, removeReceipt, RECEIPT_ACCEPT, isAcceptedReceipt, receiptTooLarge } from "@/lib/receipts";
import { ExpenseModal } from "@/components/expenses/ExpenseModal";
import { ExpenseTable, type SortKey, type SortState } from "@/components/expenses/ExpenseTable";
import { CsvImportWizard, type ImportBatch, type ImportRow } from "@/components/expenses/CsvImportWizard";
import { ReceiptDrawer } from "@/components/expenses/ReceiptDrawer";
import { CategorySelect } from "@/components/expenses/CategorySelect";
import { SmartCategorizeModal, type SuggestionItem } from "@/components/expenses/SmartCategorizeModal";
import { RuleModal, type ExpenseRule, type RuleFormData } from "@/components/expenses/RuleModal";
import { suggestForRows } from "@/lib/expenseCategorization";
import { applyRules, matchesRule } from "@/lib/expenseRules";
import { scanReceipt, type ReceiptDraft } from "@/lib/receiptScan";
import { summarizeWrites } from "@/lib/writeSummary";
import { isManaged, needsReview, type Expense, type ExpenseFormData, type Vendor } from "@/components/expenses/types";
import { Select } from "@/components/ui/Select";
import { useConfirm } from "@/components/ui/ConfirmDialog";

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
  const confirm = useConfirm();
  const { user, activeOrgId } = useAuth();
  const { addToast } = useApp();
  const location = useLocation();
  const book = useCategoryBook();

  const { data: expenses, add, update, updateMany, remove, removeMany, isLoading, error, refresh } = useEntity<Expense>("expenses", SEED, {
    orderBy: "occurred_on",
    toRow: (e) => ({
      vendor_id: e.vendor_id,
      amount: e.amount,
      category: e.category,
      schedule_c_category: e.schedule_c_category,
      schedule_f_category: e.schedule_f_category,
      payment_method: e.payment_method,
      deductible: e.deductible,
      source: e.source,
      description: e.description,
      occurred_on: e.occurred_on,
      receipt_url: e.receipt_url,
      needs_review: e.needs_review,
    }),
  });
  const { data: vendors, add: addVendor } = useEntity<Vendor>("vendors", [], { toRow: (v) => ({ name: v.name }) });
  const { data: rules, add: addRule } = useEntity<ExpenseRule>("expense_rules", [], {
    orderBy: "priority",
    ascending: true,
    toRow: (r) => ({
      active: r.active,
      priority: r.priority,
      match_field: r.match_field,
      match_value: r.match_value,
      amount_min: r.amount_min,
      amount_max: r.amount_max,
      set_category: r.set_category,
      set_vendor_id: r.set_vendor_id,
      mark_reviewed: r.mark_reviewed,
    }),
  });
  const { data: batches, remove: removeBatch, refresh: refreshBatches } = useEntity<ImportBatch>("expense_import_batches", [], {
    orderBy: "created_at",
  });

  // UI state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>({ key: "occurred_on", dir: "desc" });

  // Rule creation from a ledger row
  const [ruleOpen, setRuleOpen] = useState(false);
  const [rulePrefill, setRulePrefill] = useState<Partial<RuleFormData> | null>(null);

  // Filters
  const [preset, setPreset] = useState<Preset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [search, setSearch] = useState("");

  // Receipt attach (from the row paperclip on a row that has none)
  const attachRef = useRef<HTMLInputElement>(null);
  const [attachTarget, setAttachTarget] = useState<Expense | null>(null);

  // Scan receipt → drafted expense
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanDraft, setScanDraft] = useState<ReceiptDraft | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);

  // Rows whose inline suggestion is mid-write — guards against double-click dupes.
  const [pendingSuggestionIds, setPendingSuggestionIds] = useState<Set<string>>(new Set());

  // Opened from a Finances Overview quick action / alert.
  useEffect(() => {
    const state = location.state as { openNew?: boolean; review?: boolean } | null;
    if (state?.openNew) openCreate();
    if (state?.review) {
      setReviewOnly(true);
      setPreset("all");
    }
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
    setScanning(true);
    let draft = await scanReceipt(file, { categories: book.names });
    setScanning(false);
    // The user's rules outrank the scanner's category guess. Amount-bounded
    // rules only apply when the scan actually read an amount.
    const applicable = draft.amount != null
      ? rules
      : rules.filter((r) => r.amount_min == null && r.amount_max == null);
    const matched = applyRules(applicable, {
      description: draft.memo ?? draft.vendor_name,
      vendor_name: draft.vendor_name,
      amount: draft.amount ?? 0,
    });
    if (matched) {
      draft = { ...draft, category: book.canonical(matched.set_category) ?? matched.set_category };
    }
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
      if (reviewOnly && !needsReview(e)) return false;
      if (q && !(e.description ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [expenses, range, catFilter, vendorFilter, sourceFilter, reviewOnly, search]);

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
  // Six-month spend shape under the This-month figure.
  const monthSpark = useMemo(
    () => [-5, -4, -3, -2, -1, 0].map((off) => sumInRange(expenses, monthRange(off))),
    [expenses],
  );
  const topCategory = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const e of expenses) if (e.category) byCat[e.category] = (byCat[e.category] ?? 0) + Number(e.amount);
    return Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  }, [expenses]);
  const reviewCount = useMemo(() => expenses.filter((e) => needsReview(e)).length, [expenses]);

  // ---- Auto-categorization (learned from the ledger's own history) ---------
  const suggestions = useMemo(() => suggestForRows(expenses, { canonical: book.canonical }), [expenses, book]);
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

  // Categorizing a row (inline, bulk, or via the modal) also clears its review
  // flag — a human just made a decision about it.
  const categoryPatch = (category: string): Partial<Expense> => ({
    category,
    schedule_c_category: book.scheduleCFor(category),
    schedule_f_category: book.scheduleFFor(category),
    needs_review: false,
  });

  // Write a category (and its tax lines) to one row — sync-safe even on
  // managed rows, so the inline accept works for Etsy/imported entries too.
  // Guarded so a double-click on the chip can't fire two writes.
  const applySuggestion = async (id: string, category: string) => {
    if (pendingSuggestionIds.has(id)) return;
    setPendingSuggestionIds((p) => { const n = new Set(p); n.add(id); return n; });
    try {
      const r = await update(id, categoryPatch(category));
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
      const r = await updateMany(ids, categoryPatch(category));
      if (r.ok) ok += ids.length;
      else failed += ids.length;
    }
    setSmartOpen(false);
    addToast(summarizeWrites(ok, failed, { verbPast: "categorized" }));
  };

  // ---- Review queue --------------------------------------------------------
  const markReviewed = async (e: Expense) => {
    const r = await update(e.id, { needs_review: false } as Partial<Expense>);
    if (!r.ok) {
      addToast({ title: "Couldn't update", description: friendlyDbError({ code: r.code } as any), status: "alert" });
      return;
    }
    addToast({ title: "Marked reviewed", status: "ok" });
  };

  const bulkMarkReviewed = async () => {
    const targets = expenses.filter((e) => selected.has(e.id) && e.needs_review);
    if (targets.length === 0) return;
    const r = await updateMany(targets.map((e) => e.id), { needs_review: false } as Partial<Expense>);
    clearSelection();
    if (!r.ok) {
      addToast({ title: "Couldn't update", description: friendlyDbError({ code: r.code } as any), status: "alert" });
      return;
    }
    addToast(summarizeWrites(targets.length, 0, { verbPast: "marked reviewed" }));
  };

  const selectedNeedingReview = useMemo(
    () => expenses.some((e) => selected.has(e.id) && e.needs_review),
    [expenses, selected],
  );

  // ---- Selection -----------------------------------------------------------
  // Managed rows (Etsy/recurring/supplies/mileage) are read-only here, so only
  // hand-entered and CSV-imported rows are selectable — bulk delete/recategorize
  // can never touch a system-generated row.
  const selectableRows = useMemo(() => sorted.filter((e) => !isManaged(e)), [sorted]);
  const allSelected = selectableRows.length > 0 && selectableRows.every((e) => selected.has(e.id));
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
      // A hand edit is a review: the flag clears alongside whatever changed.
      const patch: Partial<Expense> = { ...data, needs_review: false };
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

  // ---- Rules ---------------------------------------------------------------
  const openRuleFromExpense = (e: Expense) => {
    const vendorLabel = e.vendor_id ? vendors.find((v) => v.id === e.vendor_id)?.name ?? e.vendor_name : e.vendor_name;
    setRulePrefill({
      match_field: vendorLabel ? "vendor" : "memo",
      match_value: vendorLabel ?? e.description ?? "",
      set_category: e.category ?? "",
      set_vendor_id: e.vendor_id,
    });
    setRuleOpen(true);
  };

  const reviewables = useMemo(() => expenses.filter((e) => needsReview(e)), [expenses]);
  const matchingReviewables = (data: RuleFormData): Expense[] =>
    reviewables.filter((e) =>
      matchesRule(
        { id: "draft", ...data, priority: 0 },
        { description: e.description, vendor_name: e.vendor_name, amount: Number(e.amount) },
      ),
    );

  const handleRuleSubmit = async (data: RuleFormData, applyExisting: boolean): Promise<boolean> => {
    const nextPriority = rules.length ? Math.max(...rules.map((r) => r.priority)) + 10 : 100;
    const r = await addRule({
      id: crypto.randomUUID(),
      ...data,
      priority: nextPriority,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as ExpenseRule);
    if (r.ok === false) {
      addToast({ title: "Couldn't create rule", description: friendlyDbError({ code: r.code } as any), status: "alert" });
      return false;
    }
    addToast({ title: "Rule created", description: `${data.match_value} → ${data.set_category}`, status: "ok" });
    if (applyExisting) await sweepRule(data);
    return true;
  };

  // Apply a just-saved rule to the rows needing review that it matches. Vendor
  // linkage only touches hand-entered/CSV rows — synced rows take the category
  // (sync-safe) but keep their own vendor identity.
  const sweepRule = async (data: RuleFormData): Promise<void> => {
    const targets = matchingReviewables(data);
    if (targets.length === 0) return;
    const category = book.canonical(data.set_category) ?? data.set_category;
    const basePatch = categoryPatch(category);
    const editable = targets.filter((e) => !isManaged(e));
    const managed = targets.filter((e) => isManaged(e));
    const writes: { ids: string[]; patch: Partial<Expense> }[] = [];
    if (editable.length > 0) {
      writes.push({
        ids: editable.map((e) => e.id),
        patch: data.set_vendor_id ? { ...basePatch, vendor_id: data.set_vendor_id } : basePatch,
      });
    }
    if (managed.length > 0) writes.push({ ids: managed.map((e) => e.id), patch: basePatch });
    for (const w of writes) {
      const res = await updateMany(w.ids, w.patch);
      if (!res.ok) {
        addToast({ title: "Rule saved, but applying it failed", description: friendlyDbError({ code: res.code } as any), status: "alert" });
        return;
      }
    }
    addToast({ ...summarizeWrites(targets.length, 0, { verbPast: "categorized" }), description: category });
  };

  // ---- Delete (single + bulk) ----------------------------------------------
  const deleteExpense = async (e: Expense) => {
    if (!(await confirm({ title: "Delete this expense?", message: "Any attached receipt is removed too.", confirmLabel: "Delete", tone: "danger" }))) return;
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
    if (!(await confirm({ title: `Delete ${targets.length} expense${targets.length === 1 ? "" : "s"}?`, message: "Any attached receipts are removed too.", confirmLabel: "Delete", tone: "danger" }))) return;
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
    const r = await updateMany(targets.map((e) => e.id), categoryPatch(category));
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
  const importRows = async (rows: ImportRow[], fileName: string): Promise<number> => {
    if (!supabase || !user || !activeOrgId) return 0;

    // Batch first, so every inserted row carries its undo handle.
    const { data: batch, error: batchError } = await supabase
      .from("expense_import_batches")
      .insert({ org_id: activeOrgId, user_id: user.id, file_name: fileName, row_count: rows.length })
      .select()
      .single();
    if (batchError || !batch) {
      addToast({ title: "Import failed", description: friendlyDbError(batchError as any), status: "alert" });
      return 0;
    }

    const payload = rows.map((r) => ({
      user_id: user.id,
      org_id: activeOrgId,
      amount: r.amount,
      occurred_on: r.occurred_on,
      description: r.description,
      vendor_name: r.vendor_name,
      vendor_id: r.vendor_id,
      category: r.category,
      category_legacy: r.category_legacy,
      schedule_c_category: r.category ? book.scheduleCFor(r.category) : null,
      schedule_f_category: r.category ? book.scheduleFFor(r.category) : null,
      source: "csv",
      deductible: true,
      external_id: r.external_id || null,
      needs_review: r.needs_review,
      import_batch_id: batch.id,
    }));
    const { data: inserted, error } = await supabase.from("expenses").insert(payload).select();
    if (error) {
      await supabase.from("expense_import_batches").delete().eq("id", batch.id);
      addToast({
        title: "Import failed",
        description: error.code === "23505"
          ? "Some rows were already imported (another device?). Refresh and try again."
          : friendlyDbError(error),
        status: "alert",
      });
      await refreshBatches();
      return 0;
    }

    const count = inserted?.length ?? rows.length;
    if (count !== rows.length) {
      await supabase.from("expense_import_batches").update({ row_count: count }).eq("id", batch.id);
    }
    logActivity({
      orgId: activeOrgId,
      actorId: user.id,
      action: "created",
      entity: "expenses",
      entityId: null,
      summary: `${count} rows (CSV import: ${fileName})`,
    });
    const autoCount = rows.filter((r) => r.category_source != null).length;
    const reviewCt = rows.filter((r) => r.needs_review).length;
    addToast({
      title: "Import complete",
      description: `${count} imported · ${autoCount} auto-categorized · ${reviewCt} to review`,
      status: "ok",
    });
    await Promise.all([refresh(), refreshBatches()]);
    return count;
  };

  const undoBatch = async (batch: ImportBatch): Promise<void> => {
    if (!supabase || !activeOrgId) return;
    // Receipts attached to the batch's rows would be orphaned by the row
    // delete — collect their paths first, clean up after the delete succeeds.
    const receiptPaths = expenses
      .filter((e) => e.import_batch_id === batch.id && e.receipt_url)
      .map((e) => e.receipt_url!);
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("org_id", activeOrgId)
      .eq("import_batch_id", batch.id)
      .eq("source", "csv");
    if (error) {
      addToast({ title: "Couldn't undo import", description: friendlyDbError(error), status: "alert" });
      return;
    }
    for (const path of receiptPaths) await removeReceipt(path);
    await removeBatch(batch.id);
    addToast({ title: "Import undone", description: `${batch.row_count} expenses removed`, status: "info" });
    await refresh();
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
          <p className="text-sm text-text-secondary">Etsy fees and subscriptions log themselves — scan, import, or add the rest.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => scanRef.current?.click()} disabled={scanning}>
            <ScanLine className="w-4 h-4" /> {scanning ? "Scanning…" : "Scan receipt"}
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
        <StatTile
          label="This month"
          value={formatMoney(sumMonth)}
          trend={monthSpark.some((v) => v > 0) ? { value: "6 mo", direction: "down", label: "spend shape", sparklineData: monthSpark } : undefined}
        />
        <StatTile label="YTD total" value={formatMoney(sumYtd)} />
        <StatTile label="Top category" value={topCategory} />
        <button
          type="button"
          onClick={() => { setReviewOnly(true); setPreset("all"); setCatFilter(""); }}
          aria-label={`Filter to ${reviewCount} expenses needing review`}
          className="text-left transition-transform hover:-translate-y-0.5"
        >
          <StatTile
            label="To review"
            value={String(reviewCount)}
            trend={reviewCount > 0 ? { value: "review", direction: "down", label: "tap to filter" } : undefined}
          />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select className={selectCls} value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
          {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
        {showCustom && (
          <>
            <Input type="date" className="w-auto" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span className="text-text-tertiary text-sm">to</span>
            <Input type="date" className="w-auto" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </>
        )}
        <div className="w-40">
          <CategorySelect value={catFilter} onChange={(c) => { setCatFilter(c); setReviewOnly(false); }} blankLabel="All categories" />
        </div>
        <Select className={selectCls} value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
          <option value="">All vendors</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <Select className={selectCls} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          <option value="">All sources</option>
          <option value="manual">Manual</option>
          <option value="csv">Imported (CSV)</option>
          <option value="etsy">Etsy</option>
          <option value="subscription">Subscriptions</option>
          <option value="supply_purchase">Supplies</option>
          <option value="mileage">Mileage</option>
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={reviewOnly}
            onChange={(e) => setReviewOnly(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-accent-brand)]"
          />
          To review
        </label>
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input className="pl-9" placeholder="Search memo…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {(reviewOnly || catFilter || vendorFilter || sourceFilter || search || preset !== "all") && (
          <button
            onClick={() => { setPreset("all"); setCatFilter(""); setVendorFilter(""); setSourceFilter(""); setSearch(""); setReviewOnly(false); setCustomFrom(""); setCustomTo(""); }}
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
            {selectedNeedingReview && (
              <Button variant="outline" onClick={bulkMarkReviewed}>
                <CheckCircle2 className="w-4 h-4" /> Mark reviewed
              </Button>
            )}
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
        {!isLoading && error && <ErrorState description={error} onRetry={refresh} />}
        {isEmpty && !error && (
          <EmptyState
            icon={FileText}
            title="No expenses yet"
            description="Log your first expense or import a CSV from your bank or marketplace."
            action={<Button variant="outline" onClick={openCreate}>Add Expense</Button>}
          />
        )}
        {!isLoading && !isEmpty && !error && (
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
            onMarkReviewed={markReviewed}
            onCreateRule={openRuleFromExpense}
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
      <CsvImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        existing={expenses}
        orgId={activeOrgId}
        rules={rules}
        batches={batches}
        onUndoBatch={undoBatch}
        onImport={importRows}
      />
      <SmartCategorizeModal
        open={smartOpen}
        onClose={() => setSmartOpen(false)}
        items={suggestionItems}
        vendors={vendors}
        onApply={applySuggestions}
      />
      <RuleModal
        open={ruleOpen}
        onClose={() => { setRuleOpen(false); setRulePrefill(null); }}
        vendors={vendors}
        editing={null}
        initial={rulePrefill}
        onSubmit={handleRuleSubmit}
        countMatches={(data) => matchingReviewables(data).length}
      />
      <ReceiptDrawer path={drawerPath} onClose={() => setDrawerPath(null)} />
    </div>
  );
}
