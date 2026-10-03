import { Resend } from "resend";
import { wrapDirectReplyLayout } from "../emailTemplates";
import { supabase } from "../supabaseClient";
import { redact, sanitizeContext } from "./contract";

const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

export function renderIncidentEmail(payload: any) {
  const context = sanitizeContext(payload.example?.context, false);
  const link = `https://autolister.app/admin/reports?incident=${encodeURIComponent(payload.incidentId)}`;
  const subject = `AutoLister issue: ${redact(payload.event, 80).replace(/[\r\n]/g, " ")}`;
  const body = `<p><strong>${escape(payload.event)}</strong></p>
    <p>Stage: ${escape(payload.stage)}<br>Severity: ${escape(payload.severity)}<br>Version: ${escape(payload.release)}<br>Market: ${escape(payload.market)}</p>
    <p>${escape(context.message || context.error || context.errorCode || "Open the issue for available evidence.")}</p>
    <p><a href="${escape(link)}" style="color:#007782;text-decoration:underline">Open this issue in AutoLister</a></p>`;
  return {
    from: "AutoLister AI Alerts <alerts@autolister.app>",
    to: "samicodesit@gmail.com",
    subject,
    html: wrapDirectReplyLayout(body, escape(subject)),
  };
}

export async function deliverPendingNotifications(limit = 10) {
  if (process.env.INCIDENT_PROCESSING_PAUSED === "true")
    return { sent: 0, failed: 0, paused: true };
  const { data, error } = await supabase
    .rpc("incident_claim_notifications", { p_limit: limit })
    .abortSignal(AbortSignal.timeout(3000));
  if (error) throw new Error("Unable to claim pending incident notifications");
  const result = { sent: 0, failed: 0 };
  const resend = new Resend(process.env.RESEND_API_KEY);
  const deadline = Date.now() + 30000;
  for (const incident of data || []) {
    // Unprocessed claims remain durable and become eligible after their lease.
    // Finish within the function window even during a provider outage.
    if (Date.now() >= deadline) break;
    let retryAfterMs = 0;
    try {
      let snapshot = incident.notification_payload;
      if (!snapshot?.email) {
        const frozen = await supabase
          .rpc("incident_freeze_notification", {
            p_id: incident.id,
            p_key: incident.notification_key,
            p_email: renderIncidentEmail(snapshot),
          })
          .abortSignal(AbortSignal.timeout(3000));
        if (frozen.error || !frozen.data?.email)
          throw new Error("Unable to freeze notification content");
        snapshot = frozen.data;
      }
      // The SDK forwards request options to fetch. Keep the abort active until
      // the response body is read, including an ambiguous delivery outcome.
      const sendOptions = {
        idempotencyKey: `incident/${incident.notification_key}`,
        signal: AbortSignal.timeout(10000),
      };
      const response = await resend.emails.send(snapshot.email, sendOptions);
      const retryAfter = response.headers?.["retry-after"];
      if (retryAfter)
        retryAfterMs = /^\d+$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : Math.max(0, Date.parse(retryAfter) - Date.now());
      if (response.error || !response.data?.id)
        throw new Error(response.error?.message || "Notification not accepted");
      const saved = await supabase
        .from("incident_groups")
        .update({
          notification_status: "sent",
          notified_at: new Date().toISOString(),
          notification_locked_until: null,
          notification_error: null,
          resend_id: response.data.id,
        })
        .eq("id", incident.id)
        .eq("notification_key", incident.notification_key)
        .eq("notification_attempts", incident.notification_attempts)
        .abortSignal(AbortSignal.timeout(3000));
      if (saved.error)
        throw new Error("Notification acceptance could not be recorded");
      result.sent++;
    } catch (error) {
      result.failed++;
      const delay = [1, 5, 15, 30][
        Math.min(Math.max(0, incident.notification_attempts - 1), 3)
      ];
      await supabase
        .from("incident_groups")
        .update({
          notification_status: "failed",
          notification_error: redact(
            error instanceof Error ? error.message : error,
          ),
          notification_locked_until: null,
          notification_next_at: new Date(
            Date.now() + Math.max(delay * 60000, retryAfterMs || 0),
          ).toISOString(),
        })
        .eq("id", incident.id)
        .eq("notification_key", incident.notification_key)
        .eq("notification_attempts", incident.notification_attempts)
        .abortSignal(AbortSignal.timeout(3000));
    }
  }
  return result;
}
