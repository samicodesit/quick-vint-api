import type { VercelRequest, VercelResponse } from "@vercel/node";
import Cors from "cors";
import { supabase } from "../utils/supabaseClient";

const cors = Cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (/^chrome-extension:\/\//.test(origin)) return callback(null, true);
    if (/^https:\/\/(?:[\w-]+\.)?vinted\./.test(origin))
      return callback(null, true);
    return callback(new Error("CORS denied"), false);
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

function runCors(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) =>
    cors(req, res, (err) => (err ? reject(err) : resolve())),
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await runCors(req, res);
  } catch {
    return res.status(403).json({ error: "CORS denied" });
  }

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];

  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user) return res.status(401).json({ error: "Invalid token" });

  const { suggestion } = req.body;
  if (
    typeof suggestion !== "string" ||
    suggestion.trim().length < 5 ||
    suggestion.trim().length > 200
  ) {
    return res
      .status(400)
      .json({ error: "Suggestion must be 5–200 characters" });
  }

  const { error } = await supabase.from("preference_suggestions").insert({
    user_id: user.id,
    suggestion: suggestion.trim(),
  });

  if (error) {
    console.error("Suggestion insert error:", error);
    return res.status(500).json({ error: "Failed to save suggestion" });
  }

  return res.status(200).json({ ok: true });
}
