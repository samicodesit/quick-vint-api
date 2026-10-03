import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../supabaseClient";
import { recordServerIncident } from "./service";

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

export async function handleIssues(req: VercelRequest, res: VercelResponse) {
  try {
    const action = req.query.action;
    if (action === "issues" && req.method === "GET") {
      let cursor: { time?: string; id?: string } = {};
      if (req.query.cursor) {
        try {
          cursor = JSON.parse(
            Buffer.from(String(req.query.cursor), "base64url").toString(),
          );
        } catch {
          return res.status(400).json({ error: "Invalid cursor" });
        }
        if (
          !cursor.id ||
          !uuid.test(cursor.id) ||
          !cursor.time ||
          !Number.isFinite(Date.parse(cursor.time))
        )
          return res.status(400).json({ error: "Invalid cursor" });
      }
      const userId =
        typeof req.query.user_id === "string" ? req.query.user_id : null;
      if (userId && !uuid.test(userId))
        return res.status(400).json({ error: "Invalid user" });
      const status = String(req.query.status || "open");
      if (!["open", "acknowledged", "resolved", "all"].includes(status))
        return res.status(400).json({ error: "Invalid status" });
      const { data, error } = await supabase.rpc("incident_list", {
        p_user_id: userId,
        p_status: status,
        p_before: cursor.time || null,
        p_id: cursor.id || null,
        p_client_id:
          typeof req.query.client_id === "string"
            ? req.query.client_id.slice(0, 120)
            : null,
      });
      if (error) throw error;
      const rows = data || [];
      const issues = rows.slice(0, 50);
      const last = issues[issues.length - 1];
      const health = await supabase.rpc("incident_health");
      return res.status(200).json({
        issues,
        nextCursor:
          rows.length > 50 && last
            ? Buffer.from(
                JSON.stringify({ time: last.last_seen, id: last.id }),
              ).toString("base64url")
            : null,
        processingPaused: process.env.INCIDENT_PROCESSING_PAUSED === "true",
        health: health.error
          ? { error: "Monitoring health unavailable" }
          : health.data,
      });
    }
    if (action === "issue-detail" && req.method === "GET") {
      const id = String(req.query.id || "");
      if (!uuid.test(id))
        return res.status(400).json({ error: "Invalid issue" });
      const [issue, flows] = await Promise.all([
        supabase
          .from("incident_groups")
          .select("*")
          .eq("id", id)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle(),
        supabase
          .from("incident_flows")
          .select(
            "id,operation_id,user_id,identity_verified,stage,running,progress,updated_at",
          )
          .eq("incident_id", id)
          .gt("expires_at", new Date().toISOString())
          .order("updated_at", { ascending: false })
          .limit(51),
      ]);
      if (issue.error || flows.error)
        throw new Error("Issue detail unavailable");
      if (!issue.data)
        return res.status(404).json({ error: "Issue expired or not found" });
      // The full email snapshot is retry state, not a detail-page payload.
      const { notification_payload: _payload, ...summary } = issue.data;
      if (Date.parse(summary.evidence_expires_at) <= Date.now())
        summary.examples = [];
      return res.status(200).json({
        issue: summary,
        operations: (flows.data || []).slice(0, 50),
        moreOperations: (flows.data || []).length > 50,
      });
    }
    if (action === "issue-state" && req.method === "POST") {
      const id = String(req.body?.id || "");
      const status = req.body?.status;
      if (
        !uuid.test(id) ||
        !["open", "acknowledged", "resolved"].includes(status)
      )
        return res.status(400).json({ error: "Invalid issue action" });
      const { data, error } = await supabase.rpc("incident_set_state", {
        p_id: id,
        p_status: status,
      });
      if (error) throw error;
      return res.status(data ? 200 : 404).json({ ok: Boolean(data) });
    }
    if (action === "issue-self-test" && req.method === "POST") {
      const id = await recordServerIncident({
        event: "own_context_exception",
        error: new Error(
          "Admin synthetic incident. No customer or generation involved.",
        ),
        context: {
          stage: "monitoring_self_test",
          errorCode: "ADMIN_SYNTHETIC",
        },
      });
      return res
        .status(id ? 200 : 503)
        .json({ id, url: id ? `/admin/reports?incident=${id}` : null });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch {
    return res.status(503).json({ error: "Issues temporarily unavailable" });
  }
}
