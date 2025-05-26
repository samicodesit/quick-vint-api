// api/generate.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OpenAI } from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import Cors from "cors";

// allow any https://*.vinted.<tld> (e.g. vinted.com, fr.vinted.com, vinted.nl, etc)
const vintedOriginPattern = /^https:\/\/(?:[a-z]{2}\.)?vinted\.[a-z]{2,3}$/;

// 1) Read and parse allowed origins from env
//    e.g. "chrome-extension://<EXT_ID>"
const rawOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS || "";
const ALLOWED_ORIGINS = rawOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// 2) Setup CORS middleware
const cors = Cors({
  origin: (incomingOrigin, callback) => {
    // allow server‐side calls (no Origin header)
    if (!incomingOrigin) {
      return callback(null, true);
    }

    // allow your explicit extension ID or any other origins you listed
    if (ALLOWED_ORIGINS.includes(incomingOrigin)) {
      return callback(null, true);
    }

    // allow all official Vinted sites
    if (vintedOriginPattern.test(incomingOrigin)) {
      return callback(null, true);
    }

    // otherwise block—and log for monitoring
    console.warn("Blocked CORS from", incomingOrigin);
    return callback(new Error("CORS origin denied"), false);
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
});

// Helper to run CORS as a promise
function runCors(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) => {
    cors(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

// 3) Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.VERCEL_APP_OPENAI_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Apply CORS
  try {
    await runCors(req, res);
  } catch (err) {
    return res.status(403).json({ error: "CORS check failed" });
  }

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only POST allowed
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  // Validate input
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
      max_tokens: 150,
    });

    // Extract and sanitize GPT response
    let gptContent = chat.choices?.[0]?.message?.content?.trim() || "{}";

    // Remove markdown fences if present
    const md = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(gptContent);
    if (md && md[1]) {
      gptContent = md[1].trim();
    }

    // Parse JSON safely
    let parsed: { title?: string; description?: string } = {};
    try {
      parsed = JSON.parse(gptContent);
    } catch (parseErr) {
      console.error("Failed to JSON.parse GPT output:", gptContent, parseErr);
    }

    // Fallback defaults
    const title = parsed.title?.trim() || "Untitled";
    const description = parsed.description?.trim() || "No description.";

    return res.status(200).json({ title, description });
  } catch (error: any) {
    console.error("OpenAI API error:", error);
    if (error.status && error.message) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}
