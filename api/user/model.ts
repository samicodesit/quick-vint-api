import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { supabase } from "../../utils/supabaseClient";
import {
  isAllowedAppOrigin,
  isAllowedVintedOrigin,
} from "../../utils/allowedOrigins";
import {
  createUserModel,
  getUserModel,
  modelMutate,
  processUserModel,
  UserModelError,
} from "../../utils/userModels";
import { parseModelPreferences } from "../../utils/userModelCatalog";
import { isDisposableEmail } from "../../utils/disposableDomains";
import { detectAndPauseDuplicateIpAccount } from "../../utils/duplicateIpAutoPause";
import { ApiLogger } from "../../utils/apiLogger";
import {
  isAccountPaused,
  buildAccountPausedResponse,
} from "../../src/utils/accountPause";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Origin");
  const origin = req.headers.origin;
  // Extension service-worker requests may omit Origin or send their extension origin.
  // Bearer auth is always mandatory; no cookie authentication is used here.
  if (
    !isAllowedAppOrigin(origin) &&
    !isAllowedVintedOrigin(origin) &&
    !/^chrome-extension:\/\/[a-p]{32}$/.test(origin || "")
  )
    return res.status(403).json({ error: "Origin not allowed." });
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Autolister-Client",
  );
  if (req.method === "OPTIONS") return res.status(204).end();
  if (process.env.USER_MODELS_ENABLED !== "true")
    return res.status(404).json({
      code: "models_disabled",
      error: "Your model is not available yet.",
    });
  if (!["GET", "POST", "PATCH"].includes(req.method || ""))
    return res.status(405).json({ error: "Method not allowed." });
  const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/)?.[1];
  if (!token)
    return res.status(401).json({ error: "Sign in to open your model." });
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user)
      return res
        .status(401)
        .json({ error: "Sign in again to open your model." });
    let job: any;
    if (req.method !== "GET") {
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body))
        return res.status(400).json({ error: "Invalid model request." });
      const allowed =
        req.method === "PATCH" ? ["enabled"] : ["action", "preferences"];
      if (Object.keys(body).some((key) => !allowed.includes(key)))
        return res.status(400).json({ error: "Unknown model field." });
      if (req.method === "PATCH") {
        if (typeof body.enabled !== "boolean")
          return res
            .status(400)
            .json({ error: "Enabled must be true or false." });
        await modelMutate(user.id, "enable", { enabled: body.enabled });
      } else {
        if (!["create", "retry", "invite", "dismiss"].includes(body.action))
          return res.status(400).json({ error: "Unknown model action." });
        if (body.action !== "create" && "preferences" in body)
          return res
            .status(400)
            .json({ error: "Preferences cannot be changed." });
        if (body.action === "create") {
          try {
            parseModelPreferences(body.preferences);
          } catch (e) {
            return res.status(400).json({ error: (e as Error).message });
          }
        }
        if (["create", "retry"].includes(body.action)) {
          if (isDisposableEmail(user.email || ""))
            return res.status(403).json({
              error: "Use a permanent email address to create your model.",
            });
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select(
              "id,account_status,abuse_reason,subscription_status,subscription_tier,free_lifetime_generations_used",
            )
            .eq("id", user.id)
            .maybeSingle();
          if (profileError) throw profileError;
          const pause = await detectAndPauseDuplicateIpAccount({
            userId: user.id,
            email: user.email,
            ipAddress: ApiLogger.extractRequestMetadata(req).ipAddress,
            source: "user-model",
            currentProfile: profile,
          });
          if (pause.paused || isAccountPaused(profile))
            return res
              .status(403)
              .json(
                buildAccountPausedResponse(
                  profile || { account_status: "paused" },
                ),
              );
          job =
            body.action === "create"
              ? await createUserModel(user.id, body.preferences)
              : await modelMutate(user.id, "retry");
        } else if (body.action === "invite")
          return res.json(await modelMutate(user.id, "invite"));
        else await modelMutate(user.id, "dismiss");
      }
    }
    const state = await getUserModel(user.id);
    const operationId = job?.operation_id || state.model?.operationId;
    if (
      operationId &&
      ["queued", "running"].includes(state.model?.state || "")
    ) {
      waitUntil(
        processUserModel(user.id, operationId).catch(() => {
          console.error("User model worker deferred to recovery", operationId);
        }),
      );
    }
    return res
      .status(job && ["queued", "running"].includes(job.state) ? 202 : 200)
      .json(state);
  } catch (error) {
    if (error instanceof UserModelError)
      return res
        .status(error.status)
        .json({ code: error.code, error: error.message });
    return res.status(503).json({
      code: "model_service_unavailable",
      error: "Your model could not be loaded or saved. Please try again.",
    });
  }
}
