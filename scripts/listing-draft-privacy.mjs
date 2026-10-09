export async function purgeListingDraftPhotos(supabase, userId) {
  let deleted = 0;
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase
      .from("listing_draft_photos")
      .select("id,object_key")
      .eq("user_id", userId)
      .order("id")
      .range(offset, offset + 99);
    if (error?.code === "42P01" || error?.code === "PGRST205") return deleted;
    if (error) throw error;
    if (!data?.length) break;
    const tombstones = await supabase
      .from("listing_draft_photos")
      .update({ deleted_at: new Date().toISOString() })
      .in(
        "id",
        data.map((p) => p.id),
      )
      .eq("user_id", userId);
    if (tombstones.error) throw tombstones.error;
    const removed = await supabase.storage
      .from("listing-drafts")
      .remove(data.map((p) => p.object_key));
    if (removed.error) throw removed.error;
    deleted += data.length;
    if (data.length < 100) break;
  }
  return deleted;
}
