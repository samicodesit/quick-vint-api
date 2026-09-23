import {
  prepareMobileImage,
  revokeMobilePreview,
  type PreparedMobileImage,
} from "./imagePreparation";

const API_UPLOAD = "/api/phone-upload";
const MAX_WORKERS = 3;
const MAX_UPLOAD_ATTEMPTS = 3;

export interface MobileUploadSession {
  sessionId: string;
  uploaderId: string;
  accessToken: string;
}

export interface UploadedMobilePhoto {
  order: number;
  name: string;
  url: string;
  file?: File;
  previewUrl?: string;
  sourceType?: string;
}

export type UploadCleanupPhase = "cancelled" | "post-generation";

export class MobileUploadError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: string, message: string, status = 0, retryable = false) {
    super(message);
    this.name = "MobileUploadError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function createUuid(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid) return randomUuid.call(globalThis.crypto);
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export function createMobileUploadSession(
  accessToken: string,
): MobileUploadSession {
  if (!accessToken.trim())
    throw new MobileUploadError(
      "missing_token",
      "Sign in again to upload photos.",
    );
  return {
    sessionId: createUuid(),
    uploaderId: createUuid(),
    accessToken,
  };
}

function abortError(): MobileUploadError {
  return new MobileUploadError("aborted", "Photo upload was cancelled.");
}

function ensureNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = await response.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function request(
  session: MobileUploadSession,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  ensureNotAborted(signal);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, signal });
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw new MobileUploadError(
      "network_error",
      "We could not upload this photo.",
      0,
      true,
    );
  }
  const body = await readBody(response);
  if (!response.ok) {
    const code =
      typeof body.code === "string" ? body.code : `http_${response.status}`;
    const message =
      typeof body.error === "string" ? body.error : "Photo upload failed.";
    throw new MobileUploadError(
      code,
      message,
      response.status,
      isRetryableStatus(response.status),
    );
  }
  return body;
}

async function requestWithRetry(
  session: MobileUploadSession,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      return await request(session, url, init, signal);
    } catch (error) {
      lastError = error;
      if (
        !(error instanceof MobileUploadError) ||
        !error.retryable ||
        attempt === MAX_UPLOAD_ATTEMPTS - 1
      ) {
        throw error;
      }
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, 100 * 2 ** attempt);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            reject(abortError());
          },
          { once: true },
        );
      });
    }
  }
  throw lastError;
}

export async function openSingleUpload(
  session: MobileUploadSession,
  signal: AbortSignal,
): Promise<void> {
  await request(
    session,
    `${API_UPLOAD}?action=open&v=2&mode=single&sessionId=${encodeURIComponent(session.sessionId)}`,
    { method: "POST" },
    signal,
  );
}

export async function prepareUpload(
  session: MobileUploadSession,
  expectedCount: number,
  signal: AbortSignal,
): Promise<void> {
  await request(
    session,
    `${API_UPLOAD}?action=prepare&sessionId=${encodeURIComponent(session.sessionId)}&expectedCount=${expectedCount}&v=2&uploaderId=${encodeURIComponent(session.uploaderId)}`,
    { method: "POST" },
    signal,
  );
}

async function uploadOne(
  session: MobileUploadSession,
  prepared: PreparedMobileImage,
  order: number,
  expectedCount: number,
  signal: AbortSignal,
): Promise<void> {
  const form = new FormData();
  form.append("uploadOrder", String(order));
  form.append("file", prepared.file, prepared.file.name);
  await requestWithRetry(
    session,
    `${API_UPLOAD}?v=2&sessionId=${encodeURIComponent(session.sessionId)}&expectedCount=${expectedCount}`,
    { method: "POST", body: form },
    signal,
  );
}

async function completeUpload(
  session: MobileUploadSession,
  expectedCount: number,
  signal: AbortSignal,
): Promise<void> {
  const orders = Array.from({ length: expectedCount }, (_, order) => order);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await request(
        session,
        `${API_UPLOAD}?action=complete&sessionId=${encodeURIComponent(session.sessionId)}&expectedCount=${expectedCount}&v=2`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orders }),
        },
        signal,
      );
      return;
    } catch (error) {
      if (
        !(error instanceof MobileUploadError) ||
        ![202, 409].includes(error.status) ||
        attempt === 7
      )
        throw error;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, 250);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            reject(abortError());
          },
          { once: true },
        );
      });
    }
  }
}

async function fetchSignedPhotos(
  session: MobileUploadSession,
  expectedCount: number,
  prepared: (PreparedMobileImage | undefined)[],
  signal: AbortSignal,
): Promise<UploadedMobilePhoto[]> {
  const body = await request(
    session,
    `${API_UPLOAD}?v=2&includeUrls=1&sessionId=${encodeURIComponent(session.sessionId)}`,
    { method: "GET" },
    signal,
  );
  const files = Array.isArray(body.files) ? body.files : [];
  const byOrder = new Map<number, UploadedMobilePhoto>();
  for (const item of files) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const order = Number(record.order);
    const url = typeof record.url === "string" ? record.url : "";
    if (!Number.isInteger(order) || !url) continue;
    byOrder.set(order, {
      order,
      name:
        typeof record.name === "string" ? record.name : `photo-${order}.jpg`,
      url,
      file: prepared[order]?.file,
      previewUrl: prepared[order]?.previewUrl,
      sourceType: prepared[order]?.sourceType,
    });
  }
  const ordered = Array.from({ length: expectedCount }, (_, order) =>
    byOrder.get(order),
  );
  if (ordered.some((item) => !item)) {
    throw new MobileUploadError(
      "missing_signed_url",
      "The uploaded photos could not be prepared for generation.",
    );
  }
  return ordered as UploadedMobilePhoto[];
}

/** Uploads every selected file in its original order, with a maximum of three active uploads. */
export async function uploadSelectedPhotos(
  session: MobileUploadSession,
  selectedFiles: File[],
  signal: AbortSignal,
): Promise<UploadedMobilePhoto[]> {
  if (selectedFiles.length === 0)
    throw new MobileUploadError("no_photos", "Choose at least one photo.");
  ensureNotAborted(signal);
  let opened = false;
  let completed = false;
  const prepared: (PreparedMobileImage | undefined)[] = new Array(
    selectedFiles.length,
  );
  try {
    await openSingleUpload(session, signal);
    opened = true;
    await prepareUpload(session, selectedFiles.length, signal);

    let nextOrder = 0;
    let failure: unknown;
    const worker = async () => {
      while (failure === undefined) {
        ensureNotAborted(signal);
        const order = nextOrder;
        nextOrder += 1;
        if (order >= selectedFiles.length) return;
        try {
          const item = await prepareMobileImage(selectedFiles[order]);
          prepared[order] = item;
          await uploadOne(session, item, order, selectedFiles.length, signal);
        } catch (error) {
          failure = error;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MAX_WORKERS, selectedFiles.length) }, () =>
        worker(),
      ),
    );
    if (failure !== undefined) throw failure;
    ensureNotAborted(signal);
    await completeUpload(session, selectedFiles.length, signal);
    const result = await fetchSignedPhotos(
      session,
      selectedFiles.length,
      prepared,
      signal,
    );
    completed = true;
    return result;
  } catch (error) {
    if (
      signal.aborted ||
      (error instanceof MobileUploadError && error.code === "aborted")
    ) {
      error = abortError();
    }
    if (opened)
      await cleanupUploadSession(session, "cancelled").catch(() => undefined);
    throw error;
  } finally {
    if (!completed) {
      for (const item of prepared) revokeMobilePreview(item?.previewUrl);
    }
  }
}

export async function cleanupUploadSession(
  session: MobileUploadSession,
  phase: UploadCleanupPhase,
): Promise<void> {
  const cancellation = phase === "cancelled" ? "&reason=cancelled" : "";
  await request(
    session,
    `${API_UPLOAD}?action=cleanup&v=2${cancellation}&sessionId=${encodeURIComponent(session.sessionId)}`,
    {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    },
    new AbortController().signal,
  );
}
