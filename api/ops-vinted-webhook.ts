import { createClient } from "@supabase/supabase-js";
import { TextDecoder } from "node:util";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { decodeVintedWebhook } from "../utils/ops/integrations/vinted/webhooks";

export const config = { api: { bodyParser: false } };

async function rawRequest(request: VercelRequest): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 256_000) throw new Error("Webhook body too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== "POST")
    return response.status(405).json({ error: "Method not allowed" });
  try {
    const raw = await rawRequest(request);
    const candidate = JSON.parse(new TextDecoder().decode(raw)) as {
      webhook_id?: unknown;
    };
    const webhookId =
      typeof candidate.webhook_id === "string" ? candidate.webhook_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(webhookId))
      return response.status(400).json({ error: "Invalid webhook" });
    const url = process.env.VERCEL_APP_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error("OS storage unavailable");
    const client = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    const { data: connection, error: connectionError } = await client
      .from("ops_vinted_connections")
      .select("id,workspace_id,environment,webhook_id")
      .eq("webhook_id", webhookId)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection)
      return response.status(404).json({ error: "Unknown webhook" });
    const keys = JSON.parse(
      process.env.VINTED_WEBHOOK_SIGNING_KEYS_JSON ?? "{}",
    ) as Record<string, string>;
    const signingKey = keys[webhookId];
    if (!signingKey)
      return response.status(503).json({ error: "Webhook secret unavailable" });
    const signature = request.headers["x-vpi-webhook-hmac-sha256"];
    const event = decodeVintedWebhook(
      raw,
      typeof signature === "string" ? signature : null,
      webhookId,
      signingKey,
      Math.floor(Date.now() / 1000),
    );
    const { error } = await client.from("ops_vinted_events").insert({
      connection_id: connection.id,
      workspace_id: connection.workspace_id,
      webhook_id: event.webhookId,
      body_sha256: event.bodySha256,
      event_type: event.eventType,
      payload: event.payload,
    });
    if (error && error.code !== "23505") throw error;
    return response
      .status(200)
      .json({ accepted: true, duplicate: error?.code === "23505" });
  } catch (error) {
    if (error instanceof SyntaxError)
      return response.status(400).json({ error: "Invalid JSON" });
    if (
      error instanceof Error &&
      (error.message.startsWith("Invalid") ||
        error.message.includes("too large"))
    )
      return response.status(400).json({ error: error.message });
    return response.status(503).json({ error: "Webhook storage unavailable" });
  }
}
