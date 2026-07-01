import type { VercelRequest, VercelResponse } from "@vercel/node";
import Cors from "cors";
import { ApiLogger } from "../../utils/apiLogger";
import { supabase } from "../../utils/supabaseClient";
import { isDisposableEmail } from "../../utils/disposableDomains";

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
    if (typeof candidate === "string" && candidate.trim() && candidate !== "{}") {
      return candidate;
    }
  }

  return "Unable to send the sign-in email. Please try again.";
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
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
}: {
  req: VercelRequest;
  email?: string;
  status: number;
  startedAt: number;
  error?: unknown;
}) {
  await ApiLogger.logRequest({
    ...ApiLogger.extractRequestMetadata(req),
    endpoint: "/api/auth/magic-link",
    userEmail: email,
    responseStatus: status,
    processingDurationMs: Date.now() - startedAt,
    fullRequestBody: {
      emailDomain: email?.split("@")[1]?.toLowerCase() || null,
      error: error ? serializeError(error) : null,
    },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  const body = parseBody(req.body);
  const email = typeof body.email === "string" ? body.email.trim() : "";

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

  if (isDisposableEmail(email)) {
    await logMagicLinkAttempt({
      req,
      email,
      status: 400,
      startedAt,
      error: "disposable_email",
    });
    return res.status(400).json({
      error:
        "Disposable emails are not allowed. If you have previously used or attempt to use one, you risk legal action. Contact us for appeal, or if you believe this is a mistake.",
    });
  }

  const appSiteUrl = process.env.VERCEL_APP_SITE_URL;
  if (!appSiteUrl || !appSiteUrl.startsWith("chrome-extension://")) {
    console.error(
      "VERCEL_APP_SITE_URL is not correctly set for a Chrome Extension in environment variables.",
    );
    await logMagicLinkAttempt({
      req,
      email,
      status: 500,
      startedAt,
      error: "invalid_redirect_configuration",
    });
    return res
      .status(500)
      .json({ error: "Server configuration error related to redirect URL." });
  }

  const emailRedirectTo = `${appSiteUrl}/callback.html`; // Assumes callback.html is at the root of your extension

  let otpResult;
  try {
    otpResult = await withTimeout(
      supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo,
          // shouldCreateUser: true, // Default is true, ensures user is created if they don't exist.
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
    return res.status(504).json({
      error:
        "The sign-in email is taking too long to send. Please wait a minute and try again.",
    });
  }

  if (otpResult.error) {
    console.error(
      "Supabase signInWithOtp error:",
      serializeError(otpResult.error),
    );
    await logMagicLinkAttempt({
      req,
      email,
      status: 502,
      startedAt,
      error: otpResult.error,
    });
    return res.status(502).json({ error: normalizeErrorMessage(otpResult.error) });
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
