import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OpenAI } from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import Cors from "cors";
import { supabase } from "../utils/supabaseClient";
import { RateLimiter } from "../utils/rateLimiter";
import { ApiLogger } from "../utils/apiLogger";
import { languageMap } from "../utils/languageMap";
import { isDisposableEmail } from "../utils/disposableDomains";
import { getMeasurementAdvice, isClothingItem } from "../utils/helperTips";
import { consumeCredit, giveSignupBonus } from "../utils/credits";
import { getFeatureFlags } from "../utils/tierConfig";
import messagesEn from "../messages/en.json";
import messagesFr from "../messages/fr.json";
import messagesDe from "../messages/de.json";
import messagesNl from "../messages/nl.json";
import messagesPl from "../messages/pl.json";

const OPEN_AI_MODEL = "gpt-4o";
const OPEN_AI_IMAGE_DETAIL: "low" | "high" | "auto" = "low";
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
  allowedHeaders: ["Content-Type", "Authorization"],
});

function runCors(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) => {
    cors(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

const openai = new OpenAI({ apiKey: process.env.VERCEL_APP_OPENAI_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startTime = Date.now();
  const requestMetadata = ApiLogger.extractRequestMetadata(req);

  // Initialize log data
  let logData: any = {
    ...requestMetadata,
    endpoint: "/api/generate",
    fullRequestBody: req.body,
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
      "api_calls_this_month, subscription_status, subscription_tier, last_api_call_reset, is_legacy_plan, subscription_credits, pack_credits, free_drip_started_at",
    )
    .eq("id", user.id)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    console.error("Error fetching profile:", profileError);
    logData.responseStatus = 500;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Profile fetch error";
    await ApiLogger.logRequest(logData);
    return res.status(500).json({ error: "Could not retrieve profile." });
  }

  // Initialize profile for new users
  const isNewUser = !profile || !profile.last_api_call_reset;
  if (isNewUser) {
    const { error: upsertError } = await supabase.from("profiles").upsert({
      id: user.id,
      api_calls_this_month: 0,
      last_api_call_reset: new Date().toISOString(),
      subscription_status: profile?.subscription_status || "free",
      subscription_tier: profile?.subscription_tier || "free",
      is_legacy_plan: false,
    });

    if (upsertError) {
      console.error("Error initializing user profile:", upsertError);
      logData.responseStatus = 500;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = "Profile initialization error";
      await ApiLogger.logRequest(logData);
      return res
        .status(500)
        .json({ error: "Failed to initialize user profile." });
    }

    // Signup bonus is one-time per account. Skip if drip clock already exists
    // (e.g. profile row was reset for an unrelated reason) so we don't re-arm
    // the 13-credit free allotment.
    if (!profile?.free_drip_started_at) {
      await giveSignupBonus(user.id);
    }
  }

  // Use the existing profile or the default values for new users
  const userProfile = profile || {
    api_calls_this_month: 0,
    subscription_status: "free",
    subscription_tier: "free",
    last_api_call_reset: new Date().toISOString(),
    is_legacy_plan: false,
    subscription_credits: 5, // just granted above
    pack_credits: 0,
  };

  // Add user profile info to log data
  logData.subscriptionTier = userProfile.subscription_tier;
  logData.subscriptionStatus = userProfile.subscription_status;
  logData.apiCallsCount = userProfile.api_calls_this_month;

  const isLegacy = userProfile.is_legacy_plan === true;

  // --- LIMIT / CREDIT CHECK (legacy only here; credit-system batch check is
  //     done after we know how many languages were requested).
  if (isLegacy) {
    const rateLimitResult = await RateLimiter.checkRateLimit(
      user.id,
      userProfile,
    );
    if (!rateLimitResult.allowed) {
      logData.responseStatus = 429;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = "Rate limit exceeded";
      await ApiLogger.logRequest(logData);
      return res.status(429).json({
        error:
          rateLimitResult.error || "Too many requests. Please try again later.",
      });
    }
  }

  // --- VALIDATE BODY ---
  const {
    imageUrls,
    languageCode,
    languageCodes,
    tone,
    useEmojis,
    useBulletPoints,
    regenStyle,
    listingPreferences,
  } = req.body;

  // --- CONSTRUCT PROMPT INSTRUCTIONS ---
  const featureFlags = getFeatureFlags(userProfile.subscription_tier, isLegacy);

  // Multi-language batch (Pro+ only): if the client sent languageCodes (array),
  // we generate once per language and deduct N credits. Falls back to the
  // legacy single-language flow when not eligible or when the array is empty.
  let targetLanguageCodes: string[];
  if (
    featureFlags.multi_lang &&
    Array.isArray(languageCodes) &&
    languageCodes.length > 0
  ) {
    const seen = new Set<string>();
    targetLanguageCodes = (languageCodes as unknown[])
      .map((c) =>
        String(c || "")
          .toLowerCase()
          .trim(),
      )
      .filter((c) => c && !seen.has(c) && (seen.add(c), true));
    if (targetLanguageCodes.length === 0) {
      targetLanguageCodes = [String(languageCode || "en").toLowerCase()];
    }
  } else {
    targetLanguageCodes = [String(languageCode || "en").toLowerCase()];
  }
  const isBatch = targetLanguageCodes.length > 1;

  // Pre-check credits cover the whole batch (legacy users still go through
  // the rate-limiter; multi-lang isn't offered to them anyway).
  if (!isLegacy) {
    const sub = userProfile.subscription_credits ?? 0;
    const pack = userProfile.pack_credits ?? 0;
    if (sub + pack < targetLanguageCodes.length) {
      logData.responseStatus = 402;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = "Insufficient credits for batch";
      await ApiLogger.logRequest(logData);
      return res.status(402).json({
        error: `This batch needs ${targetLanguageCodes.length} credits but you only have ${sub + pack}.`,
      });
    }
  }

  // For non-batch flow, keep the original single-language local helpers.
  const primaryLanguageCode = targetLanguageCodes[0];
  const language = languageMap[primaryLanguageCode] || "English";

  let toneInstruction = "neutral and balanced";
  if (featureFlags.tone_control) {
    if (tone === "friendly") toneInstruction = "friendly, casual, and warm";
    else if (tone === "professional")
      toneInstruction = "professional, clean, and concise";
    else if (tone === "enthusiastic")
      toneInstruction = "enthusiastic, sales-oriented, and exciting";
  }

  const emojiInstruction =
    featureFlags.emoji && (useEmojis === true || useEmojis === "true")
      ? "Use relevant emojis in the description."
      : "Do NOT use any emojis in the description.";

  // bullet points vs paragraphs
  const bulletpointInstruction =
    useBulletPoints === true || useBulletPoints === "true"
      ? "1 short setence (text ONLY). Followed by a line break. Followed by 3-4 concise bullet points. Each bullet starts with '• '. End each with relevant emoji. First bullet exclusive ONLY to size and brand if known, don't add anything else to first bullet even if it will be so short."
      : "Use 2-3 short paragraphs. separated with line breaks where necessary.";

  // Smart Re-Gen style (Plus+): directional style override
  const REGEN_STYLE_INSTRUCTIONS: Record<string, string> = {
    detailed:
      "Write a more detailed and comprehensive description — include specific visible features, styling suggestions, and any notable details. Make it thorough.",
    casual:
      "Use a lighter, conversational tone — friendly and approachable, like describing the item to a friend.",
    short:
      "Write a concise, punchy description — maximum impact with minimum words. Keep it brief and compelling.",
  };
  const regenStyleInstruction =
    featureFlags.smart_regen &&
    regenStyle &&
    REGEN_STYLE_INSTRUCTIONS[regenStyle as string]
      ? ` Style directive: ${REGEN_STYLE_INSTRUCTIONS[regenStyle as string]}`
      : "";

  // Listing Preferences (Plus+): predefined checkbox options mapped to prompt hints
  const PREF_INSTRUCTIONS: Record<string, string> = {
    measurements:
      "If measurements are visible in the images, include them in the description.",
    smoke_pet_free:
      "Add a brief note that this item comes from a smoke-free, pet-free home.",
    fabric_material:
      "If the fabric or material is visible or can be reasonably identified from the images, mention it.",
    closing_line:
      "End the description with a short, friendly closing line (e.g. 'Feel free to message me with any questions!').",
  };
  let prefInstructions = "";
  if (
    featureFlags.listing_preferences &&
    Array.isArray(listingPreferences) &&
    listingPreferences.length > 0
  ) {
    const validPrefs = (listingPreferences as string[])
      .filter((p) => typeof p === "string" && PREF_INSTRUCTIONS[p])
      .map((p) => PREF_INSTRUCTIONS[p]);
    if (validPrefs.length > 0) {
      prefInstructions = ` Additional seller preferences: ${validPrefs.join(" ")}`;
    }
  }

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

  // Create the prompt for OpenAI
  const systemPrompt =
    "You are a savvy Vinted seller. Your goal is to create listings that are appealing, trustworthy, and get items sold. Never guess brand, size, material, model, etc. You can mention defects (with high tolerance) only if clearly and obviously visible. Wrinkles or creasings are not defects.";

  function buildUserPrompt(targetLanguage: string): string {
    return `
Analyze the image(s) and generate a title and description in ${targetLanguage}.
- Title format: [BRAND - Omit if not known] [Model - if electronics or applicable] [Color] [Item] - [Size - Omit if not known/not applicable].
- Description: Note a positive condition (e.g., excellent condition, Like new) if visible. No negative remarks related to wrinkles or creasing. Highlight a key feature: a good way to style it, or fabric within reason if clear, as examples. End with 4-5 relevant SEO hashtags. If brand/size is not visible at all, just skip it, do NOT say "Unknown Brand/Size". Your tone should be ${toneInstruction}. ${emojiInstruction} ${bulletpointInstruction} highlighting key features and styling tips.${regenStyleInstruction}${prefInstructions} Add line break before hashtags.
Reply only in JSON: {"title":"...","description":"..."}
        `.trim();
  }

  const primaryUserPrompt = buildUserPrompt(language);
  logData.rawPrompt = `System: ${systemPrompt}\n\nUser: ${primaryUserPrompt}\n\nImages: ${imageUrls.length} image(s)${isBatch ? `\n\nBatch languages: ${targetLanguageCodes.join(", ")}` : ""}`;
  logData.openaiModel = OPEN_AI_MODEL;

  const suspiciousCheck = ApiLogger.detectSuspiciousActivity({
    imageUrls,
    rawPrompt: logData.rawPrompt,
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

  const messagesMap: Record<string, any> = {
    en: messagesEn,
    fr: messagesFr,
    de: messagesDe,
    nl: messagesNl,
    pl: messagesPl,
  };

  const imageParts: ChatCompletionContentPart[] = imageUrls.map((url) => ({
    type: "image_url",
    image_url: { url, detail: OPEN_AI_IMAGE_DETAIL },
  }));

  async function generateOne(targetLangCode: string): Promise<{
    languageCode: string;
    title: string;
    description: string;
    measurementAdvice: string;
    tokensUsed?: number;
  }> {
    const targetLangName = languageMap[targetLangCode] || "English";
    const userPromptForLang = buildUserPrompt(targetLangName);

    const chat = await openai.chat.completions.create({
      model: OPEN_AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [{ type: "text", text: userPromptForLang }, ...imageParts],
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
      max_tokens: 320,
      temperature: 0.3,
    });

    const content = chat.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const title = (parsed.title ?? "").trim() || "Untitled";
    const description =
      (parsed.description ?? "").trim() || "No description available.";

    const messages = messagesMap[targetLangCode] || messagesEn;
    const isClothing = isClothingItem(title, description);
    const measurementAdvice = getMeasurementAdvice(isClothing, messages);

    return {
      languageCode: targetLangCode,
      title,
      description,
      measurementAdvice,
      tokensUsed: chat.usage?.total_tokens,
    };
  }

  // --- GENERATE (sequential per language; deduct one credit per success) ---
  try {
    const results: Array<{
      languageCode: string;
      title: string;
      description: string;
      measurementAdvice: string;
    }> = [];
    let totalTokens = 0;

    for (const langCode of targetLanguageCodes) {
      const r = await generateOne(langCode);
      totalTokens += r.tokensUsed ?? 0;
      results.push({
        languageCode: r.languageCode,
        title: r.title,
        description: r.description,
        measurementAdvice: r.measurementAdvice,
      });

      // Deduct credit (or rate-limit increment for legacy) per successful generation.
      if (isLegacy) {
        // Legacy users never enter batch mode (multi_lang flag is false), so
        // this only fires once per request.
        await RateLimiter.recordSuccessfulRequest(user.id);
        const { error: incrementError } = await supabase
          .from("profiles")
          .update({
            api_calls_this_month: (userProfile.api_calls_this_month ?? 0) + 1,
          })
          .eq("id", user.id);
        if (incrementError) {
          console.error(
            "Failed to increment monthly API count:",
            incrementError,
          );
        }
      } else {
        const creditResult = await consumeCredit(user.id, {
          regen_style: regenStyle || null,
          batch_size: targetLanguageCodes.length,
          language: langCode,
        });
        if (!creditResult.success) {
          console.error(
            "Credit deduction failed mid-batch:",
            creditResult.error,
          );
          break;
        }
      }
    }

    if (results.length === 0) {
      throw new Error("No generations succeeded");
    }

    logData.openaiTokensUsed = totalTokens;
    logData.generatedTitle = results[0].title;
    logData.generatedDescription = results[0].description;
    logData.responseStatus = 200;
    logData.processingDurationMs = Date.now() - startTime;
    await ApiLogger.logRequest(logData);

    // Single-language response shape (back-compat) for non-batch.
    if (!isBatch) {
      return res.status(200).json({
        title: results[0].title,
        description: results[0].description,
        measurementAdvice: results[0].measurementAdvice,
      });
    }
    // Batch response: include per-language results, plus top-level fields for
    // any legacy client that ignores `results`.
    return res.status(200).json({
      title: results[0].title,
      description: results[0].description,
      measurementAdvice: results[0].measurementAdvice,
      results,
    });
  } catch (err: any) {
    console.error("Generation error:", err);

    // Determine user-friendly error message
    let userMessage =
      "We're experiencing technical difficulties. Please try again in a moment.";
    let statusCode = 500;

    // Check for specific error types
    if (err.message?.includes("Rate limit")) {
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
    await ApiLogger.logRequest(logData);

    // Return generic error to user (protecting sensitive details)
    return res.status(statusCode).json({ error: userMessage });
  }
}
