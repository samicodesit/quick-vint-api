import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Cors from "cors";
import {
  continueIncidentWork,
  captureAcceptedException,
} from "../../utils/incidents/service";
import { deliverPendingNotifications } from "../../utils/incidents/notifications";
import { ApiLogger } from "../../utils/apiLogger";
import { detectAndPauseDuplicateIpAccount } from "../../utils/duplicateIpAutoPause";
import { supabase } from "../../utils/supabaseClient";
import {
  isAiStyleLearningPage,
  shouldRunAiStyleLearning,
} from "../../utils/aiStyleLearning";
import { suggestAiStyle } from "../../utils/aiStyleLearner";
import { FREE_LIFETIME_LIMIT, getEffectiveTier } from "../../utils/tierConfig";
import { ingestEnvelope } from "../../utils/incidents/ingestion";
import { isRegisteredBusiness, redact } from "../../utils/incidents/contract";

const vintedOriginPattern =
  /^https:\/\/(?:[\w-]+\.)?vinted\.(?:[a-z]{2,}|(?:co|com)\.[a-z]{2})$/;

const rawOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS || "";
const allowedOrigins = rawOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const cors = Cors({
  origin: (incomingOrigin, callback) => {
    if (!incomingOrigin) return callback(null, true);
    if (
      incomingOrigin === "https://autolister.app" ||
      incomingOrigin === "chrome-extension://mommklhpammnlojjobejddmidmdcalcl"
    )
      return callback(null, true);
    if (allowedOrigins.includes(incomingOrigin)) return callback(null, true);
    if (vintedOriginPattern.test(incomingOrigin)) return callback(null, true);
    return callback(new Error("CORS origin denied for event tracking"), false);
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

const UNINSTALL_DEDUPE_WINDOW_MS = 10 * 60 * 1000;
function editExample(item: any) {
  const context = item?.context || {};
  const fields = [
    "generatedTitle",
    "generatedDescription",
    "finalTitle",
    "finalDescription",
  ];
  if (!fields.every((field) => typeof context[field] === "string")) return null;
  return {
    generatedTitle: context.generatedTitle,
    generatedDescription: context.generatedDescription,
    finalTitle: context.finalTitle,
    finalDescription: context.finalDescription,
  };
}

async function maybeLearnAiStyle(userId: string, item: any) {
  if (item.event !== "generation_output_edited") return;
  if (!isAiStyleLearningPage(item.page)) return;
  const context = item.context || {};
  const generationAttemptId = String(context.generationAttemptId || "");
  const currentExample = editExample(item);
  if (!generationAttemptId || !currentExample) return;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "email, subscription_status, subscription_tier, free_lifetime_generations_used, ai_instructions, ai_style_learning_state",
    )
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile) return;

  // Learning is a free-trial onboarding feature. Paid edits still get logged,
  // but must not trigger model calls, history queries or profile changes.
  const effectiveTier = getEffectiveTier(profile);
  if (effectiveTier !== "free") return;
  const state = (profile.ai_style_learning_state || {}) as {
    analyzedAttemptIds?: string[];
    lastPaidAnalysisAt?: string;
  };
  const lastAnalyzedAttemptIds = Array.isArray(state.analyzedAttemptIds)
    ? state.analyzedAttemptIds.filter((id) => typeof id === "string")
    : [];
  const remainingFreeGenerations = Math.max(
    0,
    FREE_LIFETIME_LIMIT - Number(profile.free_lifetime_generations_used || 0),
  );
  if (
    !shouldRunAiStyleLearning({
      effectiveTier,
      remainingFreeGenerations,
      generationAttemptId,
      lastAnalyzedAttemptIds,
    })
  )
    return;

  const suggestion = await suggestAiStyle({
    currentInstructions: profile.ai_instructions || null,
    examples: [currentExample],
  });
  const update: Record<string, any> = {
    ai_style_learning_state: {
      ...state,
      analyzedAttemptIds: [
        ...lastAnalyzedAttemptIds,
        generationAttemptId,
      ].slice(-50),
    },
  };
  if (suggestion) update.ai_instructions = suggestion.aiInstructions;
  await supabase.from("profiles").update(update).eq("id", userId);
  await ApiLogger.logRequest({
    requestMethod: "SYSTEM",
    userId,
    userEmail: profile.email || undefined,
    endpoint: "/event/ai_style_learning",
    responseStatus: 200,
    subscriptionTier: profile.subscription_tier || "free",
    subscriptionStatus: profile.subscription_status || "free",
    fullRequestBody: {
      event: "ai_style_learning",
      context: {
        generationAttemptId,
        tier: effectiveTier,
        exampleCount: 1,
        outcome: suggestion ? "free_style_updated" : "no_change",
        reason: suggestion?.reason || null,
      },
    },
  });
}

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
  if (!eventItems.length && body.schemaVersion !== 2) {
    return res.status(400).json({ error: "Missing event name" });
  }

  let userId: string | undefined;
  let userEmail: string | undefined;
  let authenticatedUserId: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    authenticatedUserId = user?.id;
    userId = authenticatedUserId;
    userEmail = user?.email;
  }

  let loggableEventItems: any[] =
    body.schemaVersion === 2 ? body.events : eventItems;
  if (body.schemaVersion !== 2) {
    const publicIdentity = !userId
      ? await resolvePublicUninstallUser(eventItems)
      : {};
    const recent = eventItems.some(
      (item) => item.event === "extension_uninstalled",
    )
      ? await getRecentUninstallOpenFingerprints(
          userId || publicIdentity.userId,
        )
      : new Set<string>();
    const seen = new Set<string>();
    loggableEventItems = eventItems
      .filter((item) => {
        const fingerprint = getUninstallOpenFingerprint(
          item,
          userId || publicIdentity.userId,
        );
        if (!fingerprint) return true;
        if (recent.has(fingerprint) || seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return true;
      })
      .map((item) => ({
        ...item,
        id: randomUUID(),
        occurredAt: new Date().toISOString(),
      }));
    if (!loggableEventItems.length) return res.status(204).end();
  }
  const metadata = ApiLogger.extractRequestMetadata(req);
  const result = await ingestEnvelope(
    { schemaVersion: 2, events: loggableEventItems },
    authenticatedUserId,
    (raw, context) => {
      const retained =
        isRegisteredBusiness(raw.event) ||
        [
          "generate_request",
          "generate_success",
          "generate_limit_hit",
          "auth_success",
          "listing_tools_ready",
        ].includes(raw.event);
      if (!retained || ApiLogger.isInternalLogExcludedEmail(userEmail))
        return null;
      return {
        user_email: userEmail,
        endpoint: `/event/${raw.event}`,
        request_method: metadata.requestMethod,
        response_status: 204,
        user_agent: metadata.userAgent,
        origin: metadata.origin,
        ip_address: metadata.ipAddress,
        full_request_body: {
          event: raw.event,
          source: raw.source,
          page: String(raw.page || "")
            .split(/[?#]/)[0]
            .slice(0, 250),
          plan: raw.plan,
          extensionVersion: redact(raw.extensionVersion, 80),
          utm: Object.fromEntries(
            [
              "utm_source",
              "utm_medium",
              "utm_campaign",
              "utm_content",
              "utm_term",
            ]
              .filter((key) => typeof raw.utm?.[key] === "string")
              .map((key) => [key, redact(raw.utm[key], 120)]),
          ),
          context,
        },
      };
    },
    async (raw) => {
      const legacy = await resolvePublicUninstallUser(normalizeEventItems(raw));
      return legacy.userId;
    },
  );
  const accepted = result.accepted || [];
  if (authenticatedUserId) {
    if (
      userEmail &&
      metadata.ipAddress &&
      accepted.some((item) =>
        ["auth_success", "listing_tools_ready"].includes(item.event),
      )
    ) {
      try {
        await detectAndPauseDuplicateIpAccount({
          userId: authenticatedUserId,
          email: userEmail,
          ipAddress: metadata.ipAddress,
          source: "events_track",
        });
      } catch {
        /* Fail-open security enrichment. */
      }
    }
    await Promise.allSettled(
      accepted.map((item) => maybeLearnAiStyle(authenticatedUserId!, item)),
    );
  }
  if (accepted.some((item) => result.body.reports[item.id])) {
    continueIncidentWork(deliverPendingNotifications(5));
    for (const item of accepted) {
      const incidentId = result.body.reports[item.id];
      if (!incidentId || !item.identityVerified || !item.context?.stack)
        continue;
      const exception = new Error(item.context.message || item.event);
      exception.name = item.context.errorName || "ClientError";
      exception.stack = item.context.stack;
      continueIncidentWork(captureAcceptedException(exception, incidentId));
    }
  }
  if (result.status === 503) res.setHeader("Retry-After", "60");
  if (body.schemaVersion !== 2 && result.status === 200) {
    if (result.body.rejections.length)
      return res.status(503).json({ error: "Event acceptance incomplete" });
    return res.status(204).end();
  }
  return res.status(result.status).json(result.body);
}
