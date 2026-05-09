import type { VercelRequest, VercelResponse } from "@vercel/node";
import Busboy from "busboy";
import Cors from "cors";
import { supabase } from "../utils/supabaseClient";
import { getFeatureFlags } from "../utils/tierConfig";

const cors = Cors({
  methods: ["GET", "POST", "OPTIONS"],
  origin: true,
  allowedHeaders: ["Content-Type", "Authorization"],
});

function runMiddleware(req: VercelRequest, res: VercelResponse, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

export const config = {
  api: { bodyParser: false },
};

interface FileUpload {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

// Resolves the authenticated user from the bearer token. Returns null when
// missing/invalid — callers translate that into a 401.
async function getAuthedUser(
  req: VercelRequest,
): Promise<{ id: string; email: string | null } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

// Returns true if the user is allowed to start a phone-upload session.
// Free users are capped at `phone_upload_limit` per calendar month; users
// with any pack credits or any paid (non-legacy) subscription get unlimited.
// On allow, atomically increments the counter via consume_phone_upload_atomic.
async function checkAndConsumePhoneUploadQuota(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  remaining?: number;
}> {
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "subscription_tier, subscription_status, is_legacy_plan, pack_credits",
    )
    .eq("id", userId)
    .single();

  if (!profile) return { allowed: false, reason: "Profile not found" };

  const tier = profile.subscription_tier || "free";
  const isLegacy = !!profile.is_legacy_plan;
  const flags = getFeatureFlags(tier, isLegacy);

  // Holders of pack credits get unlimited phone upload regardless of tier
  // (spec: "Pack ... Phone Upload works for all 15").
  if ((profile.pack_credits ?? 0) > 0) return { allowed: true };

  // null limit = unlimited (paid subscriptions, legacy plans).
  if (flags.phone_upload_limit === null) return { allowed: true };

  const limit = flags.phone_upload_limit;
  const { data, error } = await supabase.rpc("consume_phone_upload_atomic", {
    p_user_id: userId,
  });

  if (error) {
    console.error("consume_phone_upload_atomic failed:", error);
    return { allowed: false, reason: "Internal error" };
  }

  const newCount = typeof data === "number" ? data : Number(data) || 0;
  if (newCount > limit) {
    return {
      allowed: false,
      reason: `Phone upload limit reached (${limit}/month).`,
      remaining: 0,
    };
  }
  return { allowed: true, remaining: Math.max(0, limit - newCount) };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await runMiddleware(req, res, cors);

  if (req.method === "OPTIONS") return res.status(200).end();

  const user = await getAuthedUser(req);
  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.method === "GET") return handleList(req, res, user.id);
  if (req.method === "POST") {
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      return handleUpload(req, res, user.id);
    }
    return handleComplete(req, res, user.id);
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// Sessions are scoped under the user's id so one account can't poll another's
// uploads. Front-end sessionId becomes a sub-folder.
function scopedPath(userId: string, sessionId: string): string {
  return `${userId}/${sessionId}`;
}

// --- Handler: List Files (GET) ---
async function handleList(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
) {
  const { sessionId } = req.query;
  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    const root = scopedPath(userId, sessionId);
    const { data: files, error: listError } = await supabase.storage
      .from("temp-uploads")
      .list(root, {
        limit: 100,
        offset: 0,
        sortBy: { column: "created_at", order: "asc" },
      });

    if (listError) throw listError;

    if (!files || files.length === 0) {
      return res.status(200).json({ files: [] });
    }

    const fileUrls = await Promise.all(
      files.map(async (file) => {
        const path = `${root}/${file.name}`;
        const { data, error } = await supabase.storage
          .from("temp-uploads")
          .createSignedUrl(path, 3600);
        if (error) return null;
        return {
          name: file.name,
          url: data?.signedUrl,
          size: file.metadata?.size,
          type: file.metadata?.mimetype,
        };
      }),
    );

    res.status(200).json({ files: fileUrls.filter((f) => f !== null) });
  } catch (error: any) {
    console.error("List error:", error);
    res.status(500).json({ error: "Failed to list uploads" });
  }
}

// --- Handler: Upload Files (POST Multipart) ---
async function handleUpload(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
) {
  // Quota check up front so we don't burn a session for a denied user.
  const quota = await checkAndConsumePhoneUploadQuota(userId);
  if (!quota.allowed) {
    return res.status(402).json({
      error: quota.reason || "Phone upload not available on your plan.",
    });
  }

  const busboy = Busboy({ headers: req.headers });
  const fileUploads: FileUpload[] = [];
  let sessionId = "";

  busboy.on("field", (fieldname, val) => {
    if (fieldname === "sessionId") sessionId = val;
  });

  busboy.on("file", (_fieldname, file, info) => {
    const { filename, mimeType } = info;
    const chunks: Buffer[] = [];
    file.on("data", (data) => chunks.push(data));
    file.on("end", () => {
      fileUploads.push({
        buffer: Buffer.concat(chunks),
        filename,
        mimeType,
      });
    });
  });

  busboy.on("finish", async () => {
    try {
      const finalSessionId = sessionId || (req.query.sessionId as string);
      if (!finalSessionId) {
        return res.status(400).json({ error: "Missing sessionId" });
      }

      const root = scopedPath(userId, finalSessionId);
      await Promise.all(
        fileUploads.map(async (file) => {
          const uniqueSuffix = Math.random().toString(36).substring(2, 9);
          const path = `${root}/${Date.now()}-${uniqueSuffix}-${file.filename}`;
          const { error } = await supabase.storage
            .from("temp-uploads")
            .upload(path, file.buffer, {
              contentType: file.mimeType,
              upsert: false,
            });
          if (error) throw error;
        }),
      );

      res.status(200).json({
        success: true,
        count: fileUploads.length,
        remaining: quota.remaining,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload files" });
    }
  });

  req.pipe(busboy);
}

// --- Handler: Complete Session (POST JSON) ---
async function handleComplete(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
) {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    const root = scopedPath(userId, sessionId);
    const { data: files, error: listError } = await supabase.storage
      .from("temp-uploads")
      .list(root);

    if (listError) throw listError;

    if (files && files.length > 0) {
      const filesToRemove = files.map((f) => `${root}/${f.name}`);
      const { error: removeError } = await supabase.storage
        .from("temp-uploads")
        .remove(filesToRemove);
      if (removeError) throw removeError;
      console.log(
        `Cleaned up session ${sessionId}: ${files.length} files removed.`,
      );
    }

    res
      .status(200)
      .json({ success: true, message: "Session completed and cleaned up" });
  } catch (error: any) {
    console.error("Complete error:", error);
    res.status(200).json({
      success: true,
      warning: "Cleanup failed but session marked complete",
    });
  }
}
