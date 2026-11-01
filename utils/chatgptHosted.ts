/* global Request */
import { createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./supabaseClient";
import { getDirectUser } from "./directUser";
import { validatePluginClaims } from "./chatgptAuth";

export const PLUGIN_RESOURCE = "https://autolister.app/api/chatgpt/mcp";
const challenge =
  'Bearer resource_metadata="https://autolister.app/.well-known/oauth-protected-resource", scope="openid email"';

export async function hostedPluginRequest(
  req: VercelRequest,
  res: VercelResponse,
  mode: "mcp" | "handoff",
) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (process.env.CHATGPT_PLUGIN_ENABLED !== "true")
    return res.status(404).json({ error: "Not available." });
  const unauthorized = () => {
    res.setHeader("WWW-Authenticate", challenge);
    return res.status(401).json({ error: "Connect your AutoLister account." });
  };
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token || token.length > 16384) return unauthorized();
  const users = (process.env.CHATGPT_PRIVATE_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let user: string;
  try {
    if (mode === "mcp") {
      const { data, error } = await supabase.auth.getClaims(token);
      if (
        error ||
        !data?.claims ||
        data.claims.autolister_resource !== PLUGIN_RESOURCE
      )
        return unauthorized();
      user = validatePluginClaims(data.claims, {
        issuer: process.env.VERCEL_APP_SUPABASE_URL + "/auth/v1",
        clientId: process.env.CHATGPT_OAUTH_CLIENT_ID || "",
        users,
      });
    } else {
      if (req.headers.origin !== "https://autolister.app")
        return res.status(403).json({ error: "Origin not allowed." });
      const { data, error } = await getDirectUser(token);
      if (error || !data.user || !users.includes(data.user.id))
        return unauthorized();
      user = data.user.id;
    }
  } catch {
    return unauthorized();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  const body = JSON.stringify(req.body);
  if (!body || Buffer.byteLength(body) > 96 * 1024)
    return res.status(413).json({ error: "Request too large." });
  const origin = process.env.VERCEL_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.ADMIN_SECRET;
  if (!origin || !serviceKey || !secret)
    return res.status(503).json({ error: "Temporarily unavailable." });
  try {
    const { default: transfer } = await import("./chatgptTransfer.mjs");
    // Only our verified identity enters the internal worker. Never forward user headers.
    const result = await transfer.fetch(
      new Request("https://autolister.app/" + mode, {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          origin: "https://autolister.app",
          "oai-authenticated-user-id": user,
        },
      }),
      {
        LEDGER_ORIGIN: origin,
        LEDGER_ANON_KEY: serviceKey,
        LEDGER_WORKER_KEY: "",
        HANDOFF_KEY: createHash("sha256")
          .update("autolister-hosted-handoff:v1:")
          .update(secret)
          .digest("hex"),
      },
    );
    result.headers.forEach((value, key) => res.setHeader(key, value));
    return res
      .status(result.status)
      .send(Buffer.from(await result.arrayBuffer()));
  } catch {
    return res
      .status(503)
      .json({ error: "Could not prepare this draft. Try again." });
  }
}
