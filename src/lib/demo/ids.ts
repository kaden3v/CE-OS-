/**
 * Shared demo constants and the demo profile type.
 *
 * Kept in their own module so `store.ts` and `seed.ts` can both import them
 * without forming a circular dependency.
 */

/** Stable synthetic identity for the demo user. */
export const DEMO_USER_ID = "00000000-0000-4000-8000-0000000d3110";
export const DEMO_EMAIL = "demo@canyonexotics.com";

export type DemoProfile = {
  display_name: string | null;
  notification_prefs: Record<string, boolean>;
  is_admin: boolean;
  onboarded_at: string | null;
};
