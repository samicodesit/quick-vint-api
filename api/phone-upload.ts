import type { VercelRequest, VercelResponse } from "@vercel/node";
import Busboy from "busboy";
import Cors from "cors";
import { supabase } from "../utils/supabaseClient";

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
}

interface StoredFile {
  name: string;
  path: string;
  url: string;
  size: unknown;
  type: unknown;
}

const UPLOAD_BUCKET = "temp-uploads";

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
    // Check if it's a multipart request (upload) or JSON (complete)
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      return handleUpload(req, res);
    } else {
      return handleComplete(req, res);
    }
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

    if (!files || files.length === 0) {
      return res.status(200).json({ files: [] });
    }

    const signedFiles = await Promise.all(
      files.map((file) => createStoredFileResponse(sessionId, file)),
    );

    res.status(200).json({ files: signedFiles, count: signedFiles.length });
  } catch (error: any) {
    console.error("List error:", error);
    res.status(500).json({ error: error.message });
  }
}

// --- Handler: Upload Files (POST Multipart) ---
async function handleUpload(req: VercelRequest, res: VercelResponse) {
  const busboy = Busboy({ headers: req.headers });
  const fileUploads: FileUpload[] = [];
  let sessionId = "";
  let responseSent = false;

  const sendError = (status: number, message: string) => {
    if (responseSent) return;
    responseSent = true;
    res.status(status).json({ error: message });
  };

  busboy.on("field", (fieldname, val) => {
    if (fieldname === "sessionId") {
      sessionId = val;
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

      const uploadPromises = fileUploads.map(async (file) => {
        const uniqueSuffix = Math.random().toString(36).substring(2, 9);
        const storedName = `${Date.now()}-${uniqueSuffix}-${sanitizeFilename(file.filename)}`;
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

// --- Handler: Complete Session (POST JSON) ---
async function handleComplete(req: VercelRequest, res: VercelResponse) {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    // 1. List all files in the session folder
    const { data: files, error: listError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .list(sessionId);

    if (listError) throw listError;

    // 2. If there are files, delete them
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
    console.error("Complete error:", error);
    // Even if cleanup fails, we return success to the client so they don't retry
    res.status(200).json({
      success: true,
      warning: "Cleanup failed but session marked complete",
    });
  }
}
