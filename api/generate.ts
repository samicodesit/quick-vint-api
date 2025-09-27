import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OpenAI } from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import Cors from "cors";
import { supabase } from "../utils/supabaseClient";
import { RateLimiter } from "../utils/rateLimiter";
import { ApiLogger } from "../utils/apiLogger";
import { languageMap } from "../utils/languageMap";

const OPEN_AI_MODEL = "gpt-4o-mini";
// allow vinted page origins (so extension fetch from page context works)
const vintedOriginPattern = /^https:\/\/(?:[\w-]+\.)?vinted\.[a-z]{2,3}$/;

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

  // --- PROFILE & LIMITS ---
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "api_calls_this_month, subscription_status, subscription_tier, last_api_call_reset"
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
    userProfile
  );

  if (!rateLimitResult.allowed) {
    logData.responseStatus = 429;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = "Rate limit exceeded";
    await ApiLogger.logRequest(logData);
    return res.status(429).json({
      error: "Too many requests. Please try again later.",
    });
  }

  // --- VALIDATE BODY ---
  const { imageUrls, languageCode } = req.body;
  const languageCodeStr = String(languageCode || "en").toLowerCase();
  const language = languageMap[languageCodeStr] || "English";

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
    "You are a savvy Vinted seller. Your goal is to create listings that are appealing, trustworthy, and get items sold.";
  const userPrompt = `
Analyze the image(s) and generate a title and description in ${language}.
- Title format: [Brand] [Color] [Item].
- Description: Note a positive condition (e.g., excellent condition, Like new). Write in a friendly, casual tone but not overboard. No negative remarks related to wrinkles or creasing. Highlight a key feature, the feel of the fabric, or a good way to style it. End with 4-5 relevant SEO hashtags.
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
      suspiciousCheck.reasons
    );
  }

  // --- GENERATE VIA OPENAI ---
  try {
    const parts: ChatCompletionContentPart[] = imageUrls.map((url) => ({
      type: "image_url",
      image_url: { url },
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
            ...parts,
            {
              type: "text",
              text: userPrompt,
            },
          ],
        },
      ],
      max_tokens: 165,
    });

    // Log token usage
    logData.openaiTokensUsed = chat.usage?.total_tokens;

    let content = chat.choices?.[0]?.message?.content?.trim() || "{}";
    const md = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(content);
    if (md && md[1]) content = md[1].trim();

    let parsed: { title?: string; description?: string } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn("GPT output not valid JSON:", content);
    }

    const title = parsed.title?.trim() || "Untitled";
    const description =
      parsed.description?.trim() || "No description available.";

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
    });
  } catch (err: any) {
    console.error("Generation error:", err);

    // Log the error
    logData.responseStatus = 500;
    logData.processingDurationMs = Date.now() - startTime;
    logData.flaggedReason = `OpenAI generation error: ${err.message}`;
    await ApiLogger.logRequest(logData);

    // If OpenAI fails, we should ideally roll back the increment.
    // For simplicity here, we accept that a failed call might still count.
    return res.status(500).json({ error: "Internal error during generation." });
  }
}
