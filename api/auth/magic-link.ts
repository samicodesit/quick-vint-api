import type { VercelRequest, VercelResponse } from "@vercel/node";
import Cors from "cors";
import { Resend } from "resend";
import { ApiLogger } from "../../utils/apiLogger";
import { supabase } from "../../utils/supabaseClient";
import { reportCriticalEndpointFailure } from "../../utils/criticalEndpointAlert";
import {
  checkMagicLinkRateLimit,
  getAuthEmailBlockReason,
  getEmailDomain,
} from "../../utils/authAbuseGuard";

// Read and parse allowed origins from env for CORS
// This should primarily be your Chrome extension's origin
const rawOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS || "";
const ALLOWED_ORIGINS = rawOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const cors = Cors({
  origin: (incomingOrigin, callback) => {
    if (!incomingOrigin) {
      // Allow server-to-server or tools like Postman
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.includes(incomingOrigin)) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "Blocked CORS for magic-link from:",
        incomingOrigin,
        "Allowed:",
        ALLOWED_ORIGINS,
      );
    }
    return callback(new Error("CORS origin denied for magic-link"), false);
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"], // Added Authorization for consistency
});

const MAGIC_LINK_TIMEOUT_MS = 15000;
const DEFAULT_AUTH_CALLBACK_URL = "https://autolister.app/auth/callback";
const AUTH_EMAIL_FROM = "AutoLister AI <support@autolister.app>";
const resend = new Resend(process.env.RESEND_API_KEY);

function runCors(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) => {
    cors(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

function parseBody(body: unknown): Record<string, any> {
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString("utf8") || "{}");
    } catch {
      return {};
    }
  }

  if (body && typeof body === "object") return body as Record<string, any>;

  if (typeof body === "string") {
    try {
      return JSON.parse(body || "{}");
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeErrorMessage(error: unknown) {
  if (!error) return "Unable to send the sign-in email. Please try again.";

  if (typeof error === "string") {
    return error.trim() && error.trim() !== "{}"
      ? error
      : "Unable to send the sign-in email. Please try again.";
  }

  if (error instanceof Error && error.message && error.message !== "{}") {
    return error.message;
  }

  if (typeof error === "object") {
    const candidate =
      (error as any).message ||
      (error as any).error_description ||
      (error as any).error ||
      (error as any).code;
    if (
      typeof candidate === "string" &&
      candidate.trim() &&
      candidate !== "{}"
    ) {
      return candidate;
    }
  }

  return "Unable to send the sign-in email. Please try again.";
}

function isAuthEmailCooldownError(error: unknown) {
  const message = normalizeErrorMessage(error);
  return /for security purposes, you can only request this after/i.test(
    message,
  );
}

function serializeError(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 3).join("\n"),
    };
  }
  if (typeof error === "object") {
    try {
      return JSON.parse(JSON.stringify(error));
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function getAuthCallbackUrl() {
  const configured = (process.env.AUTH_CALLBACK_URL || "").trim();
  return configured.startsWith("https://")
    ? configured
    : DEFAULT_AUTH_CALLBACK_URL;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function buildAuthEmailHtml({
  actionLink,
  otp,
}: {
  actionLink: string;
  otp: string;
}) {
  const safeActionLink = escapeHtml(actionLink);
  const safeOtp = escapeHtml(otp);
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;padding:32px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
    <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Sign in to AutoLister&nbsp;AI</h2>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
      Click the button below to securely sign in to your account.
    </p>
    <p style="text-align:center;margin:0 0 28px;">
      <a href="${safeActionLink}" style="display:inline-block;padding:12px 24px;font-size:15px;color:#ffffff;background:#4f46e5;text-decoration:none;border-radius:6px;">
        Sign in
      </a>
    </p>
    <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#6b7280;">
      If the button opens in the wrong browser, enter this code in the AutoLister AI extension:
    </p>
    <p style="margin:0 0 24px;text-align:center;font-size:28px;letter-spacing:6px;font-weight:700;color:#111827;">
      ${safeOtp}
    </p>
    <p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:#6b7280;">
      Didn’t request this email? Just ignore it.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;">
    <p style="margin:0;text-align:center;font-size:12px;color:#9ca3af;">
      © 2026 AutoLister AI · autolister.app
    </p>
  </div>
</body>
</html>`;
}

async function sendAuthEmail({
  email,
  actionLink,
  otp,
}: {
  email: string;
  actionLink: string;
  otp: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const result = await resend.emails.send({
    from: AUTH_EMAIL_FROM,
    to: [email],
    subject: "Sign in to AutoLister AI",
    html: buildAuthEmailHtml({ actionLink, otp }),
  });

  if (result.error) {
    throw new Error(result.error.message || "Resend email failed");
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Magic link request timed out"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function logMagicLinkAttempt({
  req,
  email,
  status,
  startedAt,
  error,
  flaggedReason,
}: {
  req: VercelRequest;
  email?: string;
  status: number;
  startedAt: number;
  error?: unknown;
  flaggedReason?: string;
}) {
  await ApiLogger.logRequest({
    ...ApiLogger.extractRequestMetadata(req),
    endpoint: "/api/auth/magic-link",
    userEmail: email?.trim().toLowerCase(),
    responseStatus: status,
    processingDurationMs: Date.now() - startedAt,
    suspiciousActivity: Boolean(flaggedReason),
    flaggedReason,
    fullRequestBody: {
      emailDomain: email ? getEmailDomain(email) || null : null,
      error: error ? serializeError(error) : null,
      flaggedReason: flaggedReason || null,
    },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  const body = parseBody(req.body);
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  try {
    await runCors(req, res);
  } catch (corsError: any) {
    await logMagicLinkAttempt({
      req,
      email,
      status: 403,
      startedAt,
      error: corsError,
    });
    return res
      .status(403)
      .json({ error: corsError.message || "CORS check failed for magic-link" });
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    await logMagicLinkAttempt({
      req,
      email,
      status: 405,
      startedAt,
    });
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  if (!email || typeof email !== "string" || !email.includes("@")) {
    await logMagicLinkAttempt({
      req,
      email,
      status: 400,
      startedAt,
      error: "invalid_email",
    });
    return res.status(400).json({ error: "A valid email address is required" });
  }

  const emailBlockReason = getAuthEmailBlockReason(email);
  if (emailBlockReason) {
    await logMagicLinkAttempt({
      req,
      email,
      status: 400,
      startedAt,
      error: emailBlockReason,
      flaggedReason: emailBlockReason,
    });
    return res.status(400).json({
      error:
        "Disposable emails are not allowed. If you have previously used or attempt to use one, you risk legal action. Contact us for appeal, or if you believe this is a mistake.",
    });
  }

  const rateLimit = await checkMagicLinkRateLimit({ req, email });
  if (rateLimit.limited) {
    await logMagicLinkAttempt({
      req,
      email,
      status: 429,
      startedAt,
      error: rateLimit.reason,
      flaggedReason: rateLimit.reason,
    });
    return res.status(429).json({
      error:
        "Too many sign-in email requests. Please wait a few minutes before trying again.",
    });
  }

  const emailRedirectTo = getAuthCallbackUrl();

  let linkResult;
  try {
    linkResult = await withTimeout(
      supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {
          redirectTo: emailRedirectTo,
        },
      }),
      MAGIC_LINK_TIMEOUT_MS,
    );
  } catch (error) {
    console.error("Supabase signInWithOtp threw:", serializeError(error));
    await logMagicLinkAttempt({
      req,
      email,
      status: 504,
      startedAt,
      error,
    });
    reportCriticalEndpointFailure({
      endpoint: "/api/auth/magic-link",
      status: 504,
      details: {
        stage: "otp_timeout_or_exception",
        emailDomain: getEmailDomain(email) || null,
        error: normalizeErrorMessage(error),
      },
    });
    return res.status(504).json({
      error:
        "The sign-in email is taking too long to send. Please wait a minute and try again.",
    });
  }

  if (linkResult.error) {
    if (isAuthEmailCooldownError(linkResult.error)) {
      await logMagicLinkAttempt({
        req,
        email,
        status: 429,
        startedAt,
        error: linkResult.error,
        flaggedReason: "supabase_auth_cooldown",
      });
      return res.status(429).json({
        error:
          "Too many sign-in email requests. Please wait a few minutes before trying again.",
      });
    }

    console.error(
      "Supabase generateLink error:",
      serializeError(linkResult.error),
    );
    await logMagicLinkAttempt({
      req,
      email,
      status: 502,
      startedAt,
      error: linkResult.error,
    });
    reportCriticalEndpointFailure({
      endpoint: "/api/auth/magic-link",
      status: 502,
      details: {
        stage: "otp_provider_error",
        emailDomain: getEmailDomain(email) || null,
        error: normalizeErrorMessage(linkResult.error),
      },
    });
    return res
      .status(502)
      .json({ error: normalizeErrorMessage(linkResult.error) });
  }

  const actionLink = linkResult.data?.properties?.action_link;
  const emailOtp = linkResult.data?.properties?.email_otp;
  if (!actionLink || !emailOtp) {
    await logMagicLinkAttempt({
      req,
      email,
      status: 502,
      startedAt,
      error: "missing_auth_link_or_otp",
    });
    reportCriticalEndpointFailure({
      endpoint: "/api/auth/magic-link",
      status: 502,
      details: {
        stage: "missing_auth_link_or_otp",
        emailDomain: getEmailDomain(email) || null,
      },
    });
    return res.status(502).json({
      error: "Unable to create the sign-in email. Please try again.",
    });
  }

  try {
    await withTimeout(
      sendAuthEmail({ email, actionLink, otp: emailOtp }),
      MAGIC_LINK_TIMEOUT_MS,
    );
  } catch (error) {
    console.error("Resend auth email error:", serializeError(error));
    await logMagicLinkAttempt({
      req,
      email,
      status: 502,
      startedAt,
      error,
    });
    reportCriticalEndpointFailure({
      endpoint: "/api/auth/magic-link",
      status: 502,
      details: {
        stage: "auth_email_delivery_error",
        emailDomain: getEmailDomain(email) || null,
        error: normalizeErrorMessage(error),
      },
    });
    return res.status(502).json({
      error: "Unable to send the sign-in email. Please try again.",
    });
  }

  await logMagicLinkAttempt({
    req,
    email,
    status: 200,
    startedAt,
  });

  return res.status(200).json({
    message: "Magic link sent successfully! Please check your email.",
  });
}
