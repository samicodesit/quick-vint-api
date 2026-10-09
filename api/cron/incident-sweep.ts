import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";
import { deliverPendingNotifications } from "../../utils/incidents/notifications";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  )
    return res.status(401).json({ error: "Unauthorized" });
  if (process.env.INCIDENT_PROCESSING_PAUSED === "true")
    return res.status(200).json({ paused: true });
  try {
    const { data, error } = await supabase.rpc("incident_sweep", {
      p_limit: 100,
    });
    if (error) throw error;
    const delivery = await deliverPendingNotifications(20);
    return res.status(delivery.failed ? 503 : 200).json({ ...data, delivery });
  } catch {
    return res.status(503).json({ error: "Incident sweep failed" });
  }
}
