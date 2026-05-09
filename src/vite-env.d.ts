/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Comma-separated operator emails allowed to use CE-OS after Supabase auth */
  readonly VITE_CE_OS_OPERATOR_EMAILS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
