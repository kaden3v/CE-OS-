import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Covers the raw-fetch auth boundary in src/lib/supabase.ts (restGet / rpcCall /
 * functionInvoke): project-ref parsing, the localStorage bearer-token read, the
 * anon-key fallback, and error-body handling. fetch is always mocked, so these
 * tests never touch the real Supabase backend, and env is stubbed for
 * deterministic URL/key assertions regardless of .env.local.
 */

const TEST_URL = "https://abcdref.supabase.co";
const TEST_ANON = "anon-test-key";
const TOKEN_KEY = "sb-abcdref-auth-token";

function makeLocalStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

async function loadModule(opts: { token?: string | null; configured?: boolean } = {}) {
  const { token, configured = true } = opts;
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", configured ? TEST_URL : "");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", configured ? TEST_ANON : "");
  const initial = token ? { [TOKEN_KEY]: token } : {};
  vi.stubGlobal("localStorage", makeLocalStorage(initial));
  return import("@/lib/supabase");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isSupabaseConfigured", () => {
  it("is true when both env vars are present", async () => {
    const mod = await loadModule({});
    expect(mod.isSupabaseConfigured).toBe(true);
  });

  it("is false when env vars are missing, and helpers refuse to run", async () => {
    const mod = await loadModule({ configured: false });
    expect(mod.isSupabaseConfigured).toBe(false);
    await expect(mod.restGet("expenses")).rejects.toThrow("Supabase not configured");
    const r = await mod.functionInvoke("anything", {});
    expect(r).toEqual({ ok: false, status: 0, error: "Supabase not configured" });
  });
});

describe("restGet", () => {
  it("sends the stored access token as Bearer and the anon key as apikey", async () => {
    const mod = await loadModule({ token: JSON.stringify({ access_token: "live-jwt" }) });
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [{ id: 1 }] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await mod.restGet<{ id: number }[]>("expenses?select=id");
    expect(res).toEqual([{ id: 1 }]);

    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(`${TEST_URL}/rest/v1/expenses?select=id`);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer live-jwt");
    expect(headers.apikey).toBe(TEST_ANON);
  });

  it("falls back to the anon key as Bearer when no session token is stored", async () => {
    const mod = await loadModule({ token: null });
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [] }));
    vi.stubGlobal("fetch", fetchMock);

    await mod.restGet("expenses");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TEST_ANON}`);
  });

  it("throws REST <status>: <body> on a non-ok response", async () => {
    const mod = await loadModule({ token: null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, text: async () => "denied" })));
    await expect(mod.restGet("expenses")).rejects.toThrow("REST 403: denied");
  });
});

describe("rpcCall", () => {
  it("POSTs to /rest/v1/rpc/<fn> and returns parsed JSON", async () => {
    const mod = await loadModule({ token: JSON.stringify({ access_token: "live-jwt" }) });
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ total: 42 }) }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await mod.rpcCall<{ total: number }>("finance_kpis", { p_from: "2026-01-01" });
    expect(res).toEqual({ total: 42 });

    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(`${TEST_URL}/rest/v1/rpc/finance_kpis`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ p_from: "2026-01-01" });
  });

  it("throws the server message on a non-ok RPC response", async () => {
    const mod = await loadModule({ token: null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ message: "bad args" }) })));
    await expect(mod.rpcCall("finance_kpis", {})).rejects.toThrow("bad args");
  });
});

describe("functionInvoke", () => {
  it("returns { ok: true, data } on success", async () => {
    const mod = await loadModule({ token: null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ done: true }) })));
    const r = await mod.functionInvoke<{ done: boolean }>("etsy-sync", { mode: "inspect" });
    expect(r).toEqual({ ok: true, data: { done: true } });
  });

  it("returns { ok: false, status, error } on a non-ok response", async () => {
    const mod = await loadModule({ token: null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) })));
    const r = await mod.functionInvoke("etsy-sync", {});
    expect(r).toEqual({ ok: false, status: 401, error: "Unauthorized" });
  });

  it("returns { ok: false, status: 0 } when fetch throws (network/abort)", async () => {
    const mod = await loadModule({ token: null });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const r = await mod.functionInvoke("etsy-sync", {});
    expect(r).toEqual({ ok: false, status: 0, error: "network down" });
  });
});
