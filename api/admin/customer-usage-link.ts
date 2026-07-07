import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createCustomerUsageUrl } from "../../utils/customerUsageToken";
import { supabase } from "../../utils/supabaseClient";

function normalizeEmail(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function parseExpiryDays(value: unknown) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 120;
  return Math.min(parsed, 365);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || req.headers.authorization !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const email = normalizeEmail(req.body?.email);
  const expiresInDays = parseExpiryDays(req.body?.expires_in_days);

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Missing valid email." });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .single();

  if (error || !profile?.email) {
    return res.status(404).json({ error: "User profile not found." });
  }

  const expiresAt = new Date(
    Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const url = createCustomerUsageUrl({
    email: profile.email,
    expiresAt,
  });

  return res.status(200).json({
    email: profile.email,
    expiresAt,
    url,
  });
}
