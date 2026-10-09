import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../utils/supabaseClient";
import { isAllowedAppOrigin } from "../utils/allowedOrigins";
import { handleDraftAction, DraftError } from "../utils/listingDrafts";
import { validateDraftAction } from "../src/app/mobile-web/draftContracts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Origin");
  const origin = req.headers.origin;
  if (!isAllowedAppOrigin(origin))
    return res.status(403).json({ error: "Origin not allowed." });
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Autolister-Client",
  );
  if (req.method === "OPTIONS") return res.status(204).end();
  if (
    process.env.MOBILE_WEB_APP_ENABLED !== "true" ||
    process.env.LISTING_DRAFTS_ENABLED !== "true"
  )
    return res.status(404).json({
      code: "drafts_disabled",
      error: "Draft preparation is not enabled yet.",
    });
  if (!["GET", "POST"].includes(req.method || ""))
    return res.status(405).json({ error: "Method not allowed." });
  const authorization = req.headers.authorization;
  const token =
    typeof authorization === "string"
      ? authorization.match(/^Bearer\s+(\S+)$/)?.[1]
      : null;
  if (!token)
    return res.status(401).json({ error: "Sign in to open your drafts." });
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user)
      return res
        .status(401)
        .json({ error: "Sign in again to open your drafts." });
    const action =
      req.method === "GET"
        ? String(req.query?.action || "list")
        : req.body?.action;
    if (req.method === "GET" && !["list", "detail"].includes(action))
      return res.status(405).json({ error: "Use POST for this action." });
    const raw =
      req.method === "GET"
        ? Object.fromEntries(
            Object.entries(req.query || {}).filter(([key]) => key !== "action"),
          )
        : req.body?.input;
    let input;
    try {
      input = validateDraftAction(action, raw);
    } catch (e) {
      return res.status(400).json({
        code: "invalid_draft_request",
        error: e instanceof Error ? e.message : "Invalid request.",
      });
    }
    return res
      .status(200)
      .json(await handleDraftAction(user.id, action, input));
  } catch (error) {
    if (error instanceof DraftError)
      return res
        .status(error.status)
        .json({ code: error.code, error: error.message });
    return res.status(503).json({
      code: "draft_service_unavailable",
      error: "Your work could not be loaded or saved. Please try again.",
    });
  }
}
