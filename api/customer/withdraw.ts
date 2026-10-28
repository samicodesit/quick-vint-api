import { createHmac } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { billingEvidenceHash as hash } from "../../utils/billingEvidenceHash";
import { supabase } from "../../utils/supabaseClient";
import { deliverBillingNotice } from "../../utils/billingNotices";
import {
  withdrawalReceipt,
  WITHDRAWAL_STATEMENT as STATEMENT,
} from "../../utils/withdrawalReceipt";
import { reportCriticalEndpointFailure } from "../../utils/criticalEndpointAlert";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const origin = req.headers.origin;
  if (
    origin &&
    origin !== "https://autolister.app" &&
    origin !== "https://www.autolister.app"
  )
    return res.status(403).json({ error: "Origin denied" });
  const body = req.body;
  if (!body || typeof body !== "object" || body.confirmed !== true)
    return res
      .status(400)
      .json({ error: "Confirm your withdrawal statement." });
  const { requestId } = body;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const contract =
    typeof body.contract === "string" ? body.contract.trim() : "";
  if (
    typeof requestId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      requestId,
    ) ||
    !name ||
    name.length > 160 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
    email.length > 254 ||
    !contract ||
    contract.length > 1000
  )
    return res
      .status(400)
      .json({ error: "Enter your name, email and contract details." });
  try {
    if (!process.env.CRON_SECRET)
      throw new Error("Receipt configuration unavailable");
    const receivedAt = new Date().toISOString();
    const rawIp =
      req.headers["x-vercel-forwarded-for"] ||
      req.socket?.remoteAddress ||
      "unknown";
    const rateKey = createHmac("sha256", process.env.CRON_SECRET)
      .update(String(rawIp).split(",")[0])
      .digest("hex");
    const { payload, staffPayload } = withdrawalReceipt({
      name,
      email,
      contract,
      requestId,
      receivedAt,
    });
    const { data, error } = await supabase.rpc("receive_withdrawal", {
      p_id: requestId,
      p_received_at: receivedAt,
      p_name: name,
      p_email: email,
      p_contract: contract,
      p_statement: STATEMENT,
      p_rate_key: rateKey,
      p_payload: payload,
      p_payload_sha256: hash(payload),
      p_staff_payload: staffPayload,
      p_staff_sha256: hash(staffPayload),
    });
    if (error) throw error;
    if (data?.rate_limited)
      return res.status(429).json({
        error:
          "Too many submissions. You can still send your statement to support@autolister.app.",
      });
    if (!data?.received_at) throw new Error("Receipt was not persisted");
    // Persistence establishes receipt; email failures must never turn it into an unreceived request.
    let emailStatus = "queued";
    try {
      emailStatus = await deliverBillingNotice(`withdrawal/${requestId}`);
      await deliverBillingNotice(`withdrawal-staff/${requestId}`);
    } catch (error) {
      reportCriticalEndpointFailure({
        error,
        endpoint: "/api/customer/withdraw",
        status: 500,
      });
    }
    return res.status(200).json({
      reference: requestId,
      receivedAt: data.received_at,
      emailStatus,
      statement: STATEMENT,
    });
  } catch (error) {
    reportCriticalEndpointFailure({
      error,
      endpoint: "/api/customer/withdraw",
      status: 503,
    });
    return res.status(503).json({
      error:
        "We could not confirm receipt. Retry or email your statement to support@autolister.app.",
    });
  }
}
