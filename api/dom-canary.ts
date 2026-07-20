import type { VercelRequest, VercelResponse } from "@vercel/node";
import Cors from "cors";
import { Resend } from "resend";
import { supabase } from "../utils/supabaseClient";
import { ApiLogger } from "../utils/apiLogger";

const vintedOriginPattern =
  /^https:\/\/(?:[\w-]+\.)?vinted\.(?:[a-z]{2,}|co\.[a-z]{2})$/;

const rawOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS || "";
const ALLOWED_ORIGINS = rawOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const cors = Cors({
  origin: (incomingOrigin, callback) => {
    if (!incomingOrigin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(incomingOrigin)) return callback(null, true);
    if (vintedOriginPattern.test(incomingOrigin)) return callback(null, true);
    return callback(new Error("CORS origin denied for dom-canary"), false);
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

const resend = new Resend(process.env.RESEND_API_KEY);

type CanaryActor = {
  id?: string;
  email?: string;
};

function runCors(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) => {
    cors(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  const requestMetadata = ApiLogger.extractRequestMetadata(req);

  try {
    await runCors(req, res);
  } catch (corsError: any) {
    return res.status(403).json({ error: corsError.message });
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const authHeaderValue = req.headers.authorization;
  const authHeader = Array.isArray(authHeaderValue)
    ? authHeaderValue[0]
    : authHeaderValue;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization" });
  }

  const token = authHeader.split(" ")[1];
  let actor: CanaryActor | null = null;

  if (
    process.env.DOM_CANARY_SECRET &&
    token === process.env.DOM_CANARY_SECRET
  ) {
    actor = {
      email: "dom-canary@autolister.app",
    };
  } else {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    actor = {
      id: user.id,
      email: user.email,
    };
  }

  const body = req.body || {};
  const check =
    typeof body.check === "string" ? body.check : "unknown_dom_canary";
  const status = typeof body.status === "string" ? body.status : "unknown";
  const url = typeof body.url === "string" ? body.url : "";
  const path = typeof body.path === "string" ? body.path : "";
  const occurredAt =
    typeof body.occurredAt === "string"
      ? body.occurredAt
      : new Date().toISOString();
  const result = body.result || {};
  const selectors = body.selectors || {};
  const extensionVersion =
    typeof body.extensionVersion === "string" ? body.extensionVersion : "";

  if (
    check !== "vinted_listing_field_injection" ||
    (status !== "passed" && status !== "failed")
  ) {
    return res.status(400).json({ error: "Unsupported canary payload" });
  }

  const failed = status === "failed";
  const failureReason = result.reason || result.error || "unknown_error";

  await ApiLogger.logRequest({
    ...requestMetadata,
    endpoint: "/api/dom-canary",
    requestMethod: req.method || "POST",
    responseStatus: 202,
    userId: actor.id,
    userEmail: actor.email,
    fullRequestBody: body,
    suspiciousActivity: failed,
    flaggedReason: failed
      ? `DOM canary failed: ${failureReason}`
      : "DOM canary passed",
    processingDurationMs: Date.now() - startedAt,
  });

  if (!failed) {
    return res.status(202).json({ ok: true });
  }

  const alertEmail =
    process.env.DOM_CANARY_ALERT_EMAIL || "support@autolister.app";

  if (!process.env.RESEND_API_KEY) {
    console.error("DOM canary failed, but RESEND_API_KEY is not configured", {
      userId: actor.id,
      url,
      result,
    });
    return res.status(500).json({ error: "Alert email is not configured" });
  }

  try {
    await resend.emails.send({
      from: "AutoLister AI Alerts <alerts@autolister.app>",
      to: alertEmail,
      subject: "Vinted DOM canary failed",
      html: `
        <h2>Vinted field injection canary failed</h2>
        <p><strong>Check:</strong> ${escapeHtml(check)}</p>
        <p><strong>Occurred:</strong> ${escapeHtml(occurredAt)}</p>
        <p><strong>User:</strong> ${escapeHtml(actor.email || actor.id)}</p>
        <p><strong>Extension version:</strong> ${escapeHtml(extensionVersion)}</p>
        <p><strong>URL:</strong> ${escapeHtml(url)}</p>
        <p><strong>Path:</strong> ${escapeHtml(path)}</p>
        <h3>Result</h3>
        <pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>
        <h3>Selectors</h3>
        <pre>${escapeHtml(JSON.stringify(selectors, null, 2))}</pre>
      `,
      text: [
        "Vinted field injection canary failed",
        `Check: ${check}`,
        `Occurred: ${occurredAt}`,
        `User: ${actor.email || actor.id}`,
        `Extension version: ${extensionVersion}`,
        `URL: ${url}`,
        `Path: ${path}`,
        `Result: ${JSON.stringify(result)}`,
        `Selectors: ${JSON.stringify(selectors)}`,
      ].join("\n"),
    });

    return res.status(202).json({ ok: true });
  } catch (error: any) {
    console.error("Failed to send DOM canary alert:", error);
    return res.status(500).json({
      error: error?.message || "Failed to send alert",
    });
  }
}
