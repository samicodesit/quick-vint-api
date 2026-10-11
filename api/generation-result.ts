import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../utils/supabaseClient";
import { runUsageCors } from "../utils/usageCors";
import {
  isMobileWebEnabled,
  isValidMobileRequestId,
  MOBILE_WEB_DISABLED_RESPONSE,
} from "../utils/mobileWeb";
import { validateStoredResponse } from "../utils/mobileGenerationIdempotency";

/** Read-only recovery. Never claims an operation, reserves usage, or calls AI. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    await runUsageCors(req, res);
  } catch {
    return res.status(403).json({ error: "Origin not allowed." });
  }
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!isMobileWebEnabled())
    return res.status(404).json(MOBILE_WEB_DISABLED_RESPONSE);
  const authorization = req.headers.authorization;
  const token =
    typeof authorization === "string"
      ? authorization.match(/^Bearer\s+(\S+)$/)?.[1]
      : undefined;
  if (!token)
    return res.status(401).json({ error: "Sign in to check your result." });
  const requestId = req.query.requestId;
  if (!isValidMobileRequestId(requestId))
    return res
      .status(400)
      .json({ error: "Choose a valid generation request." });
  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user)
      return res
        .status(401)
        .json({ error: "Sign in again to check your result." });
    const { data: row, error } = await supabase
      .from("mobile_generation_idempotency")
      .select("status,response_json,commit_pending,reservation_id,expires_at")
      .eq("user_id", user.id)
      .eq("client", "mobile_web")
      .eq("request_id", requestId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(200).json({ state: "missing" });
    let committed = row.status === "succeeded";
    let refunded = false;
    if (!committed && row.reservation_id) {
      const reservation = await supabase
        .from("generation_reservations")
        .select("status")
        .eq("id", row.reservation_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (reservation.error) throw reservation.error;
      committed = reservation.data?.status === "committed";
      refunded = reservation.data?.status === "refunded";
    }
    if (committed) {
      const result = validateStoredResponse(row.response_json);
      if (!result.ok) return res.status(200).json({ state: "unavailable" });
      return res
        .status(200)
        .json({ state: "succeeded", result: result.response });
    }
    const expired =
      Number.isFinite(Date.parse(row.expires_at)) &&
      Date.parse(row.expires_at) <= Date.now();
    return res.status(200).json({
      state:
        row.status === "failed" || refunded
          ? "failed"
          : expired
            ? "expired"
            : "pending",
    });
  } catch {
    return res.status(503).json({
      code: "generation_recovery_unavailable",
      error: "Your result could not be checked. Try again shortly.",
    });
  }
}
