import type { SupabaseClient } from "@supabase/supabase-js";
export function purgeListingDraftPhotos(
  supabase: SupabaseClient,
  userId: string,
): Promise<number>;
