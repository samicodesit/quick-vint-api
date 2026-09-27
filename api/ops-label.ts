import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
export const config = { api: { bodyParser: false } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function one(value: unknown) {
  return typeof value === "string" ? value : "";
}
async function pdfBody(request: VercelRequest) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 10_000_000) throw new Error("PDF exceeds 10 MB");
    chunks.push(bytes);
  }
  const body = Buffer.concat(chunks);
  if (body.length < 8 || body.subarray(0, 5).toString() !== "%PDF-")
    throw new Error("A PDF label is required");
  return body;
}
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST" && request.method !== "GET")
    return response.status(405).json({ error: "Method not allowed" });
  const workspaceId = one(request.query.workspaceId);
  if (!uuid.test(workspaceId))
    return response.status(400).json({ error: "Invalid workspace" });
  const token = /^Bearer (.+)$/i.exec(one(request.headers.authorization))?.[1];
  if (!token) return response.status(401).json({ error: "Sign in required" });
  const url = process.env.VERCEL_APP_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return response.status(503).json({ error: "Storage is not configured" });
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data: identity, error: identityError } =
    await client.auth.getUser(token);
  if (identityError || !identity.user)
    return response.status(401).json({ error: "Sign in required" });
  const { data: membership, error: memberError } = await client
    .from("ops_memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", identity.user.id)
    .eq("active", true)
    .maybeSingle();
  if (memberError)
    return response.status(503).json({ error: "Membership unavailable" });
  if (
    !membership ||
    !["owner", "manager", "warehouse"].includes(membership.role)
  )
    return response.status(403).json({ error: "Label access denied" });
  if (request.method === "GET") {
    const labelId = one(request.query.labelId);
    if (!uuid.test(labelId))
      return response.status(400).json({ error: "Invalid label" });
    const { data: label, error } = await client
      .from("ops_labels")
      .select("storage_path")
      .eq("workspace_id", workspaceId)
      .eq("id", labelId)
      .maybeSingle();
    if (error || !label)
      return response.status(404).json({ error: "Label not found" });
    const signed = await client.storage
      .from("ops-labels")
      .createSignedUrl(label.storage_path, 60);
    if (signed.error || !signed.data)
      return response
        .status(503)
        .json({ error: "Label is temporarily unavailable" });
    return response
      .status(200)
      .json({ url: signed.data.signedUrl, expiresInSeconds: 60 });
  }
  const orderId = one(request.query.orderId);
  if (!uuid.test(orderId))
    return response
      .status(400)
      .json({ error: "Select an order before uploading" });
  if (!one(request.headers["content-type"]).startsWith("application/pdf"))
    return response.status(415).json({ error: "PDF required" });
  const { data: order, error: orderError } = await client
    .from("ops_orders")
    .select("id,status")
    .eq("workspace_id", workspaceId)
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order || order.status !== "picking")
    return response
      .status(409)
      .json({ error: "Order is not ready for a label" });
  try {
    const body = await pdfBody(request),
      hash = createHash("sha256").update(body).digest("hex");
    const path = `${workspaceId}/${orderId}/${randomUUID()}.pdf`;
    const stored = await client.storage
      .from("ops-labels")
      .upload(path, body, { contentType: "application/pdf", upsert: false });
    if (stored.error) throw stored.error;
    const { data: label, error } = await client
      .from("ops_labels")
      .insert({
        workspace_id: workspaceId,
        order_id: orderId,
        source: "manual_upload",
        storage_path: path,
        sha256: hash,
        bytes: body.length,
        created_by: identity.user.id,
      })
      .select("id")
      .single();
    if (error || !label) {
      await client.storage.from("ops-labels").remove([path]);
      throw error ?? new Error("Could not record label");
    }
    return response.status(201).json({ labelId: label.id, orderId });
  } catch (cause) {
    if (
      cause instanceof Error &&
      (cause.message.includes("PDF") || cause.message.includes("10 MB"))
    )
      return response.status(400).json({ error: cause.message });
    return response
      .status(503)
      .json({ error: "Label upload could not be completed" });
  }
}
