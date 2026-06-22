import type { VercelRequest, VercelResponse } from "@vercel/node";
import Cors from "cors";
import { ApiLogger } from "../../utils/apiLogger";
import { supabase } from "../../utils/supabaseClient";

const vintedOriginPattern =
  /^https:\/\/(?:[\w-]+\.)?vinted\.(?:[a-z]{2,}|co\.[a-z]{2})$/;

const rawOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS || "";
const allowedOrigins = rawOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const cors = Cors({
  origin: (incomingOrigin, callback) => {
    if (!incomingOrigin) return callback(null, true);
    if (incomingOrigin === "https://autolister.app") return callback(null, true);
    if (allowedOrigins.includes(incomingOrigin)) return callback(null, true);
    if (vintedOriginPattern.test(incomingOrigin)) return callback(null, true);
    return callback(new Error("CORS origin denied for event tracking"), false);
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

function runCors(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) => {
    cors(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

function sanitizeEventName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]/g, "_")
    .slice(0, 80);
}

function parseBody(body: unknown) {
  if (typeof body !== "string") return body && typeof body === "object" ? body : {};

  try {
    return JSON.parse(body || "{}");
  } catch {
    return {};
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await runCors(req, res);
  } catch (corsError: any) {
    return res
      .status(403)
      .json({ error: corsError.message || "CORS check failed for event" });
  }

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const body = parseBody(req.body) as Record<string, any>;
  const event = sanitizeEventName(body.event);
  if (!event) {
    return res.status(400).json({ error: "Missing event name" });
  }

  let userId: string | undefined;
  let userEmail: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    userId = user?.id;
    userEmail = user?.email;
  }

  const metadata = ApiLogger.extractRequestMetadata(req);
  await ApiLogger.logRequest({
    ...metadata,
    userId,
    userEmail,
    endpoint: `/event/${event}`,
    responseStatus: 204,
    fullRequestBody: {
      event,
      source: body.source || null,
      page: body.page || null,
      plan: body.plan || null,
      context: body.context || null,
      extensionVersion: body.extensionVersion || null,
      utm: body.utm || null,
    },
  });

  return res.status(204).end();
}
