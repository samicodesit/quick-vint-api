export type MobileGenerationMode = "manual" | "phone_upload" | "batch";

export type MobileGenerationRequestBody = {
  imageUrls: string[];
  languageCode?: string;
  titleLanguageCode?: string;
  descriptionLanguageCode?: string;
  tone?: string;
  useEmojis?: boolean | string;
  useHashtags?: boolean | string;
  emojiRetry?: boolean | string;
  useBulletPoints?: boolean | string;
  descriptionLength?: string;
  descriptionFooterText?: string;
  generationMode?: MobileGenerationMode | string;
};

export type MobileGenerationResponse = {
  title: string;
  description: string;
  measurementAdvice?: unknown;
  offers?: unknown;
};

export type IdempotencyClaim =
  | { kind: "new"; recordId: string }
  | { kind: "succeeded"; response: MobileGenerationResponse; statusCode: 200 }
  | { kind: "in_progress"; requestId: string }
  | {
      kind: "failed";
      statusCode: 400 | 403 | 429 | 500 | 503 | 504;
      body: Record<string, unknown>;
      retryable: boolean;
    }
  | { kind: "conflict" };

export type StoredResponseValidation =
  | {
      ok: true;
      response: MobileGenerationResponse;
      serialized: string;
      bytes: number;
    }
  | { ok: false; code: "invalid_response" | "response_too_large" };

export type VerifiedReservationCommit =
  | { ok: true }
  | {
      ok: false;
      state: "pending" | "committed" | "refunded" | "unknown";
      error?: string;
    };
