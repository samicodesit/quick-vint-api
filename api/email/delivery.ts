import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buffer } from "micro";
import { Resend } from "resend";
import { supabase } from "../../utils/supabaseClient";
export const config = { api: { bodyParser: false } };
const TYPES = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.failed",
  "email.complained",
  "email.suppressed",
]);
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  if (!process.env.RESEND_WEBHOOK_SECRET)
    return res.status(503).json({ error: "Webhook not configured" });
  let event;
  const id = req.headers["svix-id"];
  const timestamp = req.headers["svix-timestamp"];
  const signature = req.headers["svix-signature"];
  try {
    if (
      typeof id !== "string" ||
      typeof timestamp !== "string" ||
      typeof signature !== "string"
    )
      throw new Error("Missing signature");
    const raw = await buffer(req, { limit: "256kb" });
    event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
      payload: raw.toString("utf8"),
      headers: { id, timestamp, signature },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    });
  } catch {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }
  if (!TYPES.has(event.type)) return res.status(200).json({ received: true });
  const data = event.data as { email_id?: string };
  if (!data.email_id || !Number.isFinite(Date.parse(event.created_at)))
    return res.status(400).json({ error: "Invalid event" });
  const { error } = await supabase
    .from("billing_email_delivery_events")
    .insert({
      id,
      resend_email_id: data.email_id,
      event_type: event.type,
      occurred_at: event.created_at,
    });
  if (error && error.code !== "23505")
    return res.status(503).json({ error: "Evidence persistence failed" });
  return res.status(200).json({ received: true });
}
