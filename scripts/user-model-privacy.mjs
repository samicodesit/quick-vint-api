export async function purgeUserModelImages(supabase, userId) {
  const fenced = await supabase.rpc("user_model_mutate", {
    p_user_id: userId,
    p_action: "erase",
    p_input: {},
  });
  // Backward compatible before the additive model migration is installed.
  if (["PGRST202", "42883"].includes(fenced.error?.code)) return 0;
  if (fenced.error) throw fenced.error;
  const { data, error } = await supabase
    .from("user_model_attempts")
    .select("object_key")
    .eq("user_id", userId);
  if (error) throw error;
  const keys = (data || [])
    .map((row) => row.object_key)
    .filter((key) => !key.startsWith("removed/"));
  if (keys.length) {
    const removed = await supabase.storage.from("user-models").remove(keys);
    if (removed.error) throw removed.error;
  }
  // Tombstones survive auth deletion. The recovery cron removes objects again
  // after the bounded in-flight upload window, then retains anonymous metrics.
  return keys.length;
}
