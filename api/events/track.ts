import type { VercelRequest, VercelResponse } from "@vercel/node";
import Cors from "cors";
import { ApiLogger } from "../../utils/apiLogger";
import { detectAndPauseDuplicateIpAccount } from "../../utils/duplicateIpAutoPause";
import { supabase } from "../../utils/supabaseClient";
import { shouldRunAiStyleLearning } from "../../utils/aiStyleLearning";
import { suggestAiStyle } from "../../utils/aiStyleLearner";
import { FREE_LIFETIME_LIMIT, getEffectiveTier } from "../../utils/tierConfig";

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

  const state = (profile.ai_style_learning_state || {}) as {
    analyzedAttemptIds?: string[];
    lastPaidAnalysisAt?: string;
  };
  const lastAnalyzedAttemptIds = Array.isArray(state.analyzedAttemptIds)
    ? state.analyzedAttemptIds.filter((id) => typeof id === "string")
    : [];
  const effectiveTier = getEffectiveTier(profile);
  const remainingFreeGenerations = Math.max(
    0,
    FREE_LIFETIME_LIMIT - Number(profile.free_lifetime_generations_used || 0),
  );
  if (lastAnalyzedAttemptIds.includes(generationAttemptId)) return;
  let recentGenerationAttemptIds: string[] = [];
  let editedItems: any[] = [item];
  if (effectiveTier !== "free") {
    const { data: recentGenerations } = await supabase
      .from("api_logs")
      .select("full_request_body")
      .eq("user_id", userId)
      .eq("endpoint", "/api/generate")
      .eq("response_status", 200)
      .order("created_at", { ascending: false })
      .limit(5);
    recentGenerationAttemptIds = (recentGenerations || [])
      .map((row: any) => row.full_request_body?.generationAttemptId)
      .filter((id): id is string => typeof id === "string");
    const { data: editedLogs } = await supabase
      .from("api_logs")
      .select("full_request_body")
      .eq("user_id", userId)
      .eq("endpoint", "/event/generation_output_edited")
      .gte("created_at", state.lastPaidAnalysisAt || "1970-01-01T00:00:00.000Z")
      .order("created_at", { ascending: false })
      .limit(25);
    editedItems = [
      item,
      ...(editedLogs || []).map((row: any) => row.full_request_body),
    ].filter(Boolean);
  }
  const editedAttemptIdsSinceLastAnalysis = editedItems
    .map((event: any) => event.context?.generationAttemptId)
    .filter((id): id is string => typeof id === "string");
  if (
    !shouldRunAiStyleLearning({
      effectiveTier,
      remainingFreeGenerations,
      generationAttemptId,
      lastAnalyzedAttemptIds,
      recentGenerationAttemptIds,
      editedAttemptIdsSinceLastAnalysis,
    })
  )
    return;

  const recent = new Set(recentGenerationAttemptIds);
  const examples =
    effectiveTier === "free"
      ? [currentExample]
      : (editedItems
          .filter((event: any) =>
            recent.has(event.context?.generationAttemptId),
          )
          .map(editExample)
          .filter(Boolean)
          .slice(0, 3) as NonNullable<ReturnType<typeof editExample>>[]);
  const nextState = {
    analyzedAttemptIds: [...lastAnalyzedAttemptIds, generationAttemptId].slice(
      -50,
    ),
    lastPaidAnalysisAt:
      effectiveTier === "free"
        ? state.lastPaidAnalysisAt || null
        : new Date().toISOString(),
  };
  const suggestion = await suggestAiStyle({
    currentInstructions: profile.ai_instructions || null,
    examples: examples.length ? examples : [currentExample],
  });
  const update: Record<string, any> = { ai_style_learning_state: nextState };
  if (suggestion) {
    if (effectiveTier === "free")
      update.ai_instructions = suggestion.aiInstructions;
    else {
      update.ai_style_suggestion = suggestion.aiInstructions;
      update.ai_style_suggestion_reason = suggestion.reason;
    }
  }
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
        exampleCount: examples.length,
        outcome: suggestion
          ? effectiveTier === "free"
            ? "free_style_updated"
            : "paid_suggestion_created"
          : "no_change",
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

  if (userId) {
    await Promise.allSettled(
      loggableEventItems.map((item) => maybeLearnAiStyle(userId!, item)),
    );
  }

  return res.status(204).end();
}
