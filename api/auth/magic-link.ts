import type { VercelRequest, VercelResponse } from "@vercel/node";
import Cors from "cors";
import { supabase } from "../../utils/supabaseClient";
import { isDisposableEmail } from "../../utils/disposableDomains";

// Read and parse allowed origins from env for CORS
// This should primarily be your Chrome extension's origin
const rawOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS || "";
const ALLOWED_ORIGINS = rawOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const cors = Cors({
  origin: (incomingOrigin, callback) => {
    if (!incomingOrigin) {
      // Allow server-to-server or tools like Postman
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.includes(incomingOrigin)) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "Blocked CORS for magic-link from:",
        incomingOrigin,
        "Allowed:",
        ALLOWED_ORIGINS,
      );
    }
    return callback(new Error("CORS origin denied for magic-link"), false);
  },
  methods: ["POST", "GET", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"], // Added Authorization for consistency
});

function runCors(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) => {
    cors(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await runCors(req, res);
  } catch (corsError: any) {
    return res
      .status(403)
      .json({ error: corsError.message || "CORS check failed for magic-link" });
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Handle unsubscribe via GET request with ?action=unsubscribe&email=...
  if (req.method === "GET") {
    const { action, email } = req.query;

    if (action === "unsubscribe") {
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email parameter is required" });
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .update({ email_subscribed: false })
          .eq("email", email.toLowerCase())
          .select();

        if (error) {
          console.error("Error unsubscribing user:", error);
          return res.status(500).json({ error: "Failed to unsubscribe" });
        }

        if (!data || data.length === 0) {
          return res.status(404).json({ error: "Email not found" });
        }

        return res.redirect(
          302,
          `/unsubscribe?success=true&email=${encodeURIComponent(email)}`,
        );
      } catch (error) {
        console.error("Unsubscribe error:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    }

    return res.status(400).json({ error: "Invalid action parameter" });
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ error: "Only POST and GET requests allowed" });
  }

  const { email } = req.body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "A valid email address is required" });
  }

  if (isDisposableEmail(email)) {
    return res.status(400).json({
      error:
        "Disposable emails are not allowed. If you have previously used or attempt to use one, you risk legal action. Contact us for appeal, or if you believe this is a mistake.",
    });
  }

  const appSiteUrl = process.env.VERCEL_APP_SITE_URL;
  if (!appSiteUrl || !appSiteUrl.startsWith("chrome-extension://")) {
    console.error(
      "VERCEL_APP_SITE_URL is not correctly set for a Chrome Extension in environment variables.",
    );
    return res
      .status(500)
      .json({ error: "Server configuration error related to redirect URL." });
  }

  const emailRedirectTo = `${appSiteUrl}/callback.html`; // Assumes callback.html is at the root of your extension

  const { error } = await supabase.auth.signInWithOtp({
    email: email,
    options: {
      emailRedirectTo: emailRedirectTo,
      // shouldCreateUser: true, // Default is true, ensures user is created if they don't exist.
    },
  });

  if (error) {
    console.error("Supabase signInWithOtp error:", error.message);
    return res
      .status(500)
      .json({ error: error.message || "Failed to send magic link." });
  }

  return res.status(200).json({
    message: "Magic link sent successfully! Please check your email.",
  });
}
