// /api/gumroad/ping.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buffer } from "micro";
import qs from "querystring";
import { supabase } from "../../utils/supabaseClient";

export const config = { api: { bodyParser: false } };

const VALID_SELLER_ID = "xpmFDK3dS74a7GHUC8CCiQ==";
const PRODUCT_PERMALINK = "autolister-ai-unlimited";

type Tier = "unlimited_monthly" | "unlimited_annual";
function mapTier(recurrence?: string): Tier {
  return recurrence?.toLowerCase().startsWith("year")
    ? "unlimited_annual"
    : "unlimited_monthly";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("→ /api/gumroad/ping incoming:", req.method, req.url);

  if (req.method === "GET") {
    console.log("→ Received GET (likely test ping), returning 200");
    return res.status(200).json({ ok: true, note: "GET received (test ping)" });
  }
  if (req.method !== "POST") {
    console.log("→ Rejecting non-POST:", req.method);
    return res.status(405).end("Method Not Allowed");
  }

  // Parse body
  const raw = (await buffer(req)).toString();
  const ping = qs.parse(raw) as Record<string, string>;
  console.log("→ Parsed ping payload:", ping);

  // Validate seller_id
  if (ping.seller_id !== VALID_SELLER_ID) {
    console.warn("→ Invalid seller_id:", ping.seller_id);
    return res.status(401).end("Invalid seller_id");
  }

  // **CHECK `product_permalink`** (not `permalink`)
  if (ping.product_permalink !== PRODUCT_PERMALINK) {
    console.warn("→ Unknown product_permalink:", ping.product_permalink);
    return res.status(400).end("Unknown product");
  }

  // Find user by email
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", ping.email)
    .single();

  if (error || !profile) {
    console.warn("→ User not found for email:", ping.email);
    return res.status(404).end("User not found");
  }

  // Build update object
  const update: Record<string, unknown> = {
    gumroad_subscription_id: ping.subscription_id || null,
    subscription_tier: mapTier(ping.recurrence || ping.subscription_frequency),
    subscription_status: (ping.subscription_status || "active").toLowerCase(),
  };
  if (ping.next_charge_date) {
    update.current_period_end = new Date(ping.next_charge_date).toISOString();
  }

  try {
    await supabase.from("profiles").update(update).eq("id", profile.id);
    console.log("→ Updated profile:", profile.id, "with", update);
  } catch (updateErr) {
    console.error("→ Supabase update error:", updateErr);
    return res.status(500).end("Database update error");
  }

  return res.status(200).json({ received: true });
}
