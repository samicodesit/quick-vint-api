import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../utils/supabaseClient";

/**
 * /api/unsubscribe — Dedicated unsubscribe endpoint
 *
 * Supports two flows:
 *
 * 1. GET  ?token=<uuid>  →  Browser click from email link
 *    Validates the token, unsubscribes the user, and redirects to the
 *    /unsubscribe confirmation page.
 *
 * 2. POST  { token: "<uuid>" }  or  body: List-Unsubscribe=One-Click
 *    - Regular POST with JSON body containing { token }
 *    - RFC 8058 one-click unsubscribe: Gmail/Yahoo send a POST with
 *      Content-Type: application/x-www-form-urlencoded and body
 *      "List-Unsubscribe=One-Click". The token must be in the query string.
 *
 * All flows require a valid unsubscribe_token (UUID) — email addresses
 * are never exposed in unsubscribe URLs.
 */

// ── helpers ──────────────────────────────────────────────────────────

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function unsubscribeByToken(
  token: string,
): Promise<{ success: boolean; email?: string; error?: string }> {
  if (!token || !isValidUUID(token)) {
    return { success: false, error: "Invalid or missing unsubscribe token." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ email_subscribed: false })
    .eq("unsubscribe_token", token)
    .select("email")
    .single();

  if (error || !data) {
    console.error("Unsubscribe DB error:", error?.message);
    return {
      success: false,
      error: "Token not found or already unsubscribed.",
    };
  }

  return { success: true, email: data.email };
}

// ── main handler ─────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── GET: Email link click → unsubscribe & redirect to confirmation page ──
  if (req.method === "GET") {
    const token =
      typeof req.query.token === "string" ? req.query.token : undefined;

    if (!token) {
      return res.redirect(302, "/unsubscribe?success=false");
    }

    const result = await unsubscribeByToken(token);

    if (!result.success) {
      return res.redirect(302, "/unsubscribe?success=false");
    }

    // Redirect to confirmation page — email is only shown as a masked hint
    return res.redirect(302, "/unsubscribe?success=true");
  }

  // ── POST: JSON body  OR  RFC 8058 one-click unsubscribe ──────────
  if (req.method === "POST") {
    const contentType = req.headers["content-type"] || "";

    let token: string | undefined;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      // RFC 8058: Gmail/Yahoo one-click unsubscribe
      // Body is "List-Unsubscribe=One-Click", token comes from query string
      token = typeof req.query.token === "string" ? req.query.token : undefined;
    } else {
      // Standard JSON POST from your own UI or API consumers
      token = req.body?.token;
    }

    if (!token) {
      return res.status(400).json({ error: "Missing unsubscribe token." });
    }

    const result = await unsubscribeByToken(token);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    return res.status(200).json({ message: "Successfully unsubscribed." });
  }

  // ── OPTIONS: Preflight (shouldn't usually be needed for form POST) ──
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  return res
    .status(405)
    .json({ error: "Only GET and POST requests are allowed." });
}
