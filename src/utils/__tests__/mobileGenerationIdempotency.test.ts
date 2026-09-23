import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const reservationSingle = vi.fn();

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    rpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: reservationSingle,
          single: reservationSingle,
        })),
      })),
    })),
  },
}));

describe("mobile generation idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hashes signed URLs without returning them and rejects an oversized stored response", async () => {
    const { normalizeMobileGenerationRequest, validateStoredResponse } =
      await import("../../../utils/mobileGenerationIdempotency.js");

    const normalized = normalizeMobileGenerationRequest({
      imageUrls: ["https://storage/signed-a"],
      titleLanguageCode: "en",
      descriptionLanguageCode: "fr",
    });

    expect(normalized.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(normalized)).not.toContain("signed-a");
    expect(
      validateStoredResponse({
        title: "x".repeat(20_000),
        description: "y".repeat(20_000),
      }),
    ).toMatchObject({ ok: false, code: "response_too_large" });
  });

  it("decodes the atomic claim and replays bounded terminal state", async () => {
    const {
      claimMobileGenerationIdempotency,
      completeMobileGenerationIdempotency,
      failMobileGenerationIdempotency,
    } = await import("../../../utils/mobileGenerationIdempotency.js");

    rpc.mockResolvedValueOnce({
      data: {
        kind: "new",
        recordId: "record-1",
        attemptId: "attempt-1",
      },
      error: null,
    });
    expect(
      await claimMobileGenerationIdempotency({
        userId: "user-1",
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        requestHash: "a".repeat(64),
      }),
    ).toEqual({
      kind: "new",
      recordId: "record-1",
      attemptId: "attempt-1",
    });

    rpc.mockResolvedValueOnce({ data: true, error: null });
    await completeMobileGenerationIdempotency({
      recordId: "record-1",
      attemptId: "attempt-1",
      response: { title: "Title", description: "Description" },
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "complete_mobile_generation_idempotency",
      expect.objectContaining({
        p_record_id: "record-1",
        p_attempt_id: "attempt-1",
        p_response_status: 200,
      }),
    );

    rpc.mockResolvedValueOnce({ data: true, error: null });
    await failMobileGenerationIdempotency({
      recordId: "record-1",
      attemptId: "attempt-1",
      statusCode: 504,
      body: { error: "The request took too long. Please try again." },
      retryable: true,
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "fail_mobile_generation_idempotency",
      expect.objectContaining({
        p_record_id: "record-1",
        p_attempt_id: "attempt-1",
        p_status_code: 504,
        p_retryable: true,
      }),
    );
  });

  it("sanitizes failure bodies before they can contain signed URLs", async () => {
    const { sanitizeStoredFailureBody } =
      await import("../../../utils/mobileGenerationIdempotency.js");

    expect(
      sanitizeStoredFailureBody({
        error:
          "Provider failed for https://storage.example/signed-secret?token=secret",
        code: "provider_error",
        nested: { secret: "do-not-store" },
      }),
    ).toEqual({
      error: "Provider failed.",
      code: "provider_error",
    });
  });

  it("bounds an oversized failure body before the RPC receives it", async () => {
    const { sanitizeStoredFailureBody } =
      await import("../../../utils/mobileGenerationIdempotency.js");

    const result = sanitizeStoredFailureBody({
      error: "x".repeat(100_000),
      code: "provider_error",
    });

    expect(
      Buffer.byteLength(JSON.stringify(result), "utf8"),
    ).toBeLessThanOrEqual(32 * 1024);
    expect(result).toMatchObject({
      error: "Generation failed. Please try again.",
      code: "generation_failed",
    });
  });

  it("guards commit-pending reconciliation and terminal transitions in SQL", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../../migrations/2026-09-23_mobile_web_generation_idempotency.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("attempt_id uuid NOT NULL");
    expect(migration).toContain("reservation_status");
    expect(migration).toContain("existing_row.commit_pending");
    expect(migration).toContain("reservation_status = 'refunded'");
    expect(migration).toContain("p_attempt_id uuid");
    expect(migration).toContain("attempt_id = p_attempt_id");
  });

  it("rejects raw URLs, data URLs, encoded payloads, and tokens in terminal RPCs", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../../migrations/2026-09-23_mobile_web_generation_idempotency.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("mobile_generation_json_is_safe");
    expect(migration).toContain("https?://");
    expect(migration).toContain("data:");
    expect(migration).toContain("base64");
    expect(migration).toContain("bearer");
    expect(migration).toContain(
      "IF NOT public.mobile_generation_json_is_safe(p_response_json)",
    );
    expect(migration).toContain(
      "IF NOT public.mobile_generation_json_is_safe(p_body)",
    );
  });

  it("verifies an uncertain reservation commit through its status read", async () => {
    const { RateLimiter } = await import("../../../utils/rateLimiter.js");

    rpc.mockResolvedValueOnce({
      data: false,
      error: { message: "commit timed out" },
    });
    reservationSingle.mockResolvedValueOnce({
      data: { status: "committed" },
      error: null,
    });

    await expect(
      RateLimiter.commitGenerationReservationVerified("reservation-1"),
    ).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenNthCalledWith(1, "commit_generation_reservation", {
      p_reservation_id: "reservation-1",
    });
    expect(reservationSingle).toHaveBeenCalledWith();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
