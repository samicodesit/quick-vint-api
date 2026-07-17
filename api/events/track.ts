import type { VercelRequest, VercelResponse } from "@vercel/node";
import Cors from "cors";
import { ApiLogger } from "../../utils/apiLogger";
import { detectAndPauseDuplicateIpAccount } from "../../utils/duplicateIpAutoPause";
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
    if (incomingOrigin === "https://autolister.app")
      return callback(null, true);
    if (allowedOrigins.includes(incomingOrigin)) return callback(null, true);
    if (vintedOriginPattern.test(incomingOrigin)) return callback(null, true);
    return callback(new Error("CORS origin denied for event tracking"), false);
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

const UNINSTALL_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

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
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString("utf8") || "{}");
    } catch {
      return {};
    }
  }

  if (typeof body !== "string")
    return body && typeof body === "object" ? body : {};

  try {
    return JSON.parse(body || "{}");
  } catch {
    return {};
  }
}

export function normalizeEventItems(body: Record<string, any>) {
  const rawItems = Array.isArray(body.events) ? body.events : [body];
  return rawItems
    .slice(0, 25)
    .map((item) => (item && typeof item === "object" ? item : {}))
    .map((item) => ({
      event: sanitizeEventName(item.event),
      source: item.source ?? body.source ?? null,
      page: item.page ?? body.page ?? null,
      plan: item.plan ?? body.plan ?? null,
      context: item.context ?? null,
      extensionVersion: item.extensionVersion ?? body.extensionVersion ?? null,
      utm: item.utm ?? body.utm ?? null,
      userId: item.userId ?? body.userId ?? item.context?.userId ?? null,
    }))
    .filter((item) => item.event);
}

export function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

export function canAttributePublicUninstallEvent(item: {
  event: string;
  source: unknown;
  page: unknown;
  userId: unknown;
}) {
  return (
    (item.event === "extension_uninstalled" ||
      item.event === "uninstall_feedback_submitted") &&
    item.source === "uninstall_page" &&
    item.page === "/uninstall" &&
    isUuid(item.userId)
  );
}

function getUninstallOpenFingerprint(
  item: ReturnType<typeof normalizeEventItems>[number],
  resolvedUserId?: string,
) {
  if (item.event !== "extension_uninstalled") return null;
  if (item.source !== "uninstall_page" || item.page !== "/uninstall")
    return null;

  const context =
    item.context && typeof item.context === "object" ? item.context : {};
  const userKey =
    resolvedUserId || item.userId || context.userId || "anonymous";
  const analyticsClientId = context.analyticsClientId || "no-cid";
  const extensionVersion =
    item.extensionVersion || context.extensionVersion || "no-version";

  return [item.event, userKey, analyticsClientId, extensionVersion].join(":");
}

function getLoggedUninstallOpenFingerprint(row: {
  user_id?: string | null;
  full_request_body?: any;
}) {
  const body = row.full_request_body || {};
  return getUninstallOpenFingerprint(
    {
      event: body.event,
      source: body.source,
      page: body.page,
      plan: body.plan,
      context: body.context,
      extensionVersion: body.extensionVersion,
      utm: body.utm,
      userId: body.userId,
    },
    row.user_id || undefined,
  );
}

async function getRecentUninstallOpenFingerprints(userId?: string) {
  if (!userId) return new Set<string>();

  const cutoffIso = new Date(
    Date.now() - UNINSTALL_DEDUPE_WINDOW_MS,
  ).toISOString();
  const { data, error } = await supabase
    .from("api_logs")
    .select("user_id, full_request_body")
    .eq("endpoint", "/event/extension_uninstalled")
    .eq("user_id", userId)
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Failed to check uninstall duplicate events:", error);
    return new Set<string>();
  }

  return new Set(
    (data || [])
      .map((row) => getLoggedUninstallOpenFingerprint(row))
      .filter((fingerprint): fingerprint is string => Boolean(fingerprint)),
  );
}

async function resolvePublicUninstallUser(
  eventItems: ReturnType<typeof normalizeEventItems>,
) {
  const attributedItem = eventItems.find(canAttributePublicUninstallEvent);
  if (!attributedItem) return {};

  const userId = String(attributedItem.userId);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data?.id) {
    return {};
  }

  return {
    userId: data.id as string,
    userEmail: (data.email as string | null) || undefined,
  };
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
  const eventItems = normalizeEventItems(body);
  if (!eventItems.length) {
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

  if (!userId) {
    const publicIdentity = await resolvePublicUninstallUser(eventItems);
    userId = publicIdentity.userId;
    userEmail = publicIdentity.userEmail;
  }

  const hasUninstallOpenEvent = eventItems.some((item) =>
    Boolean(getUninstallOpenFingerprint(item, userId)),
  );
  const recentUninstallOpenFingerprints = hasUninstallOpenEvent
    ? await getRecentUninstallOpenFingerprints(userId)
    : new Set<string>();
  const currentBatchUninstallOpenFingerprints = new Set<string>();
  const loggableEventItems = eventItems.filter((item) => {
    const fingerprint = getUninstallOpenFingerprint(item, userId);
    if (!fingerprint) return true;
    if (
      recentUninstallOpenFingerprints.has(fingerprint) ||
      currentBatchUninstallOpenFingerprints.has(fingerprint)
    ) {
      return false;
    }
    currentBatchUninstallOpenFingerprints.add(fingerprint);
    return true;
  });

  if (!loggableEventItems.length) {
    return res.status(204).end();
  }

  const metadata = ApiLogger.extractRequestMetadata(req);
  if (
    userId &&
    userEmail &&
    metadata.ipAddress &&
    loggableEventItems.some((item) =>
      ["auth_success", "listing_tools_ready"].includes(item.event),
    )
  ) {
    try {
      await detectAndPauseDuplicateIpAccount({
        userId,
        email: userEmail,
        ipAddress: metadata.ipAddress,
        source: "events_track",
      });
    } catch (error) {
      console.error("Duplicate IP auto-pause check failed:", error);
    }
  }

  await ApiLogger.logRequests(
    loggableEventItems.map((item) => ({
      ...metadata,
      userId,
      userEmail,
      endpoint: `/event/${item.event}`,
      responseStatus: 204,
      fullRequestBody: item,
    })),
  );

  return res.status(204).end();
}
