import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDirectUser } from "../../utils/directUser";
import { supabase } from "../../utils/supabaseClient";
import {
  isPluginUserAllowed,
  pluginAccessConfig,
} from "../../utils/chatgptAuth";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST" || req.headers.origin !== "https://autolister.app")
    return res.status(403).end();
  if (process.env.CHATGPT_PLUGIN_ENABLED !== "true")
    return res.status(404).end();
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return res.status(401).end();
  const { data, error } = await getDirectUser(token);
  if (
    error ||
    !data.user ||
    !isPluginUserAllowed(data.user.id, pluginAccessConfig())
  )
    return res.status(403).end();
  const clientId = process.env.CHATGPT_OAUTH_CLIENT_ID || "";
  if (!clientId) return res.status(503).end();
  try {
    const client = await supabase.auth.admin.oauth.getClient(clientId);
    if (client.error || !client.data) return res.status(503).end();
    return res.json({ clientId, redirectUris: client.data.redirect_uris });
  } catch {
    return res.status(503).end();
  }
}
