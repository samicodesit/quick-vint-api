import { describe, expect, it } from "vitest";
import { generationOutcome } from "../generationOutcome.js";

describe("generation recovery evidence", () => {
  it("reports exact-operation recovery and never treats another result as recovery", () => {
    expect(
      generationOutcome("network_error", "a", {
        operation_id: "a",
        operation_state: "succeeded",
      }),
    ).toBe("generation_recovered");
    expect(
      generationOutcome("network_error", "a", {
        operation_id: "b",
        operation_state: "succeeded",
      }),
    ).toBe("generation_recovery_pending");
  });
  it.each([
    "free_lifetime_limit",
    "daily_limit",
    "monthly_limit",
    "account_paused",
    "payment_required",
  ])("distinguishes expected block %s", (code) => {
    expect(generationOutcome(code, "a", null)).toBe("generation_blocked");
  });
  it("preserves confirmed failures and unresolved recovery separately", () => {
    expect(
      generationOutcome("provider_error", "a", {
        operation_id: "a",
        operation_state: "failed",
      }),
    ).toBe("generation_error");
    expect(generationOutcome("network_error", "a", null)).toBe(
      "generation_recovery_pending",
    );
    expect(
      generationOutcome(undefined, "a", {
        operation_id: "a",
        operation_state: "running",
      }),
    ).toBe("generation_recovery_pending");
  });
});
