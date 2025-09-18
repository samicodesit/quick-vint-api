import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OpenAI } from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import Cors from "cors";
import { supabase } from "../utils/supabaseClient";
import { RateLimiter } from "../utils/rateLimiter";

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
  try {
    await runCors(req, res);
  } catch (corsError: any) {
    return res.status(403).json({ error: corsError.message });
  }
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST allowed" });

  // --- AUTH ---
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Missing or invalid Authorization" });
  const token = authHeader.split(" ")[1];
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);
  if (userError || !user)
    return res.status(401).json({ error: "Invalid or expired token" });

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

  // --- RATE LIMITING ---
  const rateLimitResult = await RateLimiter.checkRateLimit(
    user.id,
    userProfile,
  );

  if (!rateLimitResult.allowed) {
    return res.status(429).json({
      error: "Too many requests. Please try again later.",
    });
  }

  // --- VALIDATE BODY ---
  const { imageUrls } = req.body;
  if (
    !Array.isArray(imageUrls) ||
    imageUrls.length === 0 ||
    !imageUrls.every((u) => typeof u === "string" && u.trim())
  ) {
    return res
      .status(400)
      .json({ error: "imageUrls must be a non-empty array of strings." });
  }

  // --- GENERATE VIA OPENAI ---
  try {
    const parts: ChatCompletionContentPart[] = imageUrls.map((url) => ({
      type: "image_url",
      image_url: { url },
    }));
    const chat = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You write Vinted listing titles and descriptions.",
        },
        {
          role: "user",
          content: [
            ...parts,
            {
              type: "text",
              text: `
From photo(s), detect brand (if clear), color, and item. Format title: [Brand] [Color] [Item]. In description, note condition (e.g. like new, stains), and end with 4-5 SEO hashtags.
Reply only in JSON: {"title":"...","description":"..."}
        `.trim(),
            },
          ],
        },
      ],
      max_tokens: 150,
    });

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
    // If OpenAI fails, we should ideally roll back the increment.
    // For simplicity here, we accept that a failed call might still count.
    return res.status(500).json({ error: "Internal error during generation." });
  }
}
