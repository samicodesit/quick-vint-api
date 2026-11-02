import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { supabase } from "../utils/supabaseClient";
import {
  isAllowedAppOrigin,
  isAllowedVintedOrigin,
  isFirefoxExtensionOrigin,
} from "../utils/allowedOrigins";
import {
  listingPhotosEnabled,
  photoAccess,
  photoMutate,
  getListingPhotoJob,
  processListingPhotoJob,
  admitPhotoOnly,
  validPhotoSource,
} from "../utils/listingPhotoJobs";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Origin");
  const origin = req.headers.origin;
  if (
    !isAllowedAppOrigin(origin) &&
    !isAllowedVintedOrigin(origin) &&
    !isFirefoxExtensionOrigin(origin) &&
    !/^chrome-extension:\/\/[a-p]{32}$/.test(origin || "")
  )
    return res.status(403).json({ code: "origin_denied" });
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Autolister-Client",
  );
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!listingPhotosEnabled())
    return res.status(404).json({ code: "photos_disabled" });
  if (!["GET", "POST"].includes(req.method || ""))
    return res.status(405).json({ code: "method_not_allowed" });
  const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/)?.[1];
  if (!token) return res.status(401).json({ code: "sign_in_required" });
  let auth;
  try {
    auth = await supabase.auth.getUser(token);
  } catch {
    return res.status(503).json({ code: "photo_job_unavailable" });
  }
  const { data, error } = auth;
  if (error || !data.user)
    return res.status(401).json({ code: "sign_in_required" });
  if (req.method === "POST" && req.body?.action === "create") {
    if (
      Object.keys(req.body).some(
        (k) => !["action", "sources", "sourceKey"].includes(k),
      ) ||
      !Array.isArray(req.body.sources) ||
      !req.body.sources.length ||
      req.body.sources.length > 20 ||
      !req.body.sources.every(
        (s: unknown) => typeof s === "string" && validPhotoSource(s),
      )
    )
      return res.status(400).json({ code: "invalid_photo_sources" });
    try {
      const result = await admitPhotoOnly(
        data.user.id,
        req.body.sources,
        req.body.sourceKey,
      );
      return res.status(result.denied ? 409 : 200).json(result);
    } catch {
      return res.status(503).json({ code: "photo_job_unavailable" });
    }
  }
  const id = req.method === "GET" ? req.query.id : req.body?.id;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    return res.status(400).json({ code: "invalid_job" });
  if (
    req.method === "POST" &&
    (!req.body ||
      Object.keys(req.body).some((k) => !["id", "action"].includes(k)) ||
      ![
        "resume",
        "retry",
        "cancel",
        "attached",
        "attachment_failed",
        "order_failed",
        "capacity",
      ].includes(req.body.action))
  )
    return res.status(400).json({ code: "invalid_action" });
  try {
    if (!(await photoAccess(data.user.id)))
      return res.status(403).json({ code: "account_unavailable" });
    const state = await getListingPhotoJob(data.user.id, id);
    if (!state) return res.status(404).json({ code: "photo_job_unavailable" });
    if (req.method === "GET") return res.json(state);
    if (req.method === "POST") {
      if (req.body.action !== "resume")
        await photoMutate(data.user.id, req.body.action, { id });
      if (["resume", "retry"].includes(req.body.action)) {
        const pending = processListingPhotoJob(data.user.id, id).catch(() =>
          console.warn("Photo job could not resume"),
        );
        try {
          waitUntil(pending);
        } catch {
          /* local runner */
        }
      }
    }
    return res.json(await getListingPhotoJob(data.user.id, id));
  } catch (error: any) {
    return res
      .status(error?.message?.includes("retry_limit") ? 409 : 503)
      .json({ code: "photo_job_unavailable" });
  }
}
