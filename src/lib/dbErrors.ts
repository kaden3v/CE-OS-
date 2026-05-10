import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Translate a Postgres error code into a friendly user-facing message.
 * The raw `error.message` from PostgREST can leak schema details — never
 * surface it directly to a user.
 */
export function friendlyDbError(error: PostgrestError | null | undefined, fallback = "Couldn't save your changes. Please try again."): string {
  if (!error) return fallback;
  switch (error.code) {
    case "23505": // unique_violation
      return "That value already exists.";
    case "23503": // foreign_key_violation
      return "Linked record is missing or already deleted.";
    case "23514": // check_violation
      return "Some values aren't allowed for that field.";
    case "23502": // not_null_violation
      return "A required field is missing.";
    case "42501": // insufficient_privilege (RLS denial)
      return "You don't have access to that.";
    case "PGRST116": // No rows returned by .single()
      return "Record not found.";
    default:
      return fallback;
  }
}

/** Log the raw error for debugging without surfacing it to UI. */
export function logDbError(scope: string, error: PostgrestError | null | undefined) {
  if (!error) return;
  console.error(`[db:${scope}] ${error.code ?? "?"} ${error.message}`, error.details ?? "");
}
