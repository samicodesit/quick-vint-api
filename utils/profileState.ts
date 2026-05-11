import { supabase } from "./supabaseClient";

type FreeTierLegacyProfile = {
  subscription_tier?: string | null;
  is_legacy_plan?: boolean | null;
  api_calls_this_month?: number | null;
};

/**
 * Some pre-migration free accounts can still be marked as legacy, which makes
 * the app mix the old monthly listing counter with the new credit UI.
 * Normalize those users into the new free-tier state on first authenticated use.
 */
export async function normalizeFreeTierLegacyProfile<
  T extends FreeTierLegacyProfile | null | undefined,
>(userId: string, profile: T): Promise<T> {
  if (!profile) return profile;
  if (profile.subscription_tier !== "free" || profile.is_legacy_plan !== true) {
    return profile;
  }

  const patch = {
    is_legacy_plan: false,
    api_calls_this_month: 0,
  };

  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) {
    console.error("Failed to normalize free-tier legacy profile:", error);
    return profile;
  }

  return { ...profile, ...patch } as T;
}
