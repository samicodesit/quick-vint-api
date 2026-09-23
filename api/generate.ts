import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OpenAI } from "openai";
import type {
  ChatCompletionContentPart,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import Cors from "cors";
import { supabase } from "../utils/supabaseClient";
import {
  getGenerationReservationParams,
  RateLimiter,
} from "../utils/rateLimiter";
import { ApiLogger } from "../utils/apiLogger";
import { languageMap } from "../utils/languageMap";
import { isDisposableEmail } from "../utils/disposableDomains";
import { detectAndPauseDuplicateIpAccount } from "../utils/duplicateIpAutoPause";
import { getMeasurementAdvice, isClothingItem } from "../utils/helperTips";
import { getEffectiveTier } from "../utils/tierConfig";
import {
  buildAccountPausedResponse,
  isAccountPaused,
} from "../src/utils/accountPause";
import {
  maybeCreateGenerationOffer,
  normalizeGenerationMode,
} from "../utils/generationOffers";
import {
  DEFAULT_OPENAI_IMAGE_DETAIL,
  DEFAULT_OPENAI_MODEL,
  getOpenAIChatTemperatureParam,
  getOpenAIChatTokenLimitParam,
} from "../utils/openaiModelExperiment";
import {
  appendDescriptionFooter,
  canUseDescriptionFooter,
  redactDescriptionFooterFromBody,
  validateDescriptionFooterText,
} from "../utils/descriptionFooter";
import { extractOpenAIRateLimitHeaders } from "../utils/openaiRateLimitHeaders";
import { parseOpenAIListingOutput } from "../utils/openaiListingOutput";
import { prepareOpenAIImageUrls } from "../utils/openaiImageUrls";
import { validateAiInstructions } from "../utils/aiInstructions";
import { reportCriticalEndpointFailure } from "../utils/criticalEndpointAlert";
import { shouldStoreDebugGenerationImages } from "../utils/debugGenerationImages";
import {
  isAllowedAppOrigin,
  isAllowedVintedOrigin,
  getPricingLimitsModeForClient,
  getMobileWebClient,
  isMobileWebEnabled,
  isValidMobileRequestId,
  MOBILE_WEB_DISABLED_RESPONSE,
} from "../utils/mobileWeb";
import type {
  MobileGenerationRequestBody,
  MobileGenerationResponse,
  StoredResponseValidation,
} from "../utils/mobileGenerationTypes";
import {
  claimMobileGenerationIdempotency,
  completeMobileGenerationIdempotency,
  failMobileGenerationIdempotency,
  markMobileGenerationCommitPending,
  normalizeMobileGenerationRequest,
  reserveAndBindMobileGenerationReservation,
  sanitizeStoredFailureBody,
  validateStoredResponse,
} from "../utils/mobileGenerationIdempotency";
import messagesEn from "../messages/en.json";
import messagesFr from "../messages/fr.json";
import messagesDe from "../messages/de.json";
import messagesNl from "../messages/nl.json";
import messagesPl from "../messages/pl.json";

const OPEN_AI_MAX_OUTPUT_TOKENS = 1000;
const DEBUG_IMAGE_BUCKET = "temp-uploads";
const DEBUG_IMAGE_MAX_COUNT = 8;
const DEBUG_IMAGE_MAX_BYTES = 1_500_000;

function sanitizeMobileFailureBody(body: Record<string, unknown>) {
  return typeof sanitizeStoredFailureBody === "function"
    ? sanitizeStoredFailureBody(body)
    : body;
}

function sanitizeProviderErrorForLog(value: unknown): string {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : String(value || "Unknown provider error");
  return message
    .replace(/https?:\/\/[^\s)]+/gi, "[redacted-url]")
    .replace(/data:[^\s)]+/gi, "[redacted-data]")
    .replace(/\bbearer\s+[^\s,;]+/gi, "[redacted-bearer]")
    .replace(
      /\b(?:jwt\s+)?[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gi,
      "[redacted-jwt]",
    )
    .replace(
      /\b(?:token|secret|api[_-]?key|authorization|jwt)\s*[:=]\s*[^\s,;]+/gi,
      "[redacted-token]",
    )
    .replace(
      /\b(?:[a-z][a-z0-9]*[_-])?(?:token|secret|key)\s*[:=]\s*[^\s,;]+/gi,
      "[redacted-token]",
    )
    .replace(
      /\b(?:sk|pk|rk|tok|token|secret|key)[-_: =][A-Za-z0-9._~-]{8,}\b/gi,
      "[redacted-token]",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function validateMobileStoredResponse(
  response: Record<string, unknown>,
): StoredResponseValidation {
  if (typeof validateStoredResponse === "function") {
    return validateStoredResponse(response);
  }

  try {
    const serialized = JSON.stringify(response);
    const bytes = Buffer.byteLength(serialized, "utf8");
    return bytes > 32 * 1024
      ? { ok: false as const, code: "response_too_large" as const }
      : {
          ok: true as const,
          response: response as MobileGenerationResponse,
          serialized,
          bytes,
        };
  } catch {
    return { ok: false as const, code: "invalid_response" as const };
  }
}

const cors = Cors({
  origin: (incomingOrigin, callback) => {
    if (!incomingOrigin) return callback(null, true);
    if (isAllowedAppOrigin(incomingOrigin)) return callback(null, true);
    if (isAllowedVintedOrigin(incomingOrigin)) return callback(null, true);
    return callback(new Error("CORS origin denied for generate"), false);
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Autolister-Extension-Version",
    "X-Autolister-Client",
    "X-Autolister-Request-Id",
  ],
  preflightContinue: true,
});

function runCors(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) => {
    cors(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

const openai = new OpenAI({ apiKey: process.env.VERCEL_APP_OPENAI_API_KEY });

function getDebugImageExtension(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function parseDebugImageDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  if (!mimeType.startsWith("image/")) return null;

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > DEBUG_IMAGE_MAX_BYTES) return null;

  return {
    buffer,
    mimeType,
    extension: getDebugImageExtension(mimeType),
  };
}

function mergeLogRequestBody(logData: any, patch: Record<string, unknown>) {
  const existing =
    logData.fullRequestBody && typeof logData.fullRequestBody === "object"
      ? logData.fullRequestBody
      : {};
  logData.fullRequestBody = {
    ...existing,
    ...patch,
  };
}

async function storeDebugGenerationImages(imageUrls: string[]) {
  const folder = `debug-gen-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const images = [];

  for (const [index, imageUrl] of imageUrls
    .slice(0, DEBUG_IMAGE_MAX_COUNT)
    .entries()) {
    const parsed = parseDebugImageDataUrl(imageUrl);
    if (!parsed) continue;

    const path = `${folder}/${String(index + 1).padStart(2, "0")}.${
      parsed.extension
    }`;
    const { error } = await supabase.storage
      .from(DEBUG_IMAGE_BUCKET)
      .upload(path, parsed.buffer, {
        contentType: parsed.mimeType,
        upsert: false,
      });

    if (error) {
      console.warn("Could not store generation debug image:", error.message);
      continue;
    }

    images.push({
      index: index + 1,
      bucket: DEBUG_IMAGE_BUCKET,
      path,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.buffer.length,
    });
  }

  return images.length
    ? {
        bucket: DEBUG_IMAGE_BUCKET,
        retentionHours: 6,
        images,
      }
    : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startTime = Date.now();
  const requestMetadata = ApiLogger.extractRequestMetadata(req);
  const extensionVersionHeader = req.headers["x-autolister-extension-version"];
  const extensionVersion = Array.isArray(extensionVersionHeader)
    ? extensionVersionHeader[0]
    : extensionVersionHeader;
  const clientHeader = req.headers["x-autolister-client"];
  const client = Array.isArray(clientHeader) ? clientHeader[0] : clientHeader;
  const mobileWebClient = getMobileWebClient(client);
  const isMobileWebRequest = mobileWebClient === "mobile_web";
  const requestIdHeader = req.headers["x-autolister-request-id"];
  const mobileRequestId = Array.isArray(requestIdHeader)
    ? requestIdHeader[0]
    : requestIdHeader;
  const pricingLimitsMode = getPricingLimitsModeForClient({
    client,
    extensionVersion,
  });

  const redactedRequestBody = redactDescriptionFooterFromBody(req.body);
  const mobileSafeRequestBody =
    isMobileWebRequest &&
    redactedRequestBody &&
    typeof redactedRequestBody === "object" &&
    !Array.isArray(redactedRequestBody)
      ? (() => {
          const { imageUrls: _imageUrls, ...safeBody } =
            redactedRequestBody as Record<string, unknown>;
          return {
            ...safeBody,
            imageCount: Array.isArray(req.body?.imageUrls)
              ? req.body.imageUrls.length
              : 0,
          };
        })()
      : redactedRequestBody;

  // Initialize log data
  let logData: any = {
    ...requestMetadata,
    endpoint: "/api/generate",
    fullRequestBody: mobileSafeRequestBody,
    extensionVersion,
    pricingLimitsMode,
  };

  // Extract imageUrls early for logging purposes (even if validation fails later)
  if (req.body && Array.isArray(req.body.imageUrls)) {
    logData.imageUrls = isMobileWebRequest
      ? { count: req.body.imageUrls.length }
      : req.body.imageUrls;
  }

  try {
    await runCors(req, res);
  } catch (corsError: any) {
    logData.responseStatus = 403;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = `CORS error: ${corsError.message}`;
    await ApiLogger.logRequest(logData);
    return res.status(403).json({ error: corsError.message });
  }

  if (req.method === "OPTIONS") {
    logData.responseStatus = 200;
    logData.processingDurationMs = Date.now() - startTime;
    await ApiLogger.logRequest(logData);
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    logData.responseStatus = 405;
    logData.processingDurationMs = Date.now() - startTime;
    await ApiLogger.logRequest(logData);
    return res.status(405).json({ error: "Only POST allowed" });
  }

  if (isMobileWebRequest && !isMobileWebEnabled()) {
    logData.responseStatus = 404;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Mobile web app disabled";
    await ApiLogger.logRequest(logData);
    return res.status(404).json(MOBILE_WEB_DISABLED_RESPONSE);
  }

  // --- AUTH ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logData.responseStatus = 401;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Auth header missing or malformed";
    await ApiLogger.logRequest(logData);
    return res.status(401).json({ error: "Missing or invalid Authorization" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    logData.responseStatus = 401;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Auth token missing from header";
    await ApiLogger.logRequest(logData);
    return res.status(401).json({ error: "Missing or invalid Authorization" });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);
  if (userError || !user) {
    logData.responseStatus = 401;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = `Token validation failed: ${userError?.message || "No user found for token"}`;
    await ApiLogger.logRequest(logData);
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Add user info to log data
  logData.userId = user.id;
  logData.userEmail = user.email;

  if (isMobileWebRequest && !isValidMobileRequestId(mobileRequestId)) {
    logData.responseStatus = 400;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Invalid mobile request id";
    await ApiLogger.logRequest(logData);
    return res.status(400).json({
      error: "A valid X-Autolister-Request-Id is required.",
      code: "invalid_request_id",
    });
  }

  const selectedModel =
    user.email?.toLowerCase() === "samicodesit+ai-style-test@gmail.com"
      ? "gpt-5.4-mini"
      : DEFAULT_OPENAI_MODEL;
  const selectedImageDetail = DEFAULT_OPENAI_IMAGE_DETAIL;

  if (isDisposableEmail(user.email || "")) {
    logData.responseStatus = 403;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Disposable email blocked";
    await ApiLogger.logRequest(logData);
    return res.status(403).json({
      error:
        "Disposable emails are not allowed. If you have previously used or attempt to use one, you risk legal action. Contact us for appeal, or if you believe this is a mistake.",
    });
  }

  // --- PROFILE & LIMITS ---
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "api_calls_this_month, subscription_status, subscription_tier, last_api_call_reset, is_legacy_plan, free_lifetime_generations_used, pack_credits, custom_daily_limit, custom_monthly_limit, custom_limit_expires_at, account_status, abuse_reason, ai_instructions",
    )
    .eq("id", user.id)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    console.error("Error fetching profile:", profileError);
    logData.responseStatus = 500;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Profile fetch error";
    await ApiLogger.logRequest(logData);
    reportCriticalEndpointFailure({
      endpoint: "/api/generate",
      status: 500,
      userId: user.id,
      details: {
        stage: "profile_fetch",
        extensionVersion,
        pricingLimitsMode,
        error: profileError.message,
        errorCode: profileError.code,
      },
    });
    return res.status(500).json({ error: "Could not retrieve profile." });
  }

  // Initialize profile for new users
  if (!profile || !profile.last_api_call_reset) {
    const { error: upsertError } = await supabase.from("profiles").upsert({
      id: user.id,
      api_calls_this_month: 0, // Will be incremented by rate limiter
      last_api_call_reset: new Date().toISOString(),
      subscription_status: profile?.subscription_status || "free",
      subscription_tier: profile?.subscription_tier || "free",
      free_lifetime_generations_used:
        profile?.free_lifetime_generations_used || 0,
      pack_credits: profile?.pack_credits || 0,
    });

    if (upsertError) {
      console.error("Error initializing user profile:", upsertError);
      logData.responseStatus = 500;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = "Profile initialization error";
      await ApiLogger.logRequest(logData);
      reportCriticalEndpointFailure({
        endpoint: "/api/generate",
        status: 500,
        userId: user.id,
        details: {
          stage: "profile_initialization",
          extensionVersion,
          pricingLimitsMode,
          error: upsertError.message,
          errorCode: upsertError.code,
        },
      });
      return res
        .status(500)
        .json({ error: "Failed to initialize user profile." });
    }
  }

  // Use the existing profile or the default values for new users
  const userProfile = profile || {
    api_calls_this_month: 0,
    subscription_status: "free",
    subscription_tier: "free",
    last_api_call_reset: new Date().toISOString(),
    is_legacy_plan: false,
    free_lifetime_generations_used: 0,
    pack_credits: 0,
    account_status: "active",
    abuse_reason: null,
    ai_instructions: null,
  };

  // Add user profile info to log data
  logData.subscriptionTier = userProfile.subscription_tier;
  logData.subscriptionStatus = userProfile.subscription_status;
  logData.apiCallsCount = userProfile.api_calls_this_month;
  let generationReservationId: string | null = null;
  let mobileReservationCommitState:
    | "not_attempted"
    | "commit_pending"
    | "committed"
    | "uncertain" = "not_attempted";

  const duplicateIpPause = await detectAndPauseDuplicateIpAccount({
    userId: user.id,
    email: user.email,
    ipAddress: requestMetadata.ipAddress,
    source: "generate",
    currentProfile: {
      id: user.id,
      email: user.email,
      subscription_status: userProfile.subscription_status,
      subscription_tier: userProfile.subscription_tier,
      account_status: userProfile.account_status,
      free_lifetime_generations_used:
        userProfile.free_lifetime_generations_used,
    },
  });
  if (duplicateIpPause.paused) {
    logData.responseStatus = 403;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Account paused";
    await ApiLogger.logRequest(logData);
    return res.status(403).json(
      buildAccountPausedResponse({
        account_status: "paused",
        abuse_reason: "duplicate_ip_signup",
      }),
    );
  }

  if (isAccountPaused(userProfile)) {
    logData.responseStatus = 403;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Account paused";
    await ApiLogger.logRequest(logData);
    return res.status(403).json(buildAccountPausedResponse(userProfile));
  }

  // --- VALIDATE BODY ---
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    logData.responseStatus = 400;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Invalid request body";
    await ApiLogger.logRequest(logData);
    return res
      .status(400)
      .json({ error: "imageUrls must be a non-empty array of strings." });
  }

  const {
    imageUrls,
    languageCode,
    titleLanguageCode,
    descriptionLanguageCode,
    tone,
    useEmojis,
    useHashtags,
    emojiRetry,
    useBulletPoints,
    descriptionLength,
    descriptionFooterText,
    generationMode,
  } = req.body;
  const normalizedGenerationMode = normalizeGenerationMode(generationMode);
  if (
    isMobileWebRequest &&
    generationMode !== undefined &&
    generationMode !== "manual" &&
    generationMode !== "phone_upload" &&
    generationMode !== "batch"
  ) {
    logData.responseStatus = 400;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Invalid generation mode";
    await ApiLogger.logRequest(logData);
    return res.status(400).json({
      error: "generationMode must be manual, phone_upload, or batch.",
      code: "invalid_generation_mode",
    });
  }
  const normalizedDescriptionLength =
    descriptionLength === "short" ? "short" : "long";

  const titleLanguageCodeStr = String(
    titleLanguageCode || languageCode || "en",
  ).toLowerCase();
  const descriptionLanguageCodeStr = String(
    descriptionLanguageCode || languageCode || "en",
  ).toLowerCase();
  const titleLanguage = languageMap[titleLanguageCodeStr] || "English";
  const descriptionLanguage =
    languageMap[descriptionLanguageCodeStr] || "English";

  // --- CONSTRUCT PROMPT INSTRUCTIONS ---
  // Only pro/business tiers can customize tone
  const effectiveTier = getEffectiveTier(userProfile);
  const tierAllowsExtras =
    effectiveTier === "pro" || effectiveTier === "business";
  const tierAllowsDescriptionFooter = canUseDescriptionFooter(effectiveTier);

  let effectiveDescriptionFooterText = "";
  if (tierAllowsDescriptionFooter) {
    const footerValidation = validateDescriptionFooterText(
      descriptionFooterText,
    );
    if (!footerValidation.ok) {
      logData.responseStatus = 400;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = "Invalid saved note";
      await ApiLogger.logRequest(logData);
      return res.status(400).json({ error: footerValidation.error });
    }
    effectiveDescriptionFooterText = footerValidation.text;
  }

  let toneInstruction = "plain, factual, and natural like a real Vinted seller"; // Default for 'standard'
  if (tierAllowsExtras) {
    if (tone === "friendly")
      toneInstruction =
        "warm, casual, and conversational while staying factual";
    else if (tone === "professional")
      toneInstruction =
        "clean, concise, and reseller-like with practical buyer details";
    else if (tone === "enthusiastic")
      toneInstruction =
        "lightly upbeat and positive, but never exaggerated or salesy";
  }

  const emojisDisabledByUser = useEmojis === false || useEmojis === "false";
  const emojisEnabled =
    effectiveTier === "free"
      ? !emojisDisabledByUser
      : tierAllowsExtras && (useEmojis === true || useEmojis === "true");
  const emojiInstruction = emojisEnabled
    ? "Use relevant emojis naturally in the description, but do not overdo it. Do not add marketing phrases just to use emojis. Do not use emojis in the title or hashtags."
    : "Do NOT use any emojis in the description.";
  const hashtagsEnabled = useHashtags !== false && useHashtags !== "false";
  const hashtagInstruction = hashtagsEnabled
    ? "End with 8-10 relevant hashtags using visible evidence: brand if known, item type, color/style, and product category."
    : "Do not include hashtags anywhere in the title or description.";

  // bullet points vs paragraphs
  const bulletEmojiInstruction = emojisEnabled
    ? " Use relevant emojis in bullet points too, not only in the opening sentence. Keep them natural and do not overdo it."
    : "";
  const paragraphEmojiInstruction = emojisEnabled
    ? " Use emojis sparingly."
    : "";
  const bulletSpacingInstruction =
    " Put one empty line before the first bullet and one empty line after the final bullet before any hashtags.";
  const bulletOpeningInstruction =
    "Use one natural opening sentence before the bullets. It can be fuller when useful and should mention a realistic wearing occasion when the item clearly suggests one, without guessing.";
  const bulletpointInstruction =
    useBulletPoints === true || useBulletPoints === "true"
      ? normalizedDescriptionLength === "short"
        ? `${bulletOpeningInstruction} Then only add the useful bullet points the photos support. Usually 2-4 bullets; fewer is fine. Keep each bullet very short, around 4-6 words and one visible or readable fact. Each bullet starts with '- '.${bulletSpacingInstruction}${bulletEmojiInstruction}`
        : `${bulletOpeningInstruction} Then only add the useful bullet points the photos support. Usually 3-5 bullets; fewer is fine for simple items. Each bullet starts with '- ' and should be fuller seller-style detail, usually around 8-14 words when real evidence exists. Combine closely related visible or readable facts, without adding assumptions or padding.${bulletSpacingInstruction}${bulletEmojiInstruction}`
      : normalizedDescriptionLength === "short"
        ? `Use 1 short paragraph, or 2 only when the photos support enough facts. Keep sentences short and direct.${paragraphEmojiInstruction}`
        : `Use 1-2 paragraphs. Write fuller natural seller-style sentences only when supported by visible or readable details.${paragraphEmojiInstruction}`;
  const aiInstructionsValidation = validateAiInstructions(
    userProfile.ai_instructions,
  );
  const customAiInstructions = aiInstructionsValidation.ok
    ? aiInstructionsValidation.text || ""
    : "";
  mergeLogRequestBody(logData, {
    hasCustomAiInstructions: Boolean(customAiInstructions),
    customAiInstructionsLength: customAiInstructions.length,
  });

  if (
    !Array.isArray(imageUrls) ||
    imageUrls.length === 0 ||
    !imageUrls.every((u) => typeof u === "string" && u.trim())
  ) {
    logData.responseStatus = 400;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Invalid imageUrls format";
    await ApiLogger.logRequest(logData);
    return res
      .status(400)
      .json({ error: "imageUrls must be a non-empty array of strings." });
  }

  // --- RATE LIMITING ---
  // Reserve after request validation so malformed calls do not consume a user's
  // listing entitlement, but before OpenAI so parallel calls cannot overspend.
  // The no-emoji retry is an extension-only allowance. Mobile web uses the
  // regular atomic reservation path so it cannot bypass idempotency binding.
  const isEmojiRetryRequest =
    !isMobileWebRequest &&
    (emojiRetry === true || emojiRetry === "true") &&
    emojisDisabledByUser;

  let mobileIdempotencyRecordId: string | null = null;
  let mobileIdempotencyAttemptId: string | null = null;
  let mobileRequestHash: string | null = null;
  if (isMobileWebRequest) {
    const normalizedMobileRequest = normalizeMobileGenerationRequest(
      req.body as MobileGenerationRequestBody,
    );
    mobileRequestHash = normalizedMobileRequest.hash;

    let claim;
    try {
      claim = await claimMobileGenerationIdempotency({
        userId: user.id,
        requestId: mobileRequestId as string,
        requestHash: mobileRequestHash,
      });
    } catch {
      logData.responseStatus = 503;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = "Mobile idempotency claim unavailable";
      await ApiLogger.logRequest(logData);
      return res.status(503).json({
        error: "Could not reserve this generation request. Please try again.",
        code: "idempotency_unavailable",
      });
    }

    if (claim.kind === "succeeded") {
      return res.status(claim.statusCode).json(claim.response);
    }
    if (claim.kind === "failed") {
      return res.status(claim.statusCode).json(claim.body);
    }
    if (claim.kind === "commit_pending") {
      const verifiedCommit =
        await RateLimiter.commitGenerationReservationVerified(
          claim.reservationId,
        );
      if (!verifiedCommit.ok) {
        return res.status(503).json({
          error: "Your generation is still being finalized. Please try again.",
          code:
            verifiedCommit.state === "refunded"
              ? "generation_retry"
              : "generation_commit_pending",
        });
      }

      const completed = await completeMobileGenerationIdempotency({
        recordId: claim.recordId,
        attemptId: claim.attemptId,
        reservationId: claim.reservationId,
        response: claim.response,
      });
      if (!completed.ok) {
        return res.status(503).json({
          error: "Your generation is still being finalized. Please try again.",
          code: "generation_commit_pending",
        });
      }

      return res.status(200).json(claim.response);
    }
    if (claim.kind === "in_progress") {
      return res.status(409).json({
        error: "A generation for this request is already in progress.",
        code: "generation_in_progress",
      });
    }
    if (claim.kind === "conflict") {
      return res.status(409).json({
        error: "This request ID was already used for a different request.",
        code: "idempotency_conflict",
      });
    }

    mobileIdempotencyRecordId = claim.recordId;
    mobileIdempotencyAttemptId = claim.attemptId;
  }

  const rateLimitResult = isMobileWebRequest
    ? await reserveAndBindMobileGenerationReservation({
        userId: user.id,
        recordId: mobileIdempotencyRecordId as string,
        attemptId: mobileIdempotencyAttemptId as string,
        requestId: mobileRequestId as string,
        requestHash: mobileRequestHash as string,
        ...getGenerationReservationParams(userProfile, pricingLimitsMode),
      })
    : isEmojiRetryRequest
      ? await RateLimiter.reserveEmojiRetry(
          user.id,
          userProfile,
          pricingLimitsMode,
        )
      : await RateLimiter.reserveGenerationRequest(
          user.id,
          userProfile,
          pricingLimitsMode,
        );

  if (!rateLimitResult.allowed) {
    if (
      isMobileWebRequest &&
      rateLimitResult.code === "idempotency_bind_failed"
    ) {
      const failureBody = {
        error: "Could not reserve this generation request. Please try again.",
        code: "idempotency_bind_failed",
      };
      await failMobileGenerationIdempotency({
        recordId: mobileIdempotencyRecordId as string,
        attemptId: mobileIdempotencyAttemptId as string,
        statusCode: 503,
        body: failureBody,
        retryable: true,
        failureCode: "idempotency_bind_failed",
      });
      logData.responseStatus = 503;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = "Mobile atomic reservation binding failed";
      await ApiLogger.logRequest(logData);
      return res.status(503).json(failureBody);
    }

    logData.responseStatus = 429;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Rate limit exceeded";
    await ApiLogger.logRequest(logData);
    const rateLimitBody = {
      error:
        rateLimitResult.error || "Too many requests. Please try again later.",
      code: rateLimitResult.code,
      currentTier: rateLimitResult.currentTier,
      nextTier: rateLimitResult.nextTier,
      limitScope: rateLimitResult.limitScope,
      currentLimit: rateLimitResult.currentLimit,
      remainingRequests: rateLimitResult.remainingRequests,
    };
    const mobileRateLimitBody = sanitizeMobileFailureBody(rateLimitBody);
    if (
      mobileIdempotencyRecordId &&
      mobileReservationCommitState === "not_attempted"
    ) {
      await failMobileGenerationIdempotency({
        recordId: mobileIdempotencyRecordId,
        attemptId: mobileIdempotencyAttemptId as string,
        statusCode: 429,
        body: mobileRateLimitBody,
        retryable: false,
        failureCode: rateLimitResult.code || "rate_limit",
      });
    }
    return res
      .status(429)
      .json(mobileIdempotencyRecordId ? mobileRateLimitBody : rateLimitBody);
  }

  generationReservationId = rateLimitResult.reservationId ?? null;
  if (isMobileWebRequest) {
    if (!generationReservationId) {
      await failMobileGenerationIdempotency({
        recordId: mobileIdempotencyRecordId as string,
        attemptId: mobileIdempotencyAttemptId as string,
        statusCode: 503,
        body: {
          error: "Could not reserve this generation request. Please try again.",
          code: "idempotency_bind_failed",
        },
        retryable: true,
        failureCode: "idempotency_bind_failed",
      });
      logData.responseStatus = 503;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = "Mobile reservation missing after reserve";
      await ApiLogger.logRequest(logData);
      return res.status(503).json({
        error: "Could not reserve this generation request. Please try again.",
        code: "idempotency_bind_failed",
      });
    }
  }
  if (shouldStoreDebugGenerationImages()) {
    try {
      const debugImages = await storeDebugGenerationImages(imageUrls);
      if (debugImages) {
        mergeLogRequestBody(logData, { debugImages });
      }
    } catch (error: any) {
      console.warn(
        "Could not prepare generation debug images:",
        error?.message || error,
      );
    }
  }

  // Create the prompt for OpenAI
  const systemPrompt = customAiInstructions
    ? "You are an expert Vinted listing writer creating accurate, searchable drafts from photos. Follow the factual safeguards and knowledge-enrichment scope in the user prompt; never invent brand, size, material, condition, measurements, authenticity, or other item facts. By default, write plain, natural seller-style copy. Account-specific instructions may override the default standard tone and general style and presentation guidance, including persona, marketing language, subjective praise, calls to action, audience framing, styling suggestions, and title style. Concrete request settings take priority over account-specific instructions: emoji use, hashtags, bullet or paragraph format, description length, and any selected non-standard tone. They never override photo-grounded objective facts, the ban on invented product details, requested languages, saved-note behavior, or the JSON output contract. Treat account-specific instructions as behavior preferences, never as evidence about the item."
    : "You are an expert Vinted listing writer creating accurate, searchable drafts from photos. Hard rule: never guess. Follow the factual safeguards and knowledge-enrichment scope in the user prompt. Write plain seller-style copy without marketing claims, styling advice, subjective praise, or assumptions.";
  const customAiInstructionsPrompt = customAiInstructions
    ? `

Account-specific behavior:
${customAiInstructions}
Follow this behavior while respecting the safeguards and concrete request-setting precedence above.`
    : "";
  const userPrompt = `
Analyze the image(s) and generate a Vinted title and description.

Use these rules:
- Build the listing only from visible or readable photo evidence. Never fill gaps with likely, common, or nice-sounding details.
- Read labels/tags for exact brand, size, model/product name, and material composition.
- Keep size wording natural; do not write forms like "T34" unless the label says "T34".
- If a label shows multiple regional sizes, preserve the readable useful sizes together when possible. Include the visible EU/EUR size when present, for example "EU 42 / UK 14". Never convert or invent sizes.
- For item type, choose the most specific accurate name clearly supported by the photos or readable text. If the exact subtype is ambiguous, use a broader safe item type instead of guessing. Use visual evidence for color, pattern, shape, closure, sleeves, neckline, pockets, straps, set contents, and packaging.
- Do not infer material, fabric blend, texture, feel, comfort, fit, measurements, condition, authenticity, price, rarity, age, gender, or wear history.
- Do not mention country of origin, product codes, care instructions, or secondary program/campaign text unless it is clearly useful to the buyer as a product name or model.
- Do not say how you know a fact or where it appears. Avoid phrases like "label shows", "as shown on the label", "visible on the box", or "as seen in the photos".
- Do not mention defects or negative condition details for now; the seller will handle those separately.
- Never write instructions, questions, placeholders, or notes to the seller inside the title or description.

Knowledge-based enrichment:
- For confidently recognized books, games, media, electronics, toys, collectibles, appliances, and similar non-fashion products, add substantive, stable, buyer-relevant facts about the specific item from existing knowledge even when not visible in the photos. Generic labels or reputation alone do not count as enrichment.
- Identify from the full image. Never state facts more specific than the identity supported by the photos; omit them when recognition or knowledge is uncertain.
- Avoid padding, trivia, repetition, and promotional claims. Exclude ordinary apparel, footwear, bags, jewelry, and fashion accessories.

Title:
- Write only the title in ${titleLanguage}.
- Use a natural searchable format: brand if known, model/product name if known, color/pattern, item type, size if known.
- Prefer a fuller searchable title when real evidence exists: include one extra concrete visible detail such as model, cut, closure, neckline, pattern, set count, or clearly supported product subtype. Aim for about 35-70 characters, but keep simple items shorter and never pad.
- Do not use emojis, hashtags, hype, or condition claims in the title.

Description:
- Write only the description in ${descriptionLanguage}.
- Start with a plain factual sentence naming the item, color, brand, and exact visible size or sizes when known.
- Add useful visible or readable details, then stop when the evidence runs out.
- ${hashtagInstruction}

Request settings:
- Title language: write only the title in ${titleLanguage}.
- Description language: write only the description in ${descriptionLanguage}.
- Tone: ${toneInstruction}.
- ${emojiInstruction}
- ${bulletpointInstruction}
- Description length: ${normalizedDescriptionLength}.
- This controls how much useful detail each sentence or bullet contains, not just the number of bullets.${customAiInstructionsPrompt}
Reply only in JSON: {"title":"...","description":"..."}
        `.trim();

  // Log the full prompt being sent to OpenAI
  logData.rawPrompt = `System: ${systemPrompt}\n\nUser: ${userPrompt}\n\nImages: ${imageUrls.length} image(s)\nModel: ${selectedModel}\nImage detail: ${selectedImageDetail}`;
  logData.openaiModel = selectedModel;

  // Check for suspicious activity
  const suspiciousCheck = ApiLogger.detectSuspiciousActivity({
    imageUrls,
    userAgent: logData.userAgent,
  });

  if (suspiciousCheck.suspicious) {
    logData.suspiciousActivity = true;
    logData.flaggedReason = suspiciousCheck.reasons.join("; ");
    console.warn(
      `🚨 Suspicious activity detected for user ${user.id}:`,
      suspiciousCheck.reasons,
    );
  }

  // --- GENERATE VIA OPENAI ---
  logData.openaiModel = selectedModel;
  try {
    const openAIImageUrls = await prepareOpenAIImageUrls(imageUrls);
    mergeLogRequestBody(logData, {
      openaiImageUrlKinds: openAIImageUrls.map((url) =>
        url.startsWith("data:") ? "data_url" : "remote_url",
      ),
    });

    const parts: ChatCompletionContentPart[] = openAIImageUrls.map((url) => ({
      type: "image_url",
      image_url: { url, detail: selectedImageDetail },
    }));

    const createCompletion = (model: string) => {
      const completionParams: ChatCompletionCreateParamsNonStreaming = {
        model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: userPrompt,
              },
              ...parts,
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "listing",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string", minLength: 1 },
                description: { type: "string", minLength: 1 },
              },
              required: ["title", "description"],
            },
          },
        },
        ...getOpenAIChatTemperatureParam(model, 0.3),
        ...getOpenAIChatTokenLimitParam(model, OPEN_AI_MAX_OUTPUT_TOKENS),
      };

      return openai.chat.completions.create(completionParams).withResponse();
    };

    const { data: chat, response: openaiResponse } =
      await createCompletion(selectedModel);

    // Log token usage and rate limit info
    logData.openaiTokensUsed = chat.usage?.total_tokens;
    logData.openaiPromptTokens = chat.usage?.prompt_tokens;
    logData.openaiCompletionTokens = chat.usage?.completion_tokens;
    logData.openaiCachedTokens =
      chat.usage?.prompt_tokens_details?.cached_tokens;
    const rateLimitInfo = extractOpenAIRateLimitHeaders(openaiResponse.headers);
    logData.openaiRateLimitInfo = rateLimitInfo;
    console.log("🔄 OpenAI Rate Limit Status:", rateLimitInfo);

    const content = chat.choices?.[0]?.message?.content ?? "{}";
    const { title, description } = parseOpenAIListingOutput(content);
    const finalDescription = appendDescriptionFooter(
      description,
      effectiveDescriptionFooterText,
    );

    // Generate localized measurement advice if item is clothing
    const messagesMap: Record<string, any> = {
      en: messagesEn,
      fr: messagesFr,
      de: messagesDe,
      nl: messagesNl,
      pl: messagesPl,
    };
    const messages = messagesMap[descriptionLanguageCodeStr] || messagesEn;
    const isClothing = isClothingItem(title, finalDescription);
    const measurementAdvice = getMeasurementAdvice(isClothing, messages);

    const mobileResponse = {
      title,
      description: finalDescription,
      measurementAdvice,
      offers: undefined as unknown,
    };

    if (mobileIdempotencyRecordId) {
      const responseValidation = validateMobileStoredResponse(mobileResponse);
      if (!responseValidation.ok) {
        await RateLimiter.refundGenerationReservation(
          generationReservationId,
          "response_too_large",
        );
        await failMobileGenerationIdempotency({
          recordId: mobileIdempotencyRecordId,
          attemptId: mobileIdempotencyAttemptId as string,
          statusCode: 500,
          body: {
            error: "The generated response was too large. Please try again.",
            code: responseValidation.code,
          },
          reservationId: generationReservationId,
          retryable: false,
          failureCode: responseValidation.code,
        });
        logData.responseStatus = 500;
        logData.processingDurationMs = Date.now() - startTime;
        logData.flaggedReason = responseValidation.code;
        await ApiLogger.logRequest(logData);
        return res.status(500).json({
          error: "The generated response was too large. Please try again.",
          code: responseValidation.code,
        });
      }

      mobileReservationCommitState = "uncertain";
      const commitPending = await markMobileGenerationCommitPending({
        recordId: mobileIdempotencyRecordId,
        attemptId: mobileIdempotencyAttemptId as string,
        reservationId: generationReservationId as string,
        response: responseValidation.response,
      });
      if (!commitPending.ok) {
        await RateLimiter.refundGenerationReservation(
          generationReservationId,
          "idempotency_precommit_failed",
        );
        logData.responseStatus = 503;
        logData.processingDurationMs = Date.now() - startTime;
        logData.flaggedReason =
          commitPending.code || "Mobile idempotency pre-commit failed";
        await ApiLogger.logRequest(logData);
        return res.status(503).json({
          error: "Your generation is still being finalized. Please try again.",
          code: "generation_commit_pending",
        });
      }

      mobileReservationCommitState = "commit_pending";
      const verifiedCommit =
        await RateLimiter.commitGenerationReservationVerified(
          generationReservationId,
        );
      if (!verifiedCommit.ok) {
        mobileReservationCommitState = "uncertain";
        await markMobileGenerationCommitPending({
          recordId: mobileIdempotencyRecordId,
          attemptId: mobileIdempotencyAttemptId as string,
          reservationId: generationReservationId as string,
          response: responseValidation.response,
        });
        logData.responseStatus = 503;
        logData.processingDurationMs = Date.now() - startTime;
        logData.flaggedReason =
          verifiedCommit.error || "Generation reservation commit pending";
        await ApiLogger.logRequest(logData);
        return res.status(503).json({
          error: "Your generation is still being finalized. Please try again.",
          code: "generation_commit_pending",
        });
      }
      mobileReservationCommitState = "committed";
    }

    // Add generated content to log
    logData.generatedTitle = title;
    logData.generatedDescription = description;
    logData.responseStatus = 200;
    logData.processingDurationMs = Date.now() - startTime;

    if (mobileIdempotencyRecordId) {
      let offers: Awaited<ReturnType<typeof maybeCreateGenerationOffer>>;
      try {
        offers = await maybeCreateGenerationOffer({
          userId: user.id,
          profile: userProfile,
          pricingLimitsMode,
          generationMode: normalizedGenerationMode,
          isClothing,
          reservationId: generationReservationId,
          extensionVersion,
        });
      } catch (error) {
        console.error("Mobile generation offer creation failed:", error);
        offers = [];
      }
      const responseBody = {
        title,
        description: finalDescription,
        measurementAdvice,
        offers,
      };
      const completed = await completeMobileGenerationIdempotency({
        recordId: mobileIdempotencyRecordId,
        attemptId: mobileIdempotencyAttemptId as string,
        reservationId: generationReservationId,
        response: responseBody,
      });
      if (!completed.ok) {
        await markMobileGenerationCommitPending({
          recordId: mobileIdempotencyRecordId,
          attemptId: mobileIdempotencyAttemptId as string,
          reservationId: generationReservationId as string,
          response: responseBody,
        });
        logData.responseStatus = 503;
        logData.processingDurationMs = Date.now() - startTime;
        logData.flaggedReason = "Mobile idempotency completion failed";
        await ApiLogger.logRequest(logData);
        return res.status(503).json({
          error: "Your generation is still being finalized. Please try again.",
          code: "generation_commit_pending",
        });
      }
      await ApiLogger.logRequest(logData);
      return res.status(200).json(responseBody);
    } else {
      await ApiLogger.logRequest(logData);
      await RateLimiter.commitGenerationReservation(generationReservationId);
      const offers = await maybeCreateGenerationOffer({
        userId: user.id,
        profile: userProfile,
        pricingLimitsMode,
        generationMode: normalizedGenerationMode,
        isClothing,
        reservationId: generationReservationId,
        extensionVersion,
      });
      return res.status(200).json({
        title,
        description: finalDescription,
        measurementAdvice,
        offers,
      });
    }
  } catch (err: any) {
    const safeProviderError = sanitizeProviderErrorForLog(err);
    console.error("Generation error:", safeProviderError);

    // Determine user-friendly error message
    let userMessage =
      "We're experiencing technical difficulties. Please try again in a moment.";
    let statusCode = 500;

    // Check for specific error types
    if (isMobileWebRequest && err.status === 403) {
      userMessage =
        "The AI service rejected this request. Please try different images.";
      statusCode = 403;
    } else if (err.status === 429 || err.message?.includes("Rate limit")) {
      userMessage =
        "Our AI service is currently busy. Please try again in a few seconds.";
      statusCode = 429;
    } else if (
      err.message?.includes("timeout") ||
      err.message?.includes("timed out")
    ) {
      userMessage = "The request took too long. Please try again.";
      statusCode = 504;
    } else if (
      err.message?.includes("Invalid") ||
      err.message?.includes("invalid")
    ) {
      userMessage =
        "There was an issue processing your images. Please try different images.";
      statusCode = 400;
    }

    // Log the detailed error (for admin)
    logData.responseStatus = statusCode;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = `OpenAI generation error: ${safeProviderError}`;
    logData.openaiRateLimitInfo = extractOpenAIRateLimitHeaders(err.headers);
    if (
      !isMobileWebRequest ||
      mobileReservationCommitState === "not_attempted"
    ) {
      await RateLimiter.refundGenerationReservation(
        generationReservationId,
        statusCode === 400 ? "invalid_generation_input" : "generation_failed",
      );
    }
    if (
      mobileIdempotencyRecordId &&
      mobileReservationCommitState === "not_attempted"
    ) {
      const failureBody = sanitizeMobileFailureBody({
        error: userMessage,
        code: statusCode === 429 ? "service_unavailable" : undefined,
        provider: statusCode === 429 ? "openai" : undefined,
        limitScope: statusCode === 429 ? "service" : undefined,
      });
      await failMobileGenerationIdempotency({
        recordId: mobileIdempotencyRecordId,
        attemptId: mobileIdempotencyAttemptId as string,
        statusCode: statusCode as 400 | 403 | 429 | 500 | 503 | 504,
        body: failureBody,
        reservationId: generationReservationId,
        retryable:
          statusCode === 429 || statusCode === 500 || statusCode === 504,
        failureCode:
          statusCode === 400 ? "invalid_generation_input" : "generation_failed",
      });
    }
    await ApiLogger.logRequest(logData);
    if (statusCode >= 500) {
      reportCriticalEndpointFailure({
        endpoint: "/api/generate",
        status: statusCode,
        userId: user.id,
        details: {
          stage: "generation",
          subscriptionTier: logData.subscriptionTier,
          extensionVersion,
          pricingLimitsMode,
          openaiModel: logData.openaiModel,
          error: safeProviderError,
          errorName: err?.name,
        },
      });
    }

    // Return generic error to user (protecting sensitive details)
    const responseBody = {
      error: userMessage,
      code: statusCode === 429 ? "service_unavailable" : undefined,
      provider: statusCode === 429 ? "openai" : undefined,
      limitScope: statusCode === 429 ? "service" : undefined,
    };
    return res
      .status(statusCode)
      .json(
        mobileIdempotencyRecordId
          ? sanitizeMobileFailureBody(responseBody)
          : responseBody,
      );
  }
}
