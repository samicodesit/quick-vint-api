import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";
import { sanitizeAttribution, type Attribution } from "../../utils/attribution";

const AUTOLISTER_ORIGIN = "https://autolister.app";
const EXTENSION_ORIGIN = "chrome-extension://mommklhpammnlojjobejddmidmdcalcl";

function applyCors(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.headers.origin || "");
  if (origin === AUTOLISTER_ORIGIN || origin === EXTENSION_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function parseBody(body: unknown) {
  if (typeof body === "string") {
    try {
      return JSON.parse(body || "{}");
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" ? body : {};
}

export function buildAttributionClaimUpdate(
  userId: string,
  rawAttribution: unknown,
  claimedAt = new Date().toISOString(),
) {
  const attribution = sanitizeAttribution(rawAttribution, { now: claimedAt });
  if (!userId || !attribution) throw new Error("invalid_attribution");
  return {
    user_id: userId,
    source: attribution.source,
    medium: attribution.medium,
    campaign: attribution.campaign,
    content: attribution.content,
    captured_at: attribution.capturedAt,
    referrer_host: attribution.referrerHost,
    claimed_at: claimedAt,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const authorization = String(req.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authorization.slice("Bearer ".length).trim();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user?.id) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const body = parseBody(req.body) as { attribution?: Attribution };
  const claimedAt = new Date().toISOString();
  let update: ReturnType<typeof buildAttributionClaimUpdate>;
  try {
    update = buildAttributionClaimUpdate(user.id, body.attribution, claimedAt);
  } catch {
    return res.status(400).json({ error: "invalid_attribution" });
  }

  const { error } = await supabase.from("user_attributions").insert(update);
  if (error) {
    if (error.code === "23505") {
      return res.status(200).json({ ok: true, alreadyAttributed: true });
    }
    console.error("Attribution claim failed:", error);
    return res.status(500).json({ error: "attribution_claim_failed" });
  }

  return res.status(200).json({ ok: true, alreadyAttributed: false });
}
