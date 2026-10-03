import { supabase } from "../supabaseClient";
import { LIMITS, normalizeIncidentEvent, sanitizeContext } from "./contract";

export async function ingestEnvelope(
  body: any,
  userId?: string,
  businessLog?: (raw: any, context: any) => Record<string, unknown> | null,
  legacyIdentity?: (raw: any) => Promise<string | undefined>,
) {
  const result = {
    schemaVersion: 2,
    acknowledgedIds: [] as string[],
    duplicateIds: [] as string[],
    rejections: [] as { id: string | null; reason: string }[],
    reports: {} as Record<string, string>,
    suppressed: [] as { id: string; reason: string }[],
  };
  if (
    !Array.isArray(body.events) ||
    !body.events.length ||
    body.events.length > LIMITS.batchEvents ||
    Buffer.byteLength(JSON.stringify(body)) > LIMITS.batchBytes
  ) {
    return { status: 400, body: { ...result, error: "invalid_batch" } };
  }
  if (process.env.INCIDENT_PROCESSING_PAUSED === "true") {
    return { status: 503, body: { ...result, error: "processing_paused" } };
  }
  const accepted: any[] = [];
  for (const raw of body.events) {
    const clientSources = [
      "extension_content",
      "extension_popup",
      "extension_callback",
      "extension_background",
      "website",
      "phone_upload_page",
      "web_auth_callback",
      "uninstall_page",
    ];
    const normalized = normalizeIncidentEvent({
      ...raw,
      source: clientSources.includes(raw?.source)
        ? raw.source
        : "unknown_client",
    });
    if (!normalized.value) {
      result.rejections.push({
        id: typeof raw?.id === "string" ? raw.id.slice(0, 100) : null,
        reason: normalized.error!,
      });
      continue;
    }
    // Account ownership is checked against the credential, never adopted from it.
    if (raw.accountId && raw.accountId !== userId) {
      result.rejections.push({ id: raw.id, reason: "identity_mismatch" });
      continue;
    }
    // Public browser code cannot manufacture trusted backend webhook incidents.
    if (raw.event === "webhook_failed") {
      result.rejections.push({ id: raw.id, reason: "trusted_source_required" });
      continue;
    }
    try {
      let ownerId = userId;
      let verified = Boolean(userId);
      if (/^[a-f0-9]{64}$/.test(raw.phoneSessionKey || "")) {
        const { data: owner, error: ownerError } = await supabase
          .from("incident_flows")
          .select("user_id,identity_verified")
          .eq("id", `phone:${raw.phoneSessionKey}`)
          .gt("expires_at", new Date().toISOString())
          .limit(1)
          .maybeSingle();
        if (ownerError) throw ownerError;
        if (ownerId && owner?.user_id && ownerId !== owner.user_id) {
          result.rejections.push({ id: raw.id, reason: "identity_mismatch" });
          continue;
        }
        ownerId ||= owner?.user_id;
        verified ||= Boolean(ownerId && owner?.identity_verified);
        // Correlation is evidence, not identity. Legacy sessions and a missed
        // background registration must not prevent an error from being saved.
        if (
          normalized.value.source === "phone_upload_page" ||
          (owner?.identity_verified && owner.user_id === ownerId)
        ) {
          normalized.value.phoneKey = raw.phoneSessionKey;
          normalized.value.context = sanitizeContext(
            {
              ...normalized.value.context,
              phoneSessionKey: raw.phoneSessionKey,
            },
            ["incident", "report"].includes(normalized.value.definition.kind),
          );
        }
        normalized.value.operationId ||= `phone:${raw.phoneSessionKey}`;
      }
      if (!ownerId && legacyIdentity) ownerId = await legacyIdentity(raw);
      const { data, error } = await supabase.rpc("incident_ingest", {
        p_event: {
          ...normalized.value,
          businessLog:
            businessLog?.(raw, sanitizeContext(raw.context, false)) || null,
        },
        p_user_id: ownerId || null,
        p_verified: verified,
      });
      if (error || !data) throw new Error("incident persistence failed");
      if (data.status === "rejected")
        result.rejections.push({ id: raw.id, reason: data.reason });
      else if (data.status === "duplicate") result.duplicateIds.push(raw.id);
      else if (data.status === "accepted") {
        result.acknowledgedIds.push(raw.id);
        accepted.push({ ...raw, identityVerified: verified });
      } else throw new Error("invalid persistence response");
      if (data.incidentId) result.reports[raw.id] = data.incidentId;
      if (data.suppressed)
        result.suppressed.push({ id: raw.id, reason: data.suppressed });
    } catch {
      return {
        status: 503,
        body: { ...result, error: "persistence_unavailable" },
        accepted,
      };
    }
  }
  return { status: 200, body: result, accepted };
}
