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
  // 1) Log every incoming request, regardless of method, so we can see “test ping” hits
  console.log("→ /api/gumroad/ping incoming:", req.method, req.url);

  // 2) If Gumroad “test ping” is a GET (no body), just return 200 OK so the test shows up
  if (req.method === "GET") {
    console.log("→ Received GET (likely Gumroad test), returning 200");
    return res.status(200).json({ ok: true, note: "GET received (test ping)" });
  }

  // 3) Only accept POST from here on
  if (req.method !== "POST") {
    console.log("→ Rejecting non-POST:", req.method);
    return res.status(405).end("Method Not Allowed");
  }

  // 4) Parse the x-www-form-urlencoded body
  let raw: string;
  try {
    raw = (await buffer(req)).toString();
  } catch (e) {
    console.error("→ Error buffering request:", e);
    return res.status(400).end("Bad Request");
  }
  const ping = qs.parse(raw) as Record<string, string>;

  console.log("→ Parsed ping payload:", ping);

  // 5) Basic seller_id validation
  if (ping.seller_id !== VALID_SELLER_ID) {
    console.warn("→ Invalid seller_id:", ping.seller_id);
    return res.status(401).end("Invalid seller_id");
  }

  // 6) Product/permalink validation
  if (ping.permalink !== PRODUCT_PERMALINK) {
    console.warn("→ Unknown product permalink:", ping.permalink);
    return res.status(400).end("Unknown product");
  }

  // 7) Find the user’s profile by email
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", ping.email)
    .single();

  if (error || !profile) {
    console.warn("→ User not found for email:", ping.email);
    return res.status(404).end("User not found");
  }

  // 8) Build the update object
  const update: Record<string, unknown> = {
    gumroad_subscription_id: ping.subscription_id || null,
    subscription_tier: mapTier(ping.recurrence || ping.subscription_frequency),
    subscription_status: (ping.subscription_status || "active").toLowerCase(),
  };
  if (ping.next_charge_date) {
    update.current_period_end = new Date(ping.next_charge_date).toISOString();
  }

  // 9) Write back to Supabase
  try {
    await supabase.from("profiles").update(update).eq("id", profile.id);
    console.log("→ Updated profile:", profile.id, "with", update);
  } catch (updateErr) {
    console.error("→ Supabase update error:", updateErr);
    return res.status(500).end("Database update error");
  }

  return res.status(200).json({ received: true });
}
