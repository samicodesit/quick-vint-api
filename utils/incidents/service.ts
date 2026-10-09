import { randomUUID } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { supabase } from "../supabaseClient";
import { getSentry } from "../sentry";
import { normalizeIncidentEvent } from "./contract";
import { deliverPendingNotifications } from "./notifications";

export function continueIncidentWork(work: Promise<unknown>) {
  const guarded = work.catch(() => {
    /* Durable pending state remains for sweep. */
  });
  try {
    waitUntil(guarded);
  } catch {
    /* Local runners have no Vercel request context. */
  }
}

export async function captureAcceptedException(
  error: unknown,
  incidentId: string,
  context: Record<string, unknown> = {},
) {
  const sentry = getSentry();
  if (!sentry) return;
  sentry.withScope((scope) => {
    scope.setTag("incidentId", incidentId);
    for (const key of ["stage", "market", "endpoint"])
      if (context[key]) scope.setTag(key, String(context[key]));
    // Keep the actual exception and its stack when the calling context has one.
    sentry.captureException(error);
  });
  await sentry.flush(1500);
}

export async function recordServerIncident(input: {
  event: string;
  error?: unknown;
  userId?: string;
  context?: Record<string, unknown>;
  id?: string;
}) {
  if (process.env.INCIDENT_PROCESSING_PAUSED === "true") return null;
  const error =
    input.error instanceof Error
      ? input.error
      : new Error(String(input.context?.message || input.event));
  const normalized = normalizeIncidentEvent({
    id: input.id || randomUUID(),
    event: input.event,
    occurredAt: new Date().toISOString(),
    source: "backend",
    release: process.env.VERCEL_GIT_COMMIT_SHA || "local",
    context: {
      ...input.context,
      errorName: error.name,
      message: error.message,
      stack: error.stack,
    },
  });
  if (!normalized.value) return null;
  const { data, error: persistenceError } = await supabase
    .rpc("incident_ingest", {
      p_event: normalized.value,
      p_user_id: input.userId || null,
      p_verified: true,
    })
    .abortSignal(AbortSignal.timeout(3000));
  if (persistenceError || data?.status !== "accepted")
    return data?.incidentId || null;
  if (data.incidentId) {
    await Promise.allSettled([
      captureAcceptedException(error, data.incidentId, input.context),
      deliverPendingNotifications(5),
    ]);
  }
  return data.incidentId;
}
