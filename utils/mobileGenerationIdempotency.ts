import { createHash } from "node:crypto";
import { supabase } from "./supabaseClient";
import type {
  IdempotencyClaim,
  MobileGenerationRequestBody,
  MobileGenerationResponse,
  StoredResponseValidation,
} from "./mobileGenerationTypes";

export const IDEMPOTENCY_RESPONSE_MAX_BYTES = 32 * 1024;
export const IDEMPOTENCY_SUCCESS_TTL_MS = 15 * 60 * 1000;
export const IDEMPOTENCY_FAILURE_TTL_MS = 15 * 60 * 1000;
export const IDEMPOTENCY_RETRYABLE_FAILURE_TTL_MS = 2 * 60 * 1000;
export const IDEMPOTENCY_RETRYABLE_TTL_MS =
  IDEMPOTENCY_RETRYABLE_FAILURE_TTL_MS;

const MOBILE_CLIENT = "mobile_web";
const FAILURE_STATUS_CODES = new Set([400, 403, 429, 500, 503, 504]);
const SAFE_FAILURE_KEYS = new Set([
  "error",
  "code",
  "provider",
  "limitScope",
  "currentTier",
  "nextTier",
  "currentLimit",
  "remainingRequests",
]);
const SAFE_FAILURE_STRING_KEYS = new Set([
  "code",
  "provider",
  "limitScope",
  "currentTier",
  "nextTier",
]);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const normalized = normalizeValue(
          (value as Record<string, unknown>)[key],
        );
        if (normalized !== undefined) result[key] = normalized;
        return result;
      }, {});
  }
  return value;
}

export function normalizeMobileGenerationRequest(
  body: MobileGenerationRequestBody,
): { hash: string; imageCount: number } {
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls : [];
  const imageHashes = imageUrls.map((imageUrl) =>
    sha256(typeof imageUrl === "string" ? imageUrl.trim() : String(imageUrl)),
  );

  const normalizedFields = {
    languageCode: body.languageCode,
    titleLanguageCode: body.titleLanguageCode,
    descriptionLanguageCode: body.descriptionLanguageCode,
    tone: body.tone,
    useEmojis: body.useEmojis,
    useHashtags: body.useHashtags,
    emojiRetry: body.emojiRetry,
    useBulletPoints: body.useBulletPoints,
    descriptionLength: body.descriptionLength,
    descriptionFooterText: body.descriptionFooterText,
    generationMode: body.generationMode,
  };
  const canonical = normalizeValue({
    ...normalizedFields,
    imageHashes,
  });

  return {
    hash: sha256(JSON.stringify(canonical)),
    imageCount: imageUrls.length,
  };
}

function isMobileGenerationResponse(
  value: unknown,
): value is MobileGenerationResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.description === "string"
  );
}

export function validateStoredResponse(
  response: unknown,
): StoredResponseValidation {
  if (!isMobileGenerationResponse(response)) {
    return { ok: false, code: "invalid_response" };
  }

  const boundedResponse: MobileGenerationResponse = {
    title: response.title,
    description: response.description,
  };
  if (Object.prototype.hasOwnProperty.call(response, "measurementAdvice")) {
    boundedResponse.measurementAdvice = response.measurementAdvice;
  }
  if (Object.prototype.hasOwnProperty.call(response, "offers")) {
    boundedResponse.offers = response.offers;
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(boundedResponse);
  } catch {
    return { ok: false, code: "invalid_response" };
  }
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > IDEMPOTENCY_RESPONSE_MAX_BYTES) {
    return { ok: false, code: "response_too_large" };
  }

  return { ok: true, response: boundedResponse, serialized, bytes };
}

function sanitizeErrorMessage(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "Generation failed. Please try again.";
  }

  const withoutUrls = value
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/data:[^\s)]+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(?:for|from|at|in)\s*$/i, "")
    .trim();

  if (!withoutUrls) return "Generation failed. Please try again.";
  return withoutUrls.endsWith(".") ? withoutUrls : `${withoutUrls}.`;
}

function sanitizeUnknownValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeErrorMessage(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => sanitizeUnknownValue(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .slice(0, 16)
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sanitizeUnknownValue(
          (value as Record<string, unknown>)[key],
        );
        return result;
      }, {});
  }
  return null;
}

export function sanitizeStoredFailureBody(
  body: Record<string, unknown> | unknown,
): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Generation failed. Please try again." };
  }

  const source = body as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of SAFE_FAILURE_KEYS) {
    if (!(key in source)) continue;
    if (key === "error") {
      result[key] = sanitizeErrorMessage(source[key]);
    } else if (SAFE_FAILURE_STRING_KEYS.has(key)) {
      result[key] =
        typeof source[key] === "string" &&
        /^[A-Za-z0-9_.-]{1,64}$/.test(source[key])
          ? source[key]
          : "generation_failed";
    } else {
      result[key] = sanitizeUnknownValue(source[key]);
    }
  }

  if (typeof result.error !== "string") {
    result.error = "Generation failed. Please try again.";
  }

  try {
    if (
      Buffer.byteLength(JSON.stringify(result), "utf8") <=
      IDEMPOTENCY_RESPONSE_MAX_BYTES
    ) {
      return result;
    }
  } catch {
    // Return the generic bounded response below for non-serializable values.
  }

  return {
    error: "Generation failed. Please try again.",
    code: "generation_failed",
  };
}

function decodeClaim(data: unknown): IdempotencyClaim {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid mobile idempotency claim response");
  }
  const result = data as Record<string, unknown>;
  const kind = result.kind;

  const recordId = result.recordId ?? result.record_id ?? result.id;
  if (kind === "new" && typeof recordId === "string") {
    return { kind: "new", recordId };
  }
  if (kind === "conflict") return { kind: "conflict" };
  const requestId = result.requestId ?? result.request_id;
  if (kind === "in_progress" && typeof requestId === "string") {
    return { kind: "in_progress", requestId };
  }
  if (kind === "succeeded") {
    const response = result.response ?? result.response_json;
    const statusCode = Number(
      result.statusCode ?? result.status_code ?? result.response_status ?? 200,
    );
    if (statusCode === 200 && validateStoredResponse(response).ok) {
      return {
        kind: "succeeded",
        response: (validateStoredResponse(response) as any).response,
        statusCode: 200,
      };
    }
  }
  if (kind === "failed") {
    const statusCode = Number(
      result.statusCode ?? result.status_code ?? result.response_status,
    );
    const body = result.body ?? result.response_json;
    if (
      FAILURE_STATUS_CODES.has(statusCode) &&
      body &&
      typeof body === "object" &&
      !Array.isArray(body)
    ) {
      return {
        kind: "failed",
        statusCode: statusCode as 400 | 403 | 429 | 500 | 503 | 504,
        body: sanitizeStoredFailureBody(body),
        retryable: result.retryable === true,
      };
    }
  }

  throw new Error("Invalid mobile idempotency claim state");
}

async function callMutation(
  rpcName: string,
  params: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; code: string }> {
  try {
    const { data, error } = await supabase.rpc(rpcName, params);
    if (error) {
      console.error(`Mobile idempotency ${rpcName} failed:`, error.message);
      return { ok: false, code: "rpc_failed" };
    }
    if (
      data !== true &&
      !(data && typeof data === "object" && (data as any).ok === true)
    ) {
      return { ok: false, code: "transition_rejected" };
    }
    return { ok: true };
  } catch (error: any) {
    console.error(`Mobile idempotency ${rpcName} exception:`, error);
    return { ok: false, code: "rpc_failed" };
  }
}

export async function claimMobileGenerationIdempotency(input: {
  userId: string;
  requestId: string;
  requestHash: string;
}): Promise<IdempotencyClaim> {
  const { data, error } = await supabase.rpc(
    "claim_mobile_generation_idempotency",
    {
      p_user_id: input.userId,
      p_client: MOBILE_CLIENT,
      p_request_id: input.requestId,
      p_request_hash: input.requestHash,
    },
  );
  if (error) {
    console.error("Mobile idempotency claim failed:", error.message);
    throw new Error("Mobile idempotency claim unavailable");
  }
  return decodeClaim(data);
}

export async function completeMobileGenerationIdempotency(input: {
  recordId: string;
  response: MobileGenerationResponse;
  reservationId?: string | null;
  expiresAt?: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const validated = validateStoredResponse(input.response);
  if (!validated.ok) return validated;

  return callMutation("complete_mobile_generation_idempotency", {
    p_record_id: input.recordId,
    p_response_json: validated.response,
    p_response_status: 200,
    p_reservation_id: input.reservationId ?? null,
    p_expires_at:
      input.expiresAt ??
      new Date(Date.now() + IDEMPOTENCY_SUCCESS_TTL_MS).toISOString(),
  });
}

export async function failMobileGenerationIdempotency(input: {
  recordId: string;
  statusCode: 400 | 403 | 429 | 500 | 503 | 504;
  body: Record<string, unknown>;
  retryable: boolean;
  failureCode?: string | null;
  expiresAt?: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const sanitizedBody = sanitizeStoredFailureBody(input.body);
  const expiresAt =
    input.expiresAt ??
    new Date(
      Date.now() +
        (input.retryable
          ? IDEMPOTENCY_RETRYABLE_FAILURE_TTL_MS
          : IDEMPOTENCY_FAILURE_TTL_MS),
    ).toISOString();

  return callMutation("fail_mobile_generation_idempotency", {
    p_record_id: input.recordId,
    p_status_code: input.statusCode,
    p_body: sanitizedBody,
    p_failure_code: input.failureCode ?? null,
    p_retryable: input.retryable,
    p_expires_at: expiresAt,
  });
}

export async function markMobileGenerationCommitPending(input: {
  recordId: string;
  reservationId?: string | null;
  expiresAt?: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  return callMutation("mark_mobile_generation_commit_pending", {
    p_record_id: input.recordId,
    p_reservation_id: input.reservationId ?? null,
    p_expires_at:
      input.expiresAt ??
      new Date(Date.now() + IDEMPOTENCY_RETRYABLE_FAILURE_TTL_MS).toISOString(),
  });
}

export async function cleanupExpiredMobileGenerationIdempotency(): Promise<number> {
  const { data, error } = await supabase.rpc(
    "cleanup_expired_mobile_generation_idempotency",
  );
  if (error) {
    console.error("Mobile idempotency cleanup failed:", error.message);
    throw error;
  }
  if (typeof data === "number") return data;
  if (data && typeof data === "object") {
    const deleted = (data as { deleted?: unknown; count?: unknown }).deleted;
    const count = (data as { deleted?: unknown; count?: unknown }).count;
    if (deleted !== undefined) return Number(deleted || 0);
    if (count !== undefined) return Number(count || 0);
  }
  return Number(data || 0);
}

export const claimMobileGeneration = claimMobileGenerationIdempotency;
export const completeMobileGeneration = completeMobileGenerationIdempotency;
export const failMobileGeneration = failMobileGenerationIdempotency;
export const markCommitPending = markMobileGenerationCommitPending;
export const claimGenerationIdempotency = claimMobileGenerationIdempotency;
export const completeGenerationIdempotency =
  completeMobileGenerationIdempotency;
export const failGenerationIdempotency = failMobileGenerationIdempotency;
export const markGenerationCommitPending = markMobileGenerationCommitPending;
export const cleanupExpiredGenerationIdempotency =
  cleanupExpiredMobileGenerationIdempotency;
