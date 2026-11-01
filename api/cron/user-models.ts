import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";
import {
  processUserModel,
  cleanUserModelObjects,
} from "../../utils/userModels";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.authorization !== "Bearer " + process.env.CRON_SECRET
  )
    return res.status(401).json({ error: "Unauthorized" });
  try {
    let recovered = 0;
    if (process.env.USER_MODELS_ENABLED === "true") {
      const { data, error } = await supabase
        .from("user_models")
        .select("user_id,operation_id")
        .in("state", ["queued", "running"])
        .or("lease_until.is.null,lease_until.lt." + new Date().toISOString())
        .order("created_at")
        .limit(8);
      if (error) throw error;
      const outcomes = await Promise.allSettled(
        (data || []).map((row) =>
          processUserModel(row.user_id, row.operation_id),
        ),
      );
      if (outcomes.some((result) => result.status === "rejected"))
        throw new Error("model_recovery_failed");
      recovered = outcomes.length;
    }
    return res.json({ recovered, cleaned: await cleanUserModelObjects() });
  } catch {
    return res
      .status(503)
      .json({ error: "Model recovery could not complete." });
  }
}
