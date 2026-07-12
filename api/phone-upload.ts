import type { VercelRequest, VercelResponse } from "@vercel/node";
import Busboy from "busboy";
import Cors from "cors";
import { supabase } from "../utils/supabaseClient";
import { reportCriticalEndpointFailure } from "../utils/criticalEndpointAlert";

// Initialize CORS middleware
const cors = Cors({
  methods: ["GET", "POST", "OPTIONS"],
  origin: true,
});

function runMiddleware(req: VercelRequest, res: VercelResponse, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
};

interface FileUpload {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  order: number | null;
}

interface StoredFile {
  name: string;
  path: string;
  url: string;
  order: number;
  size: unknown;
  type: unknown;
}

const UPLOAD_BUCKET = "temp-uploads";
const BATCH_COMPLETE_MARKER = "_batch-complete.json";

function getMetadataValue(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  if (!metadata) return undefined;
  for (const key of keys) {
    if (metadata[key] !== undefined) return metadata[key];
  }
  return undefined;
}

function sanitizeFilename(filename: string) {
  const baseName = filename.split(/[\\/]/).pop()?.trim() || "upload";
  return baseName.replace(/[^\w .()-]/g, "_");
}

function parseUploadOrder(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getStoredFileOrder(name: string) {
  return (
    parseUploadOrder(name.match(/^(\d+)-/)?.[1]) ?? Number.MAX_SAFE_INTEGER
  );
}

function isBatchMarkerFile(file: { name?: string }) {
  return file.name === BATCH_COMPLETE_MARKER;
}

function parseExpectedCount(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function createStoredFileResponse(
  sessionId: string,
  file: { name: string; metadata?: Record<string, unknown> | null },
): Promise<StoredFile> {
  const path = `${sessionId}/${file.name}`;
  const { data, error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to create signed URL for ${path}: ${error?.message || "No signed URL returned"}`,
    );
  }

  return {
    name: file.name,
    path,
    url: data.signedUrl,
    order: getStoredFileOrder(file.name),
    size: getMetadataValue(file.metadata, ["size", "contentLength"]),
    type: getMetadataValue(file.metadata, [
      "mimetype",
      "mimeType",
      "contentType",
      "content-type",
    ]),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await runMiddleware(req, res, cors);

  if (req.method === "GET") {
    return handleList(req, res);
  } else if (req.method === "POST") {
    // Check if it's a multipart request (upload) or JSON (complete/cleanup).
    // JSON POST without an action is legacy cleanup behavior.
    const contentType = req.headers["content-type"] || "";
    const action = typeof req.query.action === "string" ? req.query.action : "";
    if (contentType.includes("multipart/form-data")) {
      return handleUpload(req, res);
    } else if (action === "complete") {
      return handleComplete(req, res);
    } else if (!action || action === "cleanup") {
      return handleCleanup(req, res);
    }
    return res.status(400).json({ error: "Unknown action" });
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}

// --- Handler: List Files (GET) ---
async function handleList(req: VercelRequest, res: VercelResponse) {
  const { sessionId } = req.query;

  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    const { data: files, error: listError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .list(sessionId, {
        limit: 100,
        offset: 0,
        sortBy: { column: "created_at", order: "asc" },
      });

    if (listError) throw listError;

    const complete = Boolean(files?.some(isBatchMarkerFile));
    const photoFiles = files?.filter((file) => !isBatchMarkerFile(file)) || [];

    if (photoFiles.length === 0) {
      return res.status(200).json({ files: [], count: 0, complete });
    }

    const signedFiles = await Promise.all(
      photoFiles.map((file) => createStoredFileResponse(sessionId, file)),
    );
    signedFiles.sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    );

    res.status(200).json({
      files: signedFiles,
      count: signedFiles.length,
      complete,
    });
  } catch (error: any) {
    console.error("List error:", error);
    reportCriticalEndpointFailure({
      endpoint: "/api/phone-upload",
      status: 500,
      details: {
        action: "list",
        sessionId,
        error: error?.message || String(error),
        errorName: error?.name,
      },
    });
    res.status(500).json({ error: error.message });
  }
}

// --- Handler: Upload Files (POST Multipart) ---
async function handleUpload(req: VercelRequest, res: VercelResponse) {
  const busboy = Busboy({ headers: req.headers });
  const fileUploads: FileUpload[] = [];
  let sessionId = "";
  let uploadOrder: number | null = null;
  let responseSent = false;

  const sendError = (status: number, message: string) => {
    if (responseSent) return;
    responseSent = true;
    res.status(status).json({ error: message });
  };

  busboy.on("field", (fieldname, val) => {
    if (fieldname === "sessionId") {
      sessionId = val;
    } else if (fieldname === "uploadOrder") {
      uploadOrder = parseUploadOrder(val);
    }
  });

  busboy.on("file", (fieldname, file, info) => {
    const { filename, mimeType } = info;
    const chunks: Buffer[] = [];

    file.on("data", (data) => chunks.push(data));
    file.on("end", () => {
      fileUploads.push({
        buffer: Buffer.concat(chunks),
        filename,
        mimeType,
        order: uploadOrder,
      });
    });
  });

  busboy.on("finish", async () => {
    try {
      const finalSessionId = sessionId || (req.query.sessionId as string);

      if (!finalSessionId) {
        return sendError(400, "Missing sessionId");
      }

      if (fileUploads.length === 0) {
        return sendError(400, "No files received");
      }

      const uploadPromises = fileUploads.map(async (file, index) => {
        const uniqueSuffix = Math.random().toString(36).substring(2, 9);
        const order = file.order ?? index;
        const orderPrefix = String(order).padStart(6, "0");
        const storedName = `${orderPrefix}-${Date.now()}-${uniqueSuffix}-${sanitizeFilename(file.filename)}`;
        const path = `${finalSessionId}/${storedName}`;
        const { error } = await supabase.storage
          .from(UPLOAD_BUCKET)
          .upload(path, file.buffer, {
            contentType: file.mimeType,
            upsert: false,
          });

        if (error) throw error;

        return {
          name: storedName,
          path,
          order,
          size: file.buffer.length,
          type: file.mimeType,
        };
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      responseSent = true;
      res.status(200).json({
        success: true,
        count: uploadedFiles.length,
        expectedCount: fileUploads.length,
        files: uploadedFiles,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      reportCriticalEndpointFailure({
        endpoint: "/api/phone-upload",
        status: 500,
        details: {
          action: "upload",
          sessionId: sessionId || (req.query.sessionId as string) || null,
          fileCount: fileUploads.length,
          error: error?.message || String(error),
          errorName: error?.name,
        },
      });
      sendError(500, error.message);
    }
  });

  busboy.on("error", (error) => {
    console.error("Multipart parse error:", error);
    sendError(400, "Could not parse upload request");
  });

  req.on("error", (error) => {
    console.error("Upload request stream error:", error);
    sendError(400, "Upload request stream failed");
  });

  req.pipe(busboy);
}

// --- Handler: Complete Batch Session (POST JSON) ---
async function handleComplete(req: VercelRequest, res: VercelResponse) {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    const expectedCount = parseExpectedCount(req.query.expectedCount);
    const { data: files, error: listError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .list(sessionId, {
        limit: 100,
        offset: 0,
        sortBy: { column: "created_at", order: "asc" },
      });

    if (listError) throw listError;

    const photoFiles = (files || []).filter((file) => !isBatchMarkerFile(file));
    if (expectedCount !== null && photoFiles.length < expectedCount) {
      return res.status(202).json({
        success: false,
        complete: false,
        settling: true,
        count: photoFiles.length,
        expectedCount,
      });
    }

    const manifestFiles = photoFiles
      .map((file) => ({
        name: file.name,
        path: `${sessionId}/${file.name}`,
        order: getStoredFileOrder(file.name),
      }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

    const markerPath = `${sessionId}/${BATCH_COMPLETE_MARKER}`;
    const { error: markerError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .upload(
        markerPath,
        Buffer.from(
          JSON.stringify({
            complete: true,
            completedAt: new Date().toISOString(),
            count: manifestFiles.length,
            files: manifestFiles,
          }),
        ),
        {
          contentType: "application/json",
          upsert: true,
        },
      );

    if (markerError) throw markerError;

    res.status(200).json({
      success: true,
      complete: true,
      count: manifestFiles.length,
      files: manifestFiles,
    });
  } catch (error: any) {
    console.error("Complete error:", error);
    reportCriticalEndpointFailure({
      endpoint: "/api/phone-upload",
      status: 500,
      details: {
        action: "complete",
        sessionId,
        error: error?.message || String(error),
        errorName: error?.name,
      },
    });
    res.status(500).json({ error: error.message });
  }
}

// --- Handler: Cleanup Session (POST JSON) ---
async function handleCleanup(req: VercelRequest, res: VercelResponse) {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    const { data: files, error: listError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .list(sessionId);

    if (listError) throw listError;

    if (files && files.length > 0) {
      const filesToRemove = files.map((f) => `${sessionId}/${f.name}`);
      const { error: removeError } = await supabase.storage
        .from(UPLOAD_BUCKET)
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
    console.error("Cleanup error:", error);
    // Even if cleanup fails, we return success to the client so they don't retry
    res.status(200).json({
      success: true,
      warning: "Cleanup failed but session marked complete",
    });
  }
}
