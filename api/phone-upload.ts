import type { VercelRequest, VercelResponse } from "@vercel/node";
import Busboy from "busboy";
import Cors from "cors";
import { supabase } from "../utils/supabaseClient";

const cors = Cors({
  methods: ["GET", "POST", "OPTIONS"],
  origin: true,
  allowedHeaders: ["Content-Type"],
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await runMiddleware(req, res, cors);

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") return handleList(req, res);
  if (req.method === "POST") {
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      return handleUpload(req, res);
    }
    return handleComplete(req, res);
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// --- Handler: List Files (GET) ---
async function handleList(req: VercelRequest, res: VercelResponse) {
  const { sessionId } = req.query;
  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    const root = sessionId;
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
async function handleUpload(req: VercelRequest, res: VercelResponse) {
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

      if (fileUploads.length === 0) {
        return res.status(400).json({ error: "No files provided" });
      }

      const root = finalSessionId;
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
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload files" });
    }
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
    const root = sessionId;
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
