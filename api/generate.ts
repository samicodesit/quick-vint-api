// api/generate.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OpenAI } from "openai";
import Cors from "cors";

// 1) Read and parse allowed origins from env
//    e.g. "https://www.vinted.nl,chrome-extension://<EXT_ID>"
const rawOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS || "";
const ALLOWED_ORIGINS = rawOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// 2) Setup CORS middleware
const cors = Cors({
  origin: (incomingOrigin, callback) => {
    // allow requests with no origin (e.g. curl, Postman)
    if (!incomingOrigin) return callback(null, true);
    if (
      ALLOWED_ORIGINS.includes("*") ||
      ALLOWED_ORIGINS.includes(incomingOrigin)
    ) {
      return callback(null, true);
    }
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
  const { imageUrl } = req.body;
  if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.trim()) {
    return res
      .status(400)
      .json({ error: "imageUrl is required and must be a non-empty string." });
  }

  try {
    // Call GPT-4o Vision
    const chat = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You write Vinted listing titles & descriptions.",
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            {
              type: "text",
              text: `
Analyze this clothing item photo.
Respond *only* in **valid JSON** with two keys:
{
  "title": "short Vinted title",
  "description": "one-sentence stylish description"
}
              `.trim(),
            },
          ],
        },
      ],
      max_tokens: 200,
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
    // Handle known OpenAI errors
    if (error.status && error.message) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}
