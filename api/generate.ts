import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OpenAI } from "openai";
import type {
  ChatCompletionContentPart,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import Cors from "cors";
import { supabase } from "../utils/supabaseClient";
import { RateLimiter } from "../utils/rateLimiter";
import { ApiLogger } from "../utils/apiLogger";
import { languageMap } from "../utils/languageMap";
import { isDisposableEmail } from "../utils/disposableDomains";
import { getMeasurementAdvice, isClothingItem } from "../utils/helperTips";
import {
  getEffectiveTier,
  getPricingLimitsModeForExtension,
} from "../utils/tierConfig";
import {
  buildAccountPausedResponse,
  isAccountPaused,
} from "../src/utils/accountPause";
import {
  maybeCreateGenerationOffer,
  normalizeGenerationMode,
} from "../utils/generationOffers";
import {
  OPENAI_CONTROL_MODEL,
  getOpenAIChatTokenLimitParam,
  isOpenAIModelCompatibilityError,
  selectOpenAIModel,
} from "../utils/openaiModelExperiment";
import {
  appendDescriptionFooter,
  canUseDescriptionFooter,
  redactDescriptionFooterFromBody,
  validateDescriptionFooterText,
} from "../utils/descriptionFooter";
import { reportCriticalEndpointFailure } from "../utils/criticalEndpointAlert";
import messagesEn from "../messages/en.json";
import messagesFr from "../messages/fr.json";
import messagesDe from "../messages/de.json";
import messagesNl from "../messages/nl.json";
import messagesPl from "../messages/pl.json";

const OPEN_AI_IMAGE_DETAIL: "low" | "high" | "auto" = "low";
const OPEN_AI_MAX_OUTPUT_TOKENS = 1000;
// allow vinted page origins (so extension fetch from page context works)
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
    return callback(new Error("CORS origin denied for generate"), false);
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Autolister-Extension-Version",
  ],
});

function runCors(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) => {
    cors(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

const openai = new OpenAI({ apiKey: process.env.VERCEL_APP_OPENAI_API_KEY });

function extractOpenAIRateLimitHeaders(
  headers?: { get(name: string): string | null } | null,
) {
  if (!headers) return null;

  return {
    limitRequests: headers.get("x-ratelimit-limit-requests"),
    limitTokens: headers.get("x-ratelimit-limit-tokens"),
    remainingRequests: headers.get("x-ratelimit-remaining-requests"),
    remainingTokens: headers.get("x-ratelimit-remaining-tokens"),
    resetRequests: headers.get("x-ratelimit-reset-requests"),
    resetTokens: headers.get("x-ratelimit-reset-tokens"),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startTime = Date.now();
  const requestMetadata = ApiLogger.extractRequestMetadata(req);
  const extensionVersionHeader = req.headers["x-autolister-extension-version"];
  const extensionVersion = Array.isArray(extensionVersionHeader)
    ? extensionVersionHeader[0]
    : extensionVersionHeader;
  const pricingLimitsMode = getPricingLimitsModeForExtension(extensionVersion);

  // Initialize log data
  let logData: any = {
    ...requestMetadata,
    endpoint: "/api/generate",
    fullRequestBody: redactDescriptionFooterFromBody(req.body),
    extensionVersion,
    pricingLimitsMode,
  };

  // Extract imageUrls early for logging purposes (even if validation fails later)
  if (req.body && Array.isArray(req.body.imageUrls)) {
    logData.imageUrls = req.body.imageUrls;
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
  const modelSelection = selectOpenAIModel({ seed: user.id });

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
      "api_calls_this_month, subscription_status, subscription_tier, last_api_call_reset, is_legacy_plan, free_lifetime_generations_used, pack_credits, custom_daily_limit, custom_monthly_limit, custom_limit_expires_at, account_status, abuse_reason",
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
  };

  // Add user profile info to log data
  logData.subscriptionTier = userProfile.subscription_tier;
  logData.subscriptionStatus = userProfile.subscription_status;
  logData.apiCallsCount = userProfile.api_calls_this_month;
  let generationReservationId: string | null = null;

  if (isAccountPaused(userProfile)) {
    logData.responseStatus = 403;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Account paused";
    await ApiLogger.logRequest(logData);
    return res.status(403).json(buildAccountPausedResponse(userProfile));
  }

  // --- VALIDATE BODY ---
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
  const isEmojiRetryRequest =
    (emojiRetry === true || emojiRetry === "true") && emojisDisabledByUser;
  const rateLimitResult = isEmojiRetryRequest
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
    logData.responseStatus = 429;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Rate limit exceeded";
    await ApiLogger.logRequest(logData);
    return res.status(429).json({
      error:
        rateLimitResult.error || "Too many requests. Please try again later.",
      code: rateLimitResult.code,
      currentTier: rateLimitResult.currentTier,
      nextTier: rateLimitResult.nextTier,
      limitScope: rateLimitResult.limitScope,
      currentLimit: rateLimitResult.currentLimit,
      remainingRequests: rateLimitResult.remainingRequests,
    });
  }

  generationReservationId = rateLimitResult.reservationId ?? null;

  // Create the prompt for OpenAI
  const systemPrompt =
    "You are an expert Vinted listing writer creating accurate, searchable drafts from photos only. Hard rule: never guess. Write a detail only when it is visible in the photos or readable on a label; if unsure, omit it. Write plain seller-style copy without marketing claims, styling advice, subjective praise, or assumptions.";
  const userPrompt = `
Analyze the image(s) and generate a Vinted title and description.

Use these rules:
- Build the listing only from visible or readable photo evidence. Never fill gaps with likely, common, or nice-sounding details.
- Read labels/tags for exact brand, size, model/product name, and material composition.
- Keep size wording natural; do not write forms like "T34" unless the label says "T34".
- Use visual evidence for item type, color, pattern, shape, closure, sleeves, neckline, pockets, straps, set contents, and packaging.
- Do not infer material, fabric blend, texture, feel, comfort, fit, measurements, condition, authenticity, price, rarity, age, gender, or wear history.
- Do not mention country of origin, product codes, care instructions, or secondary program/campaign text unless it is clearly useful to the buyer as a product name or model.
- Do not say how you know a fact. Write "EU 34", not "label shows EU 34".
- Do not mention defects or negative condition details for now; the seller will handle those separately.

Title:
- Write only the title in ${titleLanguage}.
- Use a natural searchable format: brand if known, model/product name if known, color/pattern, item type, size if known.
- Prefer a fuller searchable title when real evidence exists: include one extra concrete visible detail such as model, cut, closure, neckline, pattern, set count, or product subtype. Aim for about 35-70 characters, but keep simple items shorter and never pad.
- Do not use emojis, hashtags, hype, or condition claims in the title.

Description:
- Write only the description in ${descriptionLanguage}.
- Start with a plain factual sentence naming the item, color, brand, and size when known.
- Add useful visible or readable details, then stop when the evidence runs out.
- ${hashtagInstruction}

Request settings:
- Title language: write only the title in ${titleLanguage}.
- Description language: write only the description in ${descriptionLanguage}.
- Tone: ${toneInstruction}.
- ${emojiInstruction}
- ${bulletpointInstruction}
- Description length: ${normalizedDescriptionLength}.
- This controls how much useful detail each sentence or bullet contains, not just the number of bullets.
Reply only in JSON: {"title":"...","description":"..."}
        `.trim();

  // Log the full prompt being sent to OpenAI
  logData.rawPrompt = `System: ${systemPrompt}\n\nUser: ${userPrompt}\n\nImages: ${imageUrls.length} image(s)\nModel route: ${modelSelection.key}`;
  logData.openaiModel = modelSelection.model;

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
  logData.openaiModel = modelSelection.model;
  try {
    const parts: ChatCompletionContentPart[] = imageUrls.map((url) => ({
      type: "image_url",
      image_url: { url, detail: OPEN_AI_IMAGE_DETAIL },
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
                title: { type: "string" },
                description: { type: "string" },
              },
              required: ["title", "description"],
            },
          },
        },
        temperature: 0.3,
        ...getOpenAIChatTokenLimitParam(model, OPEN_AI_MAX_OUTPUT_TOKENS),
      };

      return openai.chat.completions.create(completionParams).withResponse();
    };

    let selectedModel = modelSelection.model;
    let { data: chat, response: openaiResponse } = await createCompletion(
      selectedModel,
    ).catch(async (initialError) => {
      if (
        selectedModel !== OPENAI_CONTROL_MODEL &&
        isOpenAIModelCompatibilityError(initialError)
      ) {
        console.warn(
          `OpenAI model ${selectedModel} rejected by current generation path; retrying ${OPENAI_CONTROL_MODEL}.`,
          initialError?.message,
        );
        const fallback = await createCompletion(OPENAI_CONTROL_MODEL);
        logData.openaiModel = `${selectedModel}->${OPENAI_CONTROL_MODEL}`;
        selectedModel = OPENAI_CONTROL_MODEL;
        return fallback;
      }
      throw initialError;
    });

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
    const parsed = JSON.parse(content);
    const title = (parsed.title ?? "").trim() || "Untitled";
    const description =
      (parsed.description ?? "").trim() || "No description available.";
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

    // Add generated content to log
    logData.generatedTitle = title;
    logData.generatedDescription = description;
    logData.responseStatus = 200;
    logData.processingDurationMs = Date.now() - startTime;

    // Log the successful request
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
  } catch (err: any) {
    console.error("Generation error:", err);

    // Determine user-friendly error message
    let userMessage =
      "We're experiencing technical difficulties. Please try again in a moment.";
    let statusCode = 500;

    // Check for specific error types
    if (err.status === 429 || err.message?.includes("Rate limit")) {
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
    logData.flaggedReason = `OpenAI generation error: ${err.message}`;
    logData.openaiRateLimitInfo = extractOpenAIRateLimitHeaders(err.headers);
    await RateLimiter.refundGenerationReservation(
      generationReservationId,
      statusCode === 400 ? "invalid_generation_input" : "generation_failed",
    );
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
          error: err?.message || String(err),
          errorName: err?.name,
        },
      });
    }

    // Return generic error to user (protecting sensitive details)
    return res.status(statusCode).json({
      error: userMessage,
      code: statusCode === 429 ? "service_unavailable" : undefined,
      provider: statusCode === 429 ? "openai" : undefined,
      limitScope: statusCode === 429 ? "service" : undefined,
    });
  }
}
