import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PAUSED_CODE,
  ACCOUNT_PAUSED_MESSAGE,
  buildAccountPausedResponse,
  buildClearAccountPauseUpdate,
  isAccountPaused,
} from "../accountPause";

describe("account pause helpers", () => {
  it("detects paused profiles only", () => {
    expect(isAccountPaused({ account_status: "paused" })).toBe(true);
    expect(isAccountPaused({ account_status: "active" })).toBe(false);
    expect(isAccountPaused(null)).toBe(false);
  });

  it("builds a standard paused response", () => {
    expect(
      buildAccountPausedResponse({
        account_status: "paused",
        abuse_reason: "duplicate_free_quota_abuse",
      }),
    ).toMatchObject({
      error: ACCOUNT_PAUSED_MESSAGE,
      code: ACCOUNT_PAUSED_CODE,
      reason: ACCOUNT_PAUSED_CODE,
      allowed: false,
      available: 0,
      abuseReason: "duplicate_free_quota_abuse",
    });
  });

  it("builds a safe unpause update", () => {
    expect(buildClearAccountPauseUpdate()).toEqual({
      account_status: "active",
      abuse_reason: null,
      abuse_notes: null,
      paused_at: null,
      paused_by: null,
    });
  });
});
