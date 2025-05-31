import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buffer } from "micro";
import qs from "querystring";
import { supabase } from "../../utils/supabaseClient";

export const config = { api: { bodyParser: false } }; // we parse manually

const VALID_SELLER_ID = "xpmFDK3dS74a7GHUC8CCiQ==";
const PRODUCT_PERMALINK = "autolister-ai-unlimited";

type Tier = "unlimited_monthly" | "unlimited_annual";

/**
 * Map Gumroad recurrence or subscription_frequency
 * to our tier strings.
 */
function mapTier(recurrence?: string): Tier {
  return recurrence?.toLowerCase().startsWith("year")
    ? "unlimited_annual"
    : "unlimited_monthly";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Gumroad sends payload as application/x-www-form-urlencoded
  const raw = (await buffer(req)).toString();
  const ping = qs.parse(raw) as Record<string, string>;

  /* ---------- Basic validation ---------- */
  if (ping.seller_id !== VALID_SELLER_ID) {
    return res.status(401).end("Invalid seller_id");
  }
  if (ping.permalink !== PRODUCT_PERMALINK) {
    return res.status(400).end("Unknown product");
  }

  /* ---------- Find user by email ---------- */
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", ping.email) // case-insensitive match
    .single();

  if (error || !profile) {
    return res.status(404).end("User not found");
  }

  /* ---------- Build update payload ---------- */
  const update: Record<string, unknown> = {
    gumroad_subscription_id: ping.subscription_id || null,
    subscription_tier: mapTier(ping.recurrence || ping.subscription_frequency),
    subscription_status: (ping.subscription_status || "active").toLowerCase(),
  };

  if (ping.next_charge_date) {
    update.current_period_end = new Date(ping.next_charge_date).toISOString();
  }

  /* ---------- Write back to Supabase ---------- */
  await supabase.from("profiles").update(update).eq("id", profile.id);

  return res.json({ received: true });
}
