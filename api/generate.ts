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
      "api_calls_this_month, subscription_status, subscription_tier, last_api_call_reset",
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
  if (!profile || !profile.last_api_call_reset) {
    const { error: upsertError } = await supabase.from("profiles").upsert({
      id: user.id,
      api_calls_this_month: 0, // Will be incremented by rate limiter
      last_api_call_reset: new Date().toISOString(),
      subscription_status: profile?.subscription_status || "free",
      subscription_tier: profile?.subscription_tier || "free",
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
  }

  // Use the existing profile or the default values for new users
  const userProfile = profile || {
    api_calls_this_month: 0,
    subscription_status: "free",
    subscription_tier: "free",
    last_api_call_reset: new Date().toISOString(),
  };

  // Add user profile info to log data
  logData.subscriptionTier = userProfile.subscription_tier;
  logData.subscriptionStatus = userProfile.subscription_status;
  logData.apiCallsCount = userProfile.api_calls_this_month;

  // --- RATE LIMITING ---
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

  // --- VALIDATE BODY ---
  const { imageUrls, languageCode, tone, useEmojis, useBulletPoints } =
    req.body;

  const languageCodeStr = String(languageCode || "en").toLowerCase();
  const language = languageMap[languageCodeStr] || "English";

  // --- CONSTRUCT PROMPT INSTRUCTIONS ---
  // Only pro/business tiers can customize tone
  const tierAllowsExtras =
    userProfile.subscription_tier === "pro" ||
    userProfile.subscription_tier === "business";

  let toneInstruction = "neutral and balanced"; // Default for 'standard'
  if (tierAllowsExtras) {
    if (tone === "friendly") toneInstruction = "friendly, casual, and warm";
    else if (tone === "professional")
      toneInstruction = "professional, clean, and concise";
    else if (tone === "enthusiastic")
      toneInstruction = "enthusiastic, sales-oriented, and exciting";
  }

  const emojisDisabledByUser = useEmojis === false || useEmojis === "false";
  const emojisEnabled =
    userProfile.subscription_tier === "free"
      ? !emojisDisabledByUser
      : tierAllowsExtras && (useEmojis === true || useEmojis === "true");
  const emojiInstruction = emojisEnabled
    ? "Use relevant emojis in the description."
    : "Do NOT use any emojis in the description.";

  // bullet points vs paragraphs
  const bulletEmojiInstruction = emojisEnabled
    ? " End each bullet with exactly one relevant emoji."
    : "";
  const paragraphEmojiInstruction = emojisEnabled
    ? " Use emojis sparingly in paragraph text."
    : "";
  const bulletpointInstruction =
    useBulletPoints === true || useBulletPoints === "true"
      ? `Use one short opening sentence, then a line break, then 3 concise bullet points. Each bullet starts with '• ' and must add a different useful detail than the opening sentence.${bulletEmojiInstruction}`
      : `Use 2-3 short paragraphs separated by a line break where useful.${paragraphEmojiInstruction}`;

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
    "You are a savvy Vinted seller writing accurate, buyer-friendly listings. Be specific, natural, and trustworthy. Never guess brand, size, material, model, measurements, authenticity, or how many times an item was worn. Mention defects only when clearly visible. Wrinkles and creasing are not defects.";
  const userPrompt = `
Analyze the image(s) and generate a title and description in ${language}.
- Title format: [BRAND - Omit if not known] [Model - if electronics or applicable] [Color] [Item] - [Size - Omit if not known/not applicable].
- Size handling: For clothing and shoes, prioritize visible EU size markings over US sizing. Do not convert or infer sizes; omit the size if the system is unclear.
- Description: Write like a real Vinted seller, not an ad. Include important searchable facts from the title again in the description when known, especially brand, size, color/pattern, and item type. Then add useful details such as fit or silhouette when clear, material only if visible from label or unmistakable, and one natural styling/use case when appropriate.
- Avoid filler and lazy repetition: do not repeat the same fact in multiple bullets, and avoid vague phrases like "modern design", "great quality", "perfect addition", or "stands out".
- Condition: mention positive condition only when clearly supported by the image(s), such as new with tags, like new, clean, or well kept. If the item looks noticeably worn or the condition is unclear, do not mention the condition. Do not mention wrinkles or creasing or the likes as flaws.
- Missing info: If brand, size, material, or measurements are not visible, omit them. Do not write "unknown", do not invent measurements, and do not ask the seller to add details.
- Hashtags: End with 3-5 relevant SEO hashtags on a new line. Use only the actual brand if known, the item type, color/style, and broad search terms. Do not include unrelated brands or spammy keyword stuffing.
- Tone and format: Your tone should be ${toneInstruction}. ${emojiInstruction} ${bulletpointInstruction}
Reply only in JSON: {"title":"...","description":"..."}
        `.trim();

  // Log the full prompt being sent to OpenAI
  logData.rawPrompt = `System: ${systemPrompt}\n\nUser: ${userPrompt}\n\nImages: ${imageUrls.length} image(s)`;
  logData.openaiModel = OPEN_AI_MODEL;

  // Check for suspicious activity
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

  // --- GENERATE VIA OPENAI ---
  try {
    const parts: ChatCompletionContentPart[] = imageUrls.map((url) => ({
      type: "image_url",
      image_url: { url, detail: OPEN_AI_IMAGE_DETAIL },
    }));
    const chat = await openai.chat.completions.create({
      model: OPEN_AI_MODEL,
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
      max_tokens: 320,
      temperature: 0.3,
    });

    // Log token usage and rate limit info
    logData.openaiTokensUsed = chat.usage?.total_tokens;

    // Log rate limit headers for monitoring (helps track when approaching limits)
    const rateLimitInfo = {
      remainingRequests: (chat as any)._request_id
        ? "available in response headers"
        : "N/A",
      remainingTokens: (chat as any)._request_id
        ? "available in response headers"
        : "N/A",
    };
    console.log("🔄 OpenAI Rate Limit Status:", rateLimitInfo);

    const content = chat.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const title = (parsed.title ?? "").trim() || "Untitled";
    const description =
      (parsed.description ?? "").trim() || "No description available.";

    // Generate localized measurement advice if item is clothing
    const messagesMap: Record<string, any> = {
      en: messagesEn,
      fr: messagesFr,
      de: messagesDe,
      nl: messagesNl,
      pl: messagesPl,
    };
    const messages = messagesMap[languageCode] || messagesEn;
    const isClothing = isClothingItem(title, description);
    const measurementAdvice = getMeasurementAdvice(isClothing, messages);

    // Add generated content to log
    logData.generatedTitle = title;
    logData.generatedDescription = description;
    logData.responseStatus = 200;
    logData.processingDurationMs = Date.now() - startTime;

    // Log the successful request
    await ApiLogger.logRequest(logData);

    // Record successful request for rate limiting (increment counters)
    await RateLimiter.recordSuccessfulRequest(user.id);

    // Increment monthly API call count after successful generation
    const { error: incrementError } = await supabase
      .from("profiles")
      .update({
        api_calls_this_month: userProfile.api_calls_this_month + 1,
      })
      .eq("id", user.id);

    if (incrementError) {
      console.error("Failed to increment monthly API count:", incrementError);
      // Don't fail the request if we can't update the counter
    }

    return res.status(200).json({
      title,
      description,
      measurementAdvice,
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
