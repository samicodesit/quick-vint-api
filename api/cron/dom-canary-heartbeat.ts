import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { supabase } from "../../utils/supabaseClient";

const resend = new Resend(process.env.RESEND_API_KEY);

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const staleHours = parsePositiveNumber(
    process.env.DOM_CANARY_STALE_HOURS,
    30,
  );
  const since = new Date(Date.now() - staleHours * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("api_logs")
    .select("created_at,user_email,full_request_body")
    .eq("endpoint", "/api/dom-canary")
    .eq("response_status", 202)
    .eq("suspicious_activity", false)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Failed to check DOM canary heartbeat:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }

  const latestHeartbeat = data?.[0];
  if (latestHeartbeat) {
    return res.status(200).json({
      ok: true,
      stale: false,
      source: "dom_canary",
      latestHeartbeatAt: latestHeartbeat.created_at,
    });
  }

  const { data: realInjectionData, error: realInjectionError } = await supabase
    .from("api_logs")
    .select("created_at,user_email,origin,full_request_body")
    .eq("endpoint", "/event/listing_tools_ready")
    .eq("response_status", 204)
    .eq("origin", "https://www.vinted.nl")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  if (realInjectionError) {
    console.error(
      "Failed to check real Vinted.nl injection heartbeat:",
      realInjectionError,
    );
    return res
      .status(500)
      .json({ ok: false, error: realInjectionError.message });
  }

  const latestRealInjection = realInjectionData?.[0];
  if (latestRealInjection) {
    return res.status(200).json({
      ok: true,
      stale: false,
      source: "real_listing_tools_ready",
      latestHeartbeatAt: latestRealInjection.created_at,
    });
  }

  const alertEmail =
    process.env.DOM_CANARY_ALERT_EMAIL || "support@autolister.app";

  if (!process.env.RESEND_API_KEY) {
    console.error(
      "DOM canary heartbeat is stale, but RESEND_API_KEY is missing",
    );
    return res.status(500).json({
      ok: false,
      stale: true,
      error: "Alert email is not configured",
    });
  }

  await resend.emails.send({
    from: "AutoLister AI Alerts <alerts@autolister.app>",
    to: alertEmail,
    subject: "Vinted DOM canary heartbeat missing",
    html: `
      <h2>Vinted DOM canary heartbeat missing</h2>
      <p>No successful Vinted DOM injection proof was logged in the last ${staleHours} hours.</p>
      <p>This means neither the daily canary nor real Vinted.nl user telemetry proved that AutoLister injected into the current listing page.</p>
    `,
    text: [
      "Vinted DOM canary heartbeat missing",
      `No successful Vinted DOM injection proof was logged in the last ${staleHours} hours.`,
      "This means neither the daily canary nor real Vinted.nl user telemetry proved that AutoLister injected into the current listing page.",
    ].join("\n"),
  });

  return res.status(200).json({
    ok: true,
    stale: true,
    staleHours,
  });
}
