import { useMemo, useState, ChangeEvent } from "react";
import { UploadCloud, FileDown, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity";

const INSERT_CHUNK_SIZE = 100;
const PREVIEW_ROWS = 5;

type EntityKey = "cultivars" | "customers" | "inventory";

interface EntitySpec {
  label: string;
  required: string[];
  optional: string[];
  numeric: string[];
  template: string;
}

const ENTITIES: Record<EntityKey, EntitySpec> = {
  cultivars: {
    label: "Cultivars",
    required: ["name"],
    optional: ["common", "genus", "origin"],
    numeric: [],
    template: "name,common,genus,origin\nP. agnata 'Red',Red Butterwort,Pinguicula,Mexico",
  },
  customers: {
    label: "Customers",
    required: ["name"],
    optional: ["email", "phone", "etsy_handle", "notes"],
    numeric: [],
    template: "name,email,phone,etsy_handle,notes\nJane Doe,jane@example.com,555-0100,janedoe,Wholesale buyer",
  },
  inventory: {
    label: "Inventory",
    required: ["name"],
    optional: ["common", "genus", "stock_juv", "stock_mat", "stock_flower"],
    numeric: ["stock_juv", "stock_mat", "stock_flower"],
    template: "name,common,genus,stock_juv,stock_mat,stock_flower\nP. agnata,Butterwort,Pinguicula,12,5,2",
  },
};

/** Minimal RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else {
      field += ch;
    }
  }
  pushRow();
  return rows;
}

interface ParsedData {
  rows: Array<Record<string, string | number | null>>;
  skipped: number;
  unknownColumns: string[];
  error: string | null;
}

function parseForEntity(text: string, spec: EntitySpec): ParsedData {
  const empty: ParsedData = { rows: [], skipped: 0, unknownColumns: [], error: null };
  // Excel prepends a UTF-8 BOM, which would break the first header's match.
  const cleaned = text.replace(/^\uFEFF/, "");
  if (!cleaned.trim()) return empty;

  const raw = parseCsv(cleaned);
  if (raw.length < 2) return { ...empty, error: "Need a header row plus at least one data row." };

  const known = [...spec.required, ...spec.optional];
  const headers = raw[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const unknownColumns = headers.filter((h) => !known.includes(h));
  const missing = spec.required.filter((r) => !headers.includes(r));
  if (missing.length > 0) {
    return { ...empty, error: `Missing required column(s): ${missing.join(", ")}` };
  }

  const rows: ParsedData["rows"] = [];
  let skipped = 0;
  for (const cells of raw.slice(1)) {
    const record: Record<string, string | number | null> = {};
    headers.forEach((h, i) => {
      if (!known.includes(h)) return;
      const value = (cells[i] ?? "").trim();
      if (spec.numeric.includes(h)) {
        const n = Number(value);
        record[h] = value === "" ? 0 : Number.isFinite(n) ? n : 0;
      } else {
        record[h] = value || null;
      }
    });
    const hasRequired = spec.required.every((r) => typeof record[r] === "string" && (record[r] as string).length > 0);
    if (hasRequired) rows.push(record);
    else skipped++;
  }
  return { rows, skipped, unknownColumns, error: null };
}

export default function Import() {
  const { user, activeOrgId } = useAuth();
  const { addToast } = useApp();

  const [entity, setEntity] = useState<EntityKey>("cultivars");
  const [csvText, setCsvText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const spec = ENTITIES[entity];
  const parsed = useMemo(() => parseForEntity(csvText, spec), [csvText, spec]);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setCsvText).catch(() => {
      addToast({ title: "Couldn't read file", status: "alert" });
    });
    e.target.value = "";
  };

  const downloadTemplate = () => {
    const blob = new Blob([spec.template + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entity}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!supabase || !user || !activeOrgId || parsed.rows.length === 0) return;
    setIsImporting(true);
    setLastResult(null);

    const payload = parsed.rows.map((r) => ({ ...r, user_id: user.id, org_id: activeOrgId }));
    let inserted = 0;
    for (let i = 0; i < payload.length; i += INSERT_CHUNK_SIZE) {
      const chunk = payload.slice(i, i + INSERT_CHUNK_SIZE);
      const { error } = await (supabase as any).from(entity).insert(chunk);
      if (error) {
        console.error("[import] chunk failed:", error.message);
        addToast({
          title: "Import stopped",
          description: `${inserted} of ${payload.length} rows imported before an error. Fix the data and re-import the rest.`,
          status: "alert",
        });
        setLastResult(`Imported ${inserted} of ${payload.length} rows (stopped on a database error).`);
        setIsImporting(false);
        return;
      }
      inserted += chunk.length;
    }

    logActivity({
      orgId: activeOrgId,
      actorId: user.id,
      action: "imported",
      entity,
      summary: `${inserted} row${inserted === 1 ? "" : "s"} via CSV`,
    });
    addToast({ title: "Import complete", description: `${inserted} ${spec.label.toLowerCase()} added.`, status: "ok" });
    setLastResult(`Imported ${inserted} row${inserted === 1 ? "" : "s"} into ${spec.label.toLowerCase()}.`);
    setCsvText("");
    setIsImporting(false);
  };

  const previewColumns = [...spec.required, ...spec.optional];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-text-secondary" /> Data Import
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Bulk-load cultivars, customers, or inventory from a CSV export. Imported records are shared with your whole team.
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value as EntityKey);
              setLastResult(null);
            }}
            className="bg-bg-elevated border border-border-strong rounded-[8px] px-2 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-brand"
          >
            {(Object.keys(ENTITIES) as EntityKey[]).map((k) => (
              <option key={k} value={k}>{ENTITIES[k].label}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <FileDown className="w-3.5 h-3.5" /> Template
          </Button>
          <label className="inline-flex items-center gap-2 text-xs px-2 py-2 rounded-md border border-border-strong hover:bg-bg-hover cursor-pointer text-text-primary">
            <UploadCloud className="w-3.5 h-3.5" /> Choose CSV file
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          </label>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wide text-text-secondary block mb-2">
            Or paste CSV (header row first)
          </label>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={spec.template}
            className="w-full bg-bg-elevated border border-border-strong rounded-[8px] px-3 py-2 text-sm font-mono placeholder:text-text-tertiary focus:outline-none focus:border-accent-brand resize-y"
          />
        </div>

        {parsed.error && (
          <p className="text-sm text-status-alert flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {parsed.error}
          </p>
        )}

        {!parsed.error && parsed.rows.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm text-text-secondary">
              <span className="text-text-primary font-medium">{parsed.rows.length}</span> row
              {parsed.rows.length === 1 ? "" : "s"} ready
              {parsed.skipped > 0 && <> · {parsed.skipped} skipped (missing {spec.required.join("/")})</>}
              {parsed.unknownColumns.length > 0 && <> · ignoring columns: {parsed.unknownColumns.join(", ")}</>}
            </div>

            <div className="overflow-x-auto border border-border-subtle rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-text-tertiary border-b border-border-subtle">
                    {previewColumns.map((c) => (
                      <th key={c} className="px-3 py-2 font-medium">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                    <tr key={i} className="border-b border-border-subtle last:border-0">
                      {previewColumns.map((c) => (
                        <td key={c} className="px-3 py-2 text-text-secondary truncate max-w-[180px]">
                          {r[c] ?? <span className="text-text-tertiary">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.rows.length > PREVIEW_ROWS && (
              <p className="text-xs text-text-tertiary">…and {parsed.rows.length - PREVIEW_ROWS} more.</p>
            )}

            <Button variant="brand" onClick={handleImport} disabled={isImporting}>
              {isImporting ? "Importing…" : `Import ${parsed.rows.length} row${parsed.rows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        )}

        {lastResult && (
          <p className="text-sm text-text-secondary flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-status-ok flex-shrink-0" /> {lastResult}
          </p>
        )}
      </Card>
    </div>
  );
}
