// api/generate.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OpenAI } from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import Cors from "cors";
import { supabase } from "../utils/supabaseClient";

const FREE_TIER_API_CALL_LIMIT = 2; // Define your free tier limit

// allow any https://*.vinted.<tld> (e.g. www.vinted.com, fr.vinted.com, vinted.nl, etc)
// This pattern allows content.js to fetch images directly from Vinted pages if needed,
// but your API calls from the extension should come from the extension's origin.
const vintedOriginPattern = /^https:\/\/(?:[\w-]+\.)?vinted\.[a-z]{2,3}$/;

const rawOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS || "";
const ALLOWED_ORIGINS = rawOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const cors = Cors({
  origin: (incomingOrigin, callback) => {
    if (!incomingOrigin) {
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.includes(incomingOrigin)) {
      return callback(null, true);
    }
    // Vinted origin pattern might not be strictly necessary if only your extension calls this endpoint.
    // Keeping it if your previous logic relied on it for some reason.
    if (vintedOriginPattern.test(incomingOrigin)) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "Blocked CORS for generate from:",
        incomingOrigin,
        "Allowed:",
        ALLOWED_ORIGINS
      );
    }
    return callback(new Error("CORS origin denied for generate"), false);
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"], // Ensure Authorization is allowed
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
    return res
      .status(403)
      .json({ error: corsError.message || "CORS check failed for generate" });
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  // --- AUTHENTICATION ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Missing or invalid Authorization header" });
  }
  const token = authHeader.split(" ")[1];

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    console.warn("Auth error for generate endpoint:", userError?.message);
    return res
      .status(401)
      .json({ error: userError?.message || "Unauthorized: Invalid token" });
  }
  // User is authenticated: user.id and user.email are available.

  // --- USER PROFILE & API LIMITS ---
  const { data: profileData, error: profileFetchError } = await supabase
    .from("profiles")
    .select("api_calls_this_month, subscription_status, last_api_call_reset")
    .eq("id", user.id)
    .single();

  if (profileFetchError && profileFetchError.code !== "PGRST116") {
    // PGRST116 means no rows found
    console.error(
      `Error fetching profile for user ${user.id}:`,
      profileFetchError
    );
    return res
      .status(500)
      .json({ error: "Could not retrieve user profile details." });
  }

  if (!profileData) {
    // This case should ideally be handled by the Supabase trigger creating a profile.
    // If it happens, it means the profile wasn't created. You might create it here
    // or return an error asking the user to re-login to trigger profile creation.
    console.warn(
      `Profile not found for user ${user.id}. Trigger might have failed or is pending.`
    );
    // For now, we'll assume a default free user if profile is missing, but this should be reviewed.
    // A better approach might be to explicitly create the profile here if it's missing.
    // For now, let's deny access if profile is strictly required.
    return res.status(403).json({
      error: "User profile not found. Please try signing out and in again.",
    });
  }

  let currentProfile = { ...profileData }; // Mutable copy

  const today = new Date();
  const currentMonth = today.getFullYear() * 100 + today.getMonth(); // e.g., 202304 for May 2023

  let lastResetMonth = 0;
  if (currentProfile.last_api_call_reset) {
    const lastResetDate = new Date(currentProfile.last_api_call_reset);
    lastResetMonth =
      lastResetDate.getFullYear() * 100 + lastResetDate.getMonth();
  }

  if (currentMonth > lastResetMonth) {
    const { data: updatedProfile, error: resetError } = await supabase
      .from("profiles")
      .update({
        api_calls_this_month: 0,
        last_api_call_reset: today.toISOString().split("T")[0],
      })
      .eq("id", user.id)
      .select("api_calls_this_month, last_api_call_reset")
      .single();

    if (resetError) {
      console.error(
        `Error resetting API count for user ${user.id}:`,
        resetError
      );
      // Continue with potentially stale count, or return error. For now, log and continue.
    } else if (updatedProfile) {
      currentProfile.api_calls_this_month = updatedProfile.api_calls_this_month;
      currentProfile.last_api_call_reset = updatedProfile.last_api_call_reset;
    }
  }

  if (
    currentProfile.subscription_status === "free" &&
    currentProfile.api_calls_this_month >= FREE_TIER_API_CALL_LIMIT
  ) {
    return res.status(429).json({
      error: `Monthly API call limit of ${FREE_TIER_API_CALL_LIMIT} reached for free tier. Please upgrade.`,
    });
  }
  // --- END USER PROFILE & API LIMITS ---

  const { imageUrls } = req.body;
  if (
    !Array.isArray(imageUrls) ||
    imageUrls.length === 0 ||
    !imageUrls.every((url) => typeof url === "string" && url.trim())
  ) {
    return res.status(400).json({
      error: "imageUrls must be a non-empty array of non-empty strings.",
    });
  }

  try {
    const imageParts: ChatCompletionContentPart[] = imageUrls.map((url) => ({
      type: "image_url",
      image_url: { url },
    }));

    const chat = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You write Vinted/Market Place listing titles & descriptions.",
        },
        {
          role: "user",
          content: [
            ...imageParts,
            {
              type: "text",
              text: `
              Analyze the clothing item in the photo(s).
              Reply only with valid JSON:
              {
                "title": "[Brand if clearly visible] [Color] [Type of item]",
                "description": "1–2 phrases that help sell it. Mention condition if useful (e.g. barely worn). End with 5 relevant hashtags to boost search. No sizes."
              }
              `.trim(),
            },
          ] as ChatCompletionContentPart[],
        },
      ],
      max_tokens: 150, // Adjust as needed
    });

    let gptContent = chat.choices?.[0]?.message?.content?.trim() || "{}";
    const md = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(gptContent);
    if (md && md[1]) {
      gptContent = md[1].trim();
    }

    let parsed: { title?: string; description?: string } = {};
    try {
      parsed = JSON.parse(gptContent);
    } catch (parseErr) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Failed to JSON.parse GPT output:", gptContent, parseErr);
      }
      // Don't fail the request, use fallbacks
    }

    const title = parsed.title?.trim() || "Untitled";
    const description =
      parsed.description?.trim() || "No description available.";

    // --- INCREMENT API CALL COUNT ---
    const newCallCount = (currentProfile.api_calls_this_month || 0) + 1; // Ensure it's a number
    const { error: updateCountError } = await supabase
      .from("profiles")
      .update({ api_calls_this_month: newCallCount })
      .eq("id", user.id);

    if (updateCountError) {
      console.error(
        `Error incrementing API call count for user ${user.id}:`,
        updateCountError
      );
      // Log this error, but the user already got their response, so don't fail here.
    }
    // --- END INCREMENT API CALL COUNT ---

    return res.status(200).json({ title, description });
  } catch (error: any) {
    if (process.env.NODE_ENV !== "production") {
      console.error("OpenAI API error or other internal error:", error);
    }
    // Check for specific OpenAI error structure
    if (error.response && error.response.data && error.response.data.error) {
      return res
        .status(error.response.status || 500)
        .json({ error: error.response.data.error.message });
    }
    if (error.status && error.message) {
      // More generic errors
      return res.status(error.status).json({ error: error.message });
    }
    return res
      .status(500)
      .json({ error: "Internal server error during generation." });
  }
}
