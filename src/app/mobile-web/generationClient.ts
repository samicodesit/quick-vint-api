import { fetchMobileJson } from "./api.js";
import type { DescriptionLength } from "./formatting.js";

export interface MobileGenerationInput {
  imageUrls: string[];
  titleLanguageCode: string;
  descriptionLanguageCode: string;
  descriptionLength: DescriptionLength;
  useBulletPoints: boolean;
  requestId?: string;
}

export interface MobileGenerationResult {
  title: string;
  description: string;
  measurementAdvice?: unknown;
  offers?: unknown;
}

export interface MobileUsage {
  plan?: {
    tier?: string;
    status?: string;
    isPaid?: boolean;
  };
  limits?: Record<string, unknown>;
  remaining?: Record<string, unknown>;
  resetsAt?: Record<string, unknown>;
  canGenerate?: boolean;
  pricing?: Record<string, unknown>;
  [key: string]: unknown;
}

function createRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }
  throw new Error("generation_request_id_unavailable");
}

export function createMobileGenerationRequestId(): string {
  return createRequestId();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseGenerationResponse(value: unknown): MobileGenerationResult {
  if (!isRecord(value)) throw new Error("generation_invalid_response");
  if (typeof value.title !== "string" || !value.title.trim())
    throw new Error("generation_invalid_response");
  if (typeof value.description !== "string" || !value.description.trim())
    throw new Error("generation_invalid_response");
  return {
    title: value.title,
    description: value.description,
    ...(Object.prototype.hasOwnProperty.call(value, "measurementAdvice")
      ? { measurementAdvice: value.measurementAdvice }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(value, "offers")
      ? { offers: value.offers }
      : {}),
  };
}

export async function loadUsage(): Promise<MobileUsage> {
  return fetchMobileJson<MobileUsage>(
    "/api/user/usage",
    { method: "GET" },
    { retryOn401: true },
  );
}

export async function generateListing(
  input: MobileGenerationInput,
): Promise<MobileGenerationResult> {
  const requestId = input.requestId?.trim() || createRequestId();
  const body = {
    imageUrls: input.imageUrls,
    titleLanguageCode: input.titleLanguageCode,
    descriptionLanguageCode: input.descriptionLanguageCode,
    descriptionLength: input.descriptionLength,
    useBulletPoints: input.useBulletPoints,
    generationMode: "manual" as const,
  };

  const response = await fetchMobileJson<unknown>(
    "/api/generate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Autolister-Client": "mobile_web",
        "X-Autolister-Request-Id": requestId,
      },
      body: JSON.stringify(body),
    },
    { retryOn401: true },
  );

  return parseGenerationResponse(response);
}
