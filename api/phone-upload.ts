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
  tooLarge: boolean;
}

interface StoredFileMetadata {
  name: string;
  path: string;
  order: number;
  size: unknown;
  type: unknown;
}

interface StoredFile extends StoredFileMetadata {
  url: string;
}

const UPLOAD_BUCKET = "temp-uploads";
const BATCH_COMPLETE_MARKER = "_batch-complete.json";
const EXPECTED_COUNT_MARKER_PREFIX = "_expected-count-";
const EXPECTED_COUNT_MARKER_PATTERN = /^_expected-count-(\d+)\.json$/;
const SESSION_MARKER = "_session.json";
const UPLOADER_MARKER = "_uploader.json";
const V2_SESSION_IDLE_MS = 60 * 60 * 1000;
const V2_SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_V2_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_V2_UPLOAD_COUNT = 500;
const V2_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
]);
const V2_SESSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type V2SessionMarker = {
  v: 2;
  ownerId: string;
  mode: "single" | "batch";
  source: "phone";
  status: "open" | "uploading" | "complete" | "cancelled" | "expired";
  expectedCount: number | null;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
};

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

function parseUploadOrder(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getStoredFileOrder(name: string) {
  return (
    parseUploadOrder(name.match(/^(\d+)-/)?.[1]) ?? Number.MAX_SAFE_INTEGER
  );
}

function getUploadStoredName(order: number) {
  return `${String(order).padStart(6, "0")}-upload.jpg`;
}

function isBatchMarkerFile(file: { name?: string }) {
  return file.name === BATCH_COMPLETE_MARKER;
}

function isExpectedCountMarkerFile(file: { name?: string }) {
  return Boolean(file.name?.match(EXPECTED_COUNT_MARKER_PATTERN));
}

function isSessionMarkerFile(file: { name?: string }) {
  return (
    file.name === SESSION_MARKER ||
    file.name === UPLOADER_MARKER ||
    isBatchMarkerFile(file) ||
    isExpectedCountMarkerFile(file)
  );
}

function getExpectedCountFromFiles(
  files: { name?: string }[] | null | undefined,
) {
  const counts = (files || [])
    .map((file) =>
      parseExpectedCount(file.name?.match(EXPECTED_COUNT_MARKER_PATTERN)?.[1]),
    )
    .filter((count): count is number => count !== null);
  return counts.length ? Math.max(...counts) : null;
}

function parseExpectedCount(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function listSessionFiles(sessionId: string) {
  const limit = 100;
  const files = [];
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .list(sessionId, {
        limit,
        offset,
        sortBy: { column: "created_at", order: "asc" },
      });

    if (error) throw error;
    files.push(...(data || []));
    if (!data || data.length < limit) return files;
  }
}

async function readV2Session(sessionId: string) {
  const { data, error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .download(`${sessionId}/${SESSION_MARKER}`);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as V2SessionMarker;
  } catch {
    return null;
  }
}

async function readV2Uploader(sessionId: string) {
  const { data, error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .download(`${sessionId}/${UPLOADER_MARKER}`);
  if (error || !data) return null;
  try {
    return String(JSON.parse(await data.text())?.uploaderId || "");
  } catch {
    return null;
  }
}

async function acquireV2Uploader(sessionId: string, uploaderId: string) {
  const { error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(
      `${sessionId}/${UPLOADER_MARKER}`,
      Buffer.from(
        JSON.stringify({ uploaderId, createdAt: new Date().toISOString() }),
      ),
      { contentType: "application/json", upsert: false },
    );
  if (!error) return true;

  const existingUploaderId = await readV2Uploader(sessionId);
  if (existingUploaderId) return existingUploaderId === uploaderId;
  throw error;
}

async function writeV2Session(sessionId: string, marker: V2SessionMarker) {
  const { error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(
      `${sessionId}/${SESSION_MARKER}`,
      Buffer.from(JSON.stringify(marker)),
      { contentType: "application/json", upsert: true },
    );
  if (error) throw error;
}

async function writeExpectedCountMarker(
  sessionId: string,
  expectedCount: number,
) {
  const { error } = await supabase.storage.from(UPLOAD_BUCKET).upload(
    `${sessionId}/${EXPECTED_COUNT_MARKER_PREFIX}${expectedCount}.json`,
    Buffer.from(
      JSON.stringify({
        expectedCount,
        updatedAt: new Date().toISOString(),
      }),
    ),
    { contentType: "application/json", upsert: true },
  );
  if (error) throw error;
}

async function removeV2SessionFiles(sessionId: string) {
  const files = await listSessionFiles(sessionId);
  const paths = files.map((file) => `${sessionId}/${file.name}`);
  if (!paths.length) return;
  const { error } = await supabase.storage.from(UPLOAD_BUCKET).remove(paths);
  if (error) throw error;
}

async function markV2SessionTerminal(
  sessionId: string,
  marker: V2SessionMarker,
  status: "expired" | "cancelled",
) {
  const now = new Date();
  marker.status = status;
  marker.expectedCount = null;
  marker.lastActivityAt = now.toISOString();
  await removeV2SessionFiles(sessionId);
  return marker;
}

async function expireV2SessionIfNeeded(
  sessionId: string,
  marker: V2SessionMarker | null,
) {
  if (
    marker &&
    marker.status !== "expired" &&
    marker.status !== "cancelled" &&
    Date.parse(marker.expiresAt) <= Date.now()
  ) {
    try {
      return await markV2SessionTerminal(sessionId, marker, "expired");
    } catch (error) {
      console.error("Expired session cleanup failed:", error);
      marker.status = "expired";
      marker.expectedCount = null;
      return marker;
    }
  }
  return marker;
}

function createStoredFileMetadata(
  sessionId: string,
  file: { name: string; metadata?: Record<string, unknown> | null },
): StoredFileMetadata {
  const path = `${sessionId}/${file.name}`;

  return {
    name: file.name,
    path,
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

async function createStoredFileResponse(
  sessionId: string,
  file: { name: string; metadata?: Record<string, unknown> | null },
  ttlSeconds = 3600,
): Promise<StoredFile> {
  const storedFile = createStoredFileMetadata(sessionId, file);
  const { data, error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .createSignedUrl(storedFile.path, ttlSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to create signed URL for ${storedFile.path}: ${error?.message || "No signed URL returned"}`,
    );
  }

  return {
    ...storedFile,
    url: data.signedUrl,
  };
}

async function createStoredFileResponses(
  sessionId: string,
  files: { name: string; metadata?: Record<string, unknown> | null }[],
  ttlSeconds: number,
): Promise<StoredFile[]> {
  const storedFiles = files.map((file) =>
    createStoredFileMetadata(sessionId, file),
  );
  const { data, error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .createSignedUrls(
      storedFiles.map((file) => file.path),
      ttlSeconds,
    );

  if (error || !data) throw error || new Error("No signed URLs returned");
  const signedByPath = new Map(data.map((file) => [file.path, file]));

  return storedFiles.map((file) => {
    const signed = signedByPath.get(file.path);
    if (signed?.error || !signed?.signedUrl) {
      throw new Error(`Failed to create signed URL for ${file.path}`);
    }
    return { ...file, url: signed.signedUrl };
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await runMiddleware(req, res, cors);

  if (req.method === "GET") {
    if (req.query.action === "status" && req.query.v === "2") {
      return handleV2Status(req, res);
    }
    return handleList(req, res);
  } else if (req.method === "POST") {
    // Check if it's a multipart request (upload) or JSON (complete/cleanup).
    // JSON POST without an action is legacy cleanup behavior.
    const contentType = req.headers["content-type"] || "";
    const action = typeof req.query.action === "string" ? req.query.action : "";
    if (contentType.includes("multipart/form-data")) {
      return handleUpload(req, res);
    } else if (action === "open" && req.query.v === "2") {
      return handleOpenV2(req, res);
    } else if (action === "prepare") {
      return handlePrepare(req, res);
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

async function handleV2Status(req: VercelRequest, res: VercelResponse) {
  const sessionId = String(req.query.sessionId || "");
  if (!V2_SESSION_ID.test(sessionId)) {
    return res.status(400).json({ error: "Invalid v2 upload session" });
  }

  const marker = await expireV2SessionIfNeeded(
    sessionId,
    await readV2Session(sessionId),
  );
  if (!marker || marker.status === "expired" || marker.status === "cancelled") {
    return res.status(410).json({
      v: 2,
      status: marker?.status || "expired",
      complete: false,
      expectedCount: null,
    });
  }

  return res.status(200).json({
    v: 2,
    status: marker.status,
    complete: marker.status === "complete",
    expectedCount: marker.expectedCount,
  });
}

async function handleOpenV2(req: VercelRequest, res: VercelResponse) {
  const sessionId = String(req.query.sessionId || "");
  const mode = req.query.mode;
  if (
    !V2_SESSION_ID.test(sessionId) ||
    (mode !== "single" && mode !== "batch")
  ) {
    return res.status(400).json({ error: "Invalid v2 upload session" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization" });
  }
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(authHeader.slice("Bearer ".length));
  if (userError || !user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const now = new Date();
  const marker: V2SessionMarker = {
    v: 2,
    ownerId: user.id,
    mode,
    source: "phone",
    status: "open",
    expectedCount: null,
    createdAt: now.toISOString(),
    lastActivityAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + V2_SESSION_IDLE_MS).toISOString(),
  };
  const { error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(
      `${sessionId}/${SESSION_MARKER}`,
      Buffer.from(JSON.stringify(marker)),
      { contentType: "application/json", upsert: false },
    );
  if (error) {
    return res.status(409).json({ error: "Upload session already exists" });
  }
  return res.status(201).json({
    success: true,
    v: 2,
    status: marker.status,
    sessionId,
  });
}

// --- Handler: List Files (GET) ---
async function handleList(req: VercelRequest, res: VercelResponse) {
  const { sessionId } = req.query;

  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    const includeUrls = req.query.v === "2" && req.query.includeUrls === "1";
    const fromOrder = includeUrls
      ? parseUploadOrder(req.query.fromOrder ?? 0)
      : 0;
    if (includeUrls && fromOrder === null) {
      return res.status(400).json({ error: "Invalid fromOrder" });
    }
    let v2Marker = req.query.v === "2" ? await readV2Session(sessionId) : null;
    v2Marker = await expireV2SessionIfNeeded(sessionId, v2Marker);
    if (req.query.v === "2" && !v2Marker) {
      return res.status(410).json({
        success: false,
        v: 2,
        status: "expired",
        complete: false,
      });
    }
    if (
      v2Marker &&
      (v2Marker.status === "expired" || v2Marker.status === "cancelled")
    ) {
      return res.status(410).json({
        success: false,
        v: 2,
        status: v2Marker.status,
        complete: false,
      });
    }
    const files = await listSessionFiles(sessionId);

    const hasCompleteMarker = Boolean(files?.some(isBatchMarkerFile));
    const complete = v2Marker
      ? v2Marker.status === "complete" || hasCompleteMarker
      : hasCompleteMarker;
    const status = v2Marker ? (complete ? "complete" : v2Marker.status) : null;
    const expectedCount =
      Math.max(
        v2Marker?.expectedCount ?? 0,
        getExpectedCountFromFiles(files) ?? 0,
      ) || null;
    const photoFiles =
      files?.filter((file) => !isSessionMarkerFile(file)) || [];

    if (photoFiles.length === 0) {
      return res.status(200).json({
        ...(v2Marker ? { v: 2, status } : {}),
        files: [],
        count: 0,
        expectedCount,
        complete,
      });
    }

    const responsePhotoFiles = includeUrls
      ? photoFiles.filter(
          (file) => getStoredFileOrder(file.name) >= (fromOrder || 0),
        )
      : photoFiles;
    const signedFiles = v2Marker
      ? complete || includeUrls
        ? await createStoredFileResponses(
            sessionId,
            responsePhotoFiles,
            V2_SIGNED_URL_TTL_SECONDS,
          )
        : responsePhotoFiles.map((file) =>
            createStoredFileMetadata(sessionId, file),
          )
      : await Promise.all(
          photoFiles.map((file) =>
            createStoredFileResponse(sessionId, file, 3600),
          ),
        );
    signedFiles.sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    );

    res.status(200).json({
      ...(v2Marker ? { v: 2, status } : {}),
      files: signedFiles,
      count: photoFiles.length,
      expectedCount,
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
  const isV2 = req.query.v === "2";
  const requestedSessionId = String(req.query.sessionId || "");
  const requestedExpectedCount = isV2
    ? parseExpectedCount(req.query.expectedCount)
    : null;
  let v2Marker: V2SessionMarker | null = null;
  if (isV2) {
    if (!V2_SESSION_ID.test(requestedSessionId)) {
      return res.status(400).json({ error: "Invalid v2 upload session" });
    }
    if (
      req.query.expectedCount !== undefined &&
      (!requestedExpectedCount || requestedExpectedCount > MAX_V2_UPLOAD_COUNT)
    ) {
      return res.status(400).json({ error: "Invalid expectedCount" });
    }
    v2Marker = await expireV2SessionIfNeeded(
      requestedSessionId,
      await readV2Session(requestedSessionId),
    );
    if (
      !v2Marker ||
      v2Marker.status === "expired" ||
      v2Marker.status === "cancelled"
    ) {
      return res.status(410).json({
        success: false,
        v: 2,
        status: v2Marker?.status || "expired",
      });
    }
    if (v2Marker.status === "complete") {
      return res.status(409).json({
        success: false,
        v: 2,
        status: "complete",
      });
    }
  }

  const busboy = Busboy({
    headers: req.headers,
    ...(isV2 ? { limits: { files: 1, fileSize: MAX_V2_UPLOAD_BYTES } } : {}),
  });
  const fileUploads: FileUpload[] = [];
  let sessionId = "";
  let uploadOrder: number | null = null;
  let fileLimitReached = false;
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
    let tooLarge = false;

    file.on("data", (data) => chunks.push(data));
    file.on("limit", () => {
      tooLarge = true;
    });
    file.on("end", () => {
      fileUploads.push({
        buffer: Buffer.concat(chunks),
        filename,
        mimeType,
        order: uploadOrder,
        tooLarge,
      });
    });
  });
  busboy.on("filesLimit", () => {
    fileLimitReached = true;
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

      if (isV2) {
        if (fileLimitReached || fileUploads.length !== 1) {
          return sendError(400, "Upload one photo per request");
        }
        const [file] = fileUploads;
        if (file.tooLarge || file.buffer.length > MAX_V2_UPLOAD_BYTES) {
          return sendError(413, "Photo is too large after compression");
        }
        if (!V2_IMAGE_TYPES.has(file.mimeType)) {
          return sendError(415, "Unsupported photo type");
        }
        if (
          file.order === null ||
          !v2Marker ||
          file.order >= (requestedExpectedCount ?? MAX_V2_UPLOAD_COUNT)
        ) {
          return sendError(400, "Invalid upload order");
        }
      }

      const uploadPromises = fileUploads.map(async (file, index) => {
        const order =
          file.order === null
            ? index
            : fileUploads.length > 1
              ? file.order + index
              : file.order;
        const storedName = getUploadStoredName(order);
        const path = `${finalSessionId}/${storedName}`;
        const { error } = await supabase.storage
          .from(UPLOAD_BUCKET)
          .upload(path, file.buffer, {
            contentType: file.mimeType,
            upsert: true,
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
        ...(isV2 ? { v: 2, status: "uploading" } : {}),
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

// --- Handler: Prepare Session (POST JSON) ---
async function handlePrepare(req: VercelRequest, res: VercelResponse) {
  const sessionId = req.query.sessionId as string;
  const expectedCount = parseExpectedCount(req.query.expectedCount);
  const uploaderId = String(req.query.uploaderId || "");

  if (req.query.v === "2") {
    if (!V2_SESSION_ID.test(sessionId || "")) {
      return res.status(400).json({ error: "Invalid v2 upload session" });
    }
    if (!expectedCount || expectedCount > MAX_V2_UPLOAD_COUNT) {
      return res.status(400).json({ error: "Invalid expectedCount" });
    }
    if (uploaderId && !V2_SESSION_ID.test(uploaderId)) {
      return res.status(400).json({ error: "Invalid uploaderId" });
    }
    const marker = await expireV2SessionIfNeeded(
      sessionId,
      await readV2Session(sessionId),
    );
    if (
      !marker ||
      marker.status === "expired" ||
      marker.status === "cancelled"
    ) {
      return res.status(410).json({
        success: false,
        v: 2,
        status: marker?.status || "expired",
      });
    }
    if (marker.status === "complete") {
      return res.status(409).json({
        success: false,
        v: 2,
        status: marker.status,
        expectedCount: marker.expectedCount,
      });
    }
    if (uploaderId && !(await acquireV2Uploader(sessionId, uploaderId))) {
      return res.status(409).json({
        success: false,
        v: 2,
        status: marker.status,
        error: "This upload is already open in another tab.",
      });
    }
    if (
      marker.expectedCount !== null &&
      (expectedCount < marker.expectedCount ||
        (expectedCount > marker.expectedCount && !uploaderId))
    ) {
      return res.status(409).json({
        success: false,
        v: 2,
        status: marker.status,
        expectedCount: marker.expectedCount,
      });
    }
    if (marker.expectedCount === null || expectedCount > marker.expectedCount) {
      const now = new Date();
      marker.status = "uploading";
      marker.expectedCount = expectedCount;
      marker.lastActivityAt = now.toISOString();
      marker.expiresAt = new Date(
        now.getTime() + V2_SESSION_IDLE_MS,
      ).toISOString();
      await writeV2Session(sessionId, marker);
    }
    await writeExpectedCountMarker(sessionId, expectedCount);
    return res.status(200).json({
      success: true,
      v: 2,
      status: "uploading",
      expectedCount,
    });
  }

  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  if (!expectedCount || expectedCount <= 0) {
    return res.status(400).json({ error: "Missing expectedCount" });
  }

  try {
    await writeExpectedCountMarker(sessionId, expectedCount);

    res.status(200).json({ success: true, expectedCount });
  } catch (error: any) {
    console.error("Prepare error:", error);
    reportCriticalEndpointFailure({
      endpoint: "/api/phone-upload",
      status: 500,
      details: {
        action: "prepare",
        sessionId,
        expectedCount,
        error: error?.message || String(error),
        errorName: error?.name,
      },
    });
    res.status(500).json({ error: error.message });
  }
}

// --- Handler: Complete Batch Session (POST JSON) ---
async function handleComplete(req: VercelRequest, res: VercelResponse) {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    const expectedCount = parseExpectedCount(req.query.expectedCount);
    const files = await listSessionFiles(sessionId);

    const photoFiles = (files || []).filter(
      (file) => !isSessionMarkerFile(file),
    );
    if (req.query.v === "2") {
      if (expectedCount === null) {
        return res.status(400).json({ error: "Invalid expectedCount" });
      }
      const marker = await expireV2SessionIfNeeded(
        sessionId,
        await readV2Session(sessionId),
      );
      if (
        !marker ||
        marker.status === "expired" ||
        marker.status === "cancelled"
      ) {
        return res.status(410).json({
          success: false,
          v: 2,
          status: marker?.status || "expired",
        });
      }
      if (
        marker.status === "complete" ||
        (marker.expectedCount !== null &&
          marker.expectedCount !== expectedCount)
      ) {
        return res.status(409).json({
          success: false,
          complete: marker.status === "complete",
          v: 2,
          status: marker.status,
          expectedCount: marker.expectedCount,
        });
      }
      if (photoFiles.length > expectedCount) {
        return res.status(409).json({
          success: false,
          complete: false,
          v: 2,
          status: marker.status,
          count: photoFiles.length,
          expectedCount,
        });
      }
    }
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
    if (expectedCount !== null) {
      const expectedMarkerPath = `${sessionId}/${EXPECTED_COUNT_MARKER_PREFIX}${expectedCount}.json`;
      const { error: expectedMarkerError } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .upload(
          expectedMarkerPath,
          Buffer.from(
            JSON.stringify({
              expectedCount,
              updatedAt: new Date().toISOString(),
            }),
          ),
          {
            contentType: "application/json",
            upsert: true,
          },
        );

      if (expectedMarkerError) throw expectedMarkerError;
    }

    const { error: markerError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .upload(
        markerPath,
        Buffer.from(
          JSON.stringify({
            complete: true,
            completedAt: new Date().toISOString(),
            count: manifestFiles.length,
            expectedCount,
            files: manifestFiles,
          }),
        ),
        {
          contentType: "application/json",
          upsert: true,
        },
      );

    if (markerError) throw markerError;

    if (req.query.v === "2") {
      const sessionMarker = await readV2Session(sessionId);
      if (!sessionMarker) {
        throw new Error("Upload session marker disappeared");
      }
      sessionMarker.status = "complete";
      sessionMarker.expectedCount = expectedCount;
      sessionMarker.lastActivityAt = new Date().toISOString();
      await writeV2Session(sessionId, sessionMarker);
    }

    res.status(200).json({
      success: true,
      ...(req.query.v === "2" ? { v: 2, status: "complete" } : {}),
      complete: true,
      count: manifestFiles.length,
      expectedCount,
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
    if (req.query.v === "2" && req.query.reason === "cancelled") {
      const marker = await readV2Session(sessionId);
      if (!marker) {
        return res.status(200).json({ success: true, status: "cancelled" });
      }
      await markV2SessionTerminal(sessionId, marker, "cancelled");
      return res.status(200).json({ success: true, v: 2, status: "cancelled" });
    }

    const files = await listSessionFiles(sessionId);

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
    res.status(500).json({
      success: false,
      error: "Could not clean up upload session",
    });
  }
}
