import { createHash } from "node:crypto";
import { supabase } from "../supabaseClient";

// A bounded, per-instance optimisation. Failed work is retried on later activity;
// correctness does not depend on this cache surviving a serverless restart.
const registrations = new Map<
  string,
  { until: number; pending?: Promise<void> }
>();

export async function registerPhoneEvidenceOwner(
  sessionId: string,
  userId: string,
) {
  if (process.env.INCIDENT_PROCESSING_PAUSED === "true") return;
  const key = createHash("sha256").update(sessionId).digest("hex");
  const cacheKey = `${key}:${userId}`;
  const cached = registrations.get(cacheKey);
  if (cached?.pending) return cached.pending;
  if (cached && cached.until > Date.now()) return;
  registrations.delete(cacheKey);
  if (registrations.size >= 200)
    registrations.delete(registrations.keys().next().value!);
  const entry: { until: number; pending?: Promise<void> } = { until: 0 };
  registrations.set(cacheKey, entry);
  entry.pending = (async () => {
    try {
      const { data, error } = await supabase
        .rpc("incident_register_phone", {
          p_key: key,
          p_user_id: userId,
        })
        .abortSignal(AbortSignal.timeout(1000));
      if (!error && data === true) entry.until = Date.now() + 60000;
    } catch {
      /* Never fail or delay upload work for diagnostic enrichment. */
    } finally {
      entry.pending = undefined;
      if (!entry.until && registrations.get(cacheKey) === entry)
        registrations.delete(cacheKey);
    }
  })();
  return entry.pending;
}
