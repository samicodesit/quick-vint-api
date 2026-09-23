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

  it("binds the reserved quota to the claimed attempt before model work", async () => {
    const { bindMobileGenerationReservation } =
      await import("../../../utils/mobileGenerationIdempotency.js");

    rpc.mockResolvedValueOnce({ data: true, error: null });

    await expect(
      bindMobileGenerationReservation({
        recordId: "record-1",
        attemptId: "attempt-1",
        reservationId: "reservation-1",
      }),
    ).resolves.toEqual({ ok: true });

    expect(rpc).toHaveBeenCalledWith(
      "bind_mobile_generation_reservation",
      expect.objectContaining({
        p_record_id: "record-1",
        p_attempt_id: "attempt-1",
        p_reservation_id: "reservation-1",
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

  it("requires an authoritative committed reservation before storing success", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../../migrations/2026-09-23_mobile_web_generation_idempotency.sql",
      ),
      "utf8",
    );
    const completeFunction = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.complete_mobile_generation_idempotency",
      ),
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.fail_mobile_generation_idempotency",
      ),
    );

    expect(completeFunction).toContain("r.status = 'committed'");
    expect(completeFunction).toContain(
      "FROM public.generation_reservations AS r",
    );
    expect(completeFunction).toContain("p_reservation_id");
    expect(completeFunction).not.toContain("AND NOT commit_pending");
  });

  it("stores a bounded response in commit-pending state for crash recovery", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../../migrations/2026-09-23_mobile_web_generation_idempotency.sql",
      ),
      "utf8",
    );
    const pendingFunction = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.mark_mobile_generation_commit_pending",
      ),
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.get_generation_reservation_status",
      ),
    );

    expect(pendingFunction).toContain("p_response_json jsonb");
    expect(pendingFunction).toContain("response_json = p_response_json");
    expect(pendingFunction).toContain("mobile_generation_json_is_safe");
    expect(pendingFunction).toContain("octet_length");
  });

  it("reconciles committed output and refunds stale pending reservations before reset", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../../migrations/2026-09-23_mobile_web_generation_idempotency.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.bind_mobile_generation_reservation",
    );
    expect(migration).toContain("existing_row.commit_pending");
    expect(migration).toContain("existing_row.response_json");
    expect(migration).toContain("status = 'succeeded'");
    expect(migration).toContain("refund_generation_reservation");
    expect(migration).toContain("idempotency_expired");
  });

  it("does not leave an expired commit-pending reservation stuck", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../../migrations/2026-09-23_mobile_web_generation_idempotency.sql",
      ),
      "utf8",
    );
    const claimFunction = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.claim_mobile_generation_idempotency",
      ),
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.bind_mobile_generation_reservation",
      ),
    );

    expect(claimFunction).toContain("IF reservation_status = 'pending'");
    expect(claimFunction).toContain("existing_row.expires_at <= now_utc");
    expect(claimFunction).toContain("idempotency_expired");
    expect(claimFunction).toContain("reservation_status = 'committed'");
  });

  it("guards success reconciliation to the reservation owner's attempt", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../../migrations/2026-09-23_mobile_web_generation_idempotency.sql",
      ),
      "utf8",
    );
    const completeFunction = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.complete_mobile_generation_idempotency",
      ),
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.fail_mobile_generation_idempotency",
      ),
    );

    expect(completeFunction).toContain("r.user_id = (");
    expect(completeFunction).toContain("SELECT i.user_id");
  });

  it("does not let a failure attach another user's reservation", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../../migrations/2026-09-23_mobile_web_generation_idempotency.sql",
      ),
      "utf8",
    );
    const failFunction = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.fail_mobile_generation_idempotency",
      ),
      migration.indexOf(
        "DROP FUNCTION IF EXISTS public.mark_mobile_generation_commit_pending",
      ),
    );

    expect(failFunction).toContain("p_reservation_id IS NULL");
    expect(failFunction).toContain("r.user_id = (");
    expect(failFunction).toContain("SELECT i.user_id");
  });

  it("refunds pending reservations before deleting stale idempotency rows", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../../migrations/2026-09-23_mobile_web_generation_idempotency.sql",
      ),
      "utf8",
    );
    const cleanupFunction = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.cleanup_expired_mobile_generation_idempotency",
      ),
      migration.indexOf(
        "REVOKE ALL ON FUNCTION public.claim_mobile_generation_idempotency",
      ),
    );

    expect(cleanupFunction).toContain(
      "DELETE FROM public.mobile_generation_idempotency",
    );
    expect(cleanupFunction).toContain(
      "SELECT id, reservation_id, status, commit_pending, response_json",
    );
    expect(cleanupFunction).toContain("expires_at < now() - interval '1 day'");
    expect(cleanupFunction).toContain("FOR UPDATE SKIP LOCKED");
    expect(cleanupFunction).toContain("stale_row.reservation_id IS NOT NULL");
    expect(cleanupFunction).toContain("FROM public.generation_reservations");
    expect(cleanupFunction).toContain(
      "reservation_status IS DISTINCT FROM 'refunded'",
    );
    expect(cleanupFunction).toContain("reservation_status = 'committed'");
    expect(cleanupFunction).toContain("reservation_status = 'pending'");
    expect(cleanupFunction).toContain("stale_row.status = 'in_progress'");
    expect(cleanupFunction).toContain("idempotency_expired");
    expect(cleanupFunction).not.toContain(
      "WHERE expires_at < now() - interval '1 day';",
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
