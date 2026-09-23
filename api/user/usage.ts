import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  isMobileWebEnabled,
  MOBILE_WEB_DISABLED_RESPONSE,
} from "../../utils/mobileWeb";
import { runUsageCors } from "../../utils/usageCors";
import { UsageRequestError, getUsageForBearer } from "../../utils/userUsage";

function getAuthorizationHeader(req: VercelRequest): string | undefined {
  const value = req.headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await runUsageCors(req, res);
  } catch (corsError: any) {
    return res.status(403).json({
      error: corsError?.message || "CORS check failed for usage",
    });
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  res.setHeader("Cache-Control", "private, no-store");

  if (!isMobileWebEnabled()) {
    return res.status(404).json(MOBILE_WEB_DISABLED_RESPONSE);
  }

  const authorization = getAuthorizationHeader(req);
  const tokenMatch = authorization?.match(/^Bearer\s+(\S+)$/);
  if (!tokenMatch) {
    return res.status(401).json({ error: "Missing or invalid Authorization" });
  }

  try {
    const response = await getUsageForBearer(tokenMatch[1]);
    return res.status(200).json(response);
  } catch (error: any) {
    if (error instanceof UsageRequestError || error?.statusCode) {
      const body = { error: error.message || "Could not retrieve usage." } as {
        error: string;
        code?: string;
      };
      if (error.code === "profile_not_found") body.code = error.code;
      return res.status(Number(error.statusCode)).json(body);
    }

    return res.status(500).json({ error: "Could not retrieve usage." });
  }
}
