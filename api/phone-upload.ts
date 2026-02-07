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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await runMiddleware(req, res, cors);

  if (req.method === "GET") {
    return handleList(req, res);
  } else if (req.method === "POST") {
    // Check specific actions via query param first
    if (req.query.action === "group") {
      return handleGroup(req, res);
    }

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
      .from("temp-uploads")
      .list(sessionId, {
        limit: 100,
        offset: 0,
        sortBy: { column: "created_at", order: "asc" },
      });

    if (listError) throw listError;

    if (!files || files.length === 0) {
      return res.status(200).json({ files: [] });
    }

    // FILTER: Exclude files that are currently in "staging_"
    // This allows the Multi-Mode to upload photos without triggering the extension immediately.
    const readyFiles = files.filter((f) => !f.name.startsWith("staging_"));

    const fileUrls = await Promise.all(
      readyFiles.map(async (file) => {
        const path = `${sessionId}/${file.name}`;
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

    const validFiles = fileUrls.filter((f) => f !== null);
    res.status(200).json({ files: validFiles });
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
  let stage = ""; // 'staging' or empty

  busboy.on("field", (fieldname, val) => {
    if (fieldname === "sessionId") {
      sessionId = val;
    }
    if (fieldname === "stage") {
      stage = val;
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
        return res.status(400).json({ error: "Missing sessionId" });
      }

      const uploadedNames: string[] = [];

      const uploadPromises = fileUploads.map(async (file) => {
        // If staged, prefix the filename. Extension ignores "staging_" files.
        const prefix = stage === "staging" ? "staging_" : "";
        const uniqueSuffix = Math.random().toString(36).substring(2, 9);
        const finalName = `${prefix}${Date.now()}-${uniqueSuffix}-${file.filename}`;

        const path = `${finalSessionId}/${finalName}`;

        uploadedNames.push(finalName);

        const { error } = await supabase.storage
          .from("temp-uploads")
          .upload(path, file.buffer, {
            contentType: file.mimeType,
            upsert: false,
          });

        if (error) throw error;
      });

      await Promise.all(uploadPromises);

      // Return the generated filename so client can track it for later grouping
      res
        .status(200)
        .json({
          success: true,
          count: fileUploads.length,
          filename: uploadedNames[0],
        });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  req.pipe(busboy);
}

// --- Handler: Group Items (POST JSON) ---
async function handleGroup(req: VercelRequest, res: VercelResponse) {
  // Need to read body manually because bodyParser is false for this route
  const buffers: Buffer[] = [];
  req.on("data", (chunk) => buffers.push(chunk));
  req.on("end", async () => {
    try {
      const bodyStr = Buffer.concat(buffers).toString();
      if (!bodyStr) return res.status(400).json({ error: "Missing body" });

      const body = JSON.parse(bodyStr);
      const { sessionId, files } = body;

      if (!sessionId || !files || !Array.isArray(files)) {
        return res.status(400).json({ error: "Invalid parameters" });
      }

      // Create a unique Item ID (timestamp)
      const itemId = Date.now();

      // Move/Rename files from "staging_X" to "item_ID_X"
      // Supabase move requires full paths
      const movePromises = files.map(
        async (fileName: string, index: number) => {
          const fromPath = `${sessionId}/${fileName}`;
          // Remove 'staging_' prefix if present for clean final name
          const cleanName = fileName.replace("staging_", "");
          const toPath = `${sessionId}/item_${itemId}_${index}_${cleanName}`;

          const { error } = await supabase.storage
            .from("temp-uploads")
            .move(fromPath, toPath);

          if (error) {
            console.error(`Failed to move ${fileName}`, error);
            // Continue even if one fails? Or throw?
            // For MVP, we log and continue.
          }
        },
      );

      await Promise.all(movePromises);

      res.status(200).json({ success: true, message: "Grouped" });
    } catch (error: any) {
      console.error("Group error:", error);
      res.status(500).json({ error: error.message });
    }
  });
}

// --- Handler: Complete Session (POST JSON) ---
async function handleComplete(req: VercelRequest, res: VercelResponse) {
  // Need to handle body parsing for 'complete' if it sends JSON,
  // but usually it's just a query trigger or empty POST.
  // However, since bodyParser is false, if we need body we must parse it.
  // Existing code didn't read body, so we leave as is.

  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    // 1. List all files in the session folder
    const { data: files, error: listError } = await supabase.storage
      .from("temp-uploads")
      .list(sessionId);

    if (listError) throw listError;

    // 2. If there are files, delete them
    if (files && files.length > 0) {
      const filesToRemove = files.map((f) => `${sessionId}/${f.name}`);
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
    // Even if cleanup fails, we return success to the client so they don't retry
    res.status(200).json({
      success: true,
      warning: "Cleanup failed but session marked complete",
    });
  }
}
