// Receipt OCR: image/PDF in, structured expense draft out.
//
// Called from the app (authenticated users; verify_jwt is enabled at the
// platform level) with a base64 payload. Extraction runs on Gemini vision via
// GEMINI_API_KEY (Edge Function secret). When the key isn't configured the
// function answers 501 and the client quietly falls back to its filename
// heuristics — same contract as before this function existed.
//
// The prompt is strict about not fabricating: any field the model can't read
// with confidence comes back null, and the server re-validates every field
// (positive amount, real ISO date, category must be one the caller offered)
// so a hallucinated value can't reach the ledger.

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_BASE64_CHARS = 9_000_000; // ~6.5 MB raw — beyond any downscaled receipt
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

interface ScanRequest {
  mime?: unknown;
  data?: unknown;
  categories?: unknown;
}

interface ScanResult {
  amount: number | null;
  occurred_on: string | null;
  vendor_name: string | null;
  memo: string | null;
  category: string | null;
}

/** YYYY-MM-DD that is also a real calendar date. */
function validIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && y >= 1990;
}

function sanitize(raw: unknown, categories: string[]): ScanResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const amountRaw = obj.amount;
  const amount =
    typeof amountRaw === "number" && Number.isFinite(amountRaw) && amountRaw > 0 && amountRaw < 1_000_000
      ? Math.round(amountRaw * 100) / 100
      : null;

  const dateRaw = typeof obj.date === "string" ? obj.date.trim() : "";
  const occurred_on = validIsoDate(dateRaw) ? dateRaw : null;

  const str = (v: unknown, max: number): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim().slice(0, max);
    return t || null;
  };

  const vendor_name = str(obj.vendor, 120);
  const memo = str(obj.memo, 200);

  // Only accept a category the caller offered (case-insensitive → canonical).
  const catRaw = (str(obj.category, 80) ?? "").toLowerCase();
  const category = categories.find((c) => c.toLowerCase() === catRaw) ?? null;

  return { amount, occurred_on, vendor_name, memo, category };
}

async function callGemini(
  apiKey: string,
  mime: string,
  base64: string,
  categories: string[],
): Promise<{ ok: true; raw: unknown } | { ok: false; status: number; detail: string }> {
  const categoriesLine = categories.length
    ? `If (and only if) the purchase clearly fits one, pick a category from exactly this list: ${categories.join(", ")}. Otherwise use null.`
    : "Set category to null.";

  const body = {
    contents: [
      {
        parts: [
          {
            text:
              "You are reading a purchase receipt for bookkeeping. Extract only what is printed. " +
              "Return: amount (the grand TOTAL actually paid, as a number), date (the purchase date, YYYY-MM-DD), " +
              "vendor (the merchant/store name), memo (a short human summary of what was bought, max 10 words), " +
              "and category. " +
              categoriesLine +
              " Use null for ANY field you cannot read with confidence — never guess or invent values. " +
              "If the image is not a receipt or invoice, return all nulls.",
          },
          { inline_data: { mime_type: mime, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      response_mime_type: "application/json",
      response_schema: {
        type: "OBJECT",
        properties: {
          amount: { type: "NUMBER", nullable: true },
          date: { type: "STRING", nullable: true },
          vendor: { type: "STRING", nullable: true },
          memo: { type: "STRING", nullable: true },
          category: { type: "STRING", nullable: true },
        },
      },
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, status: res.status, detail: detail.slice(0, 500) };
  }

  const payload = await res.json().catch(() => null);
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    return { ok: false, status: 502, detail: "no candidate text in Gemini response" };
  }
  try {
    return { ok: true, raw: JSON.parse(text) };
  } catch {
    return { ok: false, status: 502, detail: "Gemini returned non-JSON" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json(501, { error: "not_configured" });

  // Reject oversized uploads before buffering the body.
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BASE64_CHARS * 1.1) return json(413, { error: "file too large to scan" });

  let body: ScanRequest;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }

  const mime = typeof body.mime === "string" ? body.mime.toLowerCase().trim() : "";
  const data = typeof body.data === "string" ? body.data : "";
  if (!ALLOWED_MIME.has(mime)) return json(400, { error: "unsupported mime type" });
  if (!data) return json(400, { error: "missing data" });
  if (data.length > MAX_BASE64_CHARS) return json(413, { error: "file too large to scan" });

  const categories = Array.isArray(body.categories)
    ? body.categories.filter((c): c is string => typeof c === "string" && !!c.trim()).slice(0, 50)
    : [];

  const result = await callGemini(apiKey, mime, data, categories).catch(
    (err) => ({ ok: false as const, status: 502, detail: String(err?.message ?? err) }),
  );
  if (!result.ok) {
    console.error("receipt-scan: Gemini call failed", result.status, result.detail);
    return json(502, { error: "scan_failed" });
  }

  return json(200, sanitize(result.raw, categories));
});
