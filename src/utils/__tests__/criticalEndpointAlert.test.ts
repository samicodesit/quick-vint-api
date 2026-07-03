import { afterEach, describe, expect, it, vi } from "vitest";
import { reportCriticalEndpointFailure } from "../../../utils/criticalEndpointAlert";

describe("critical endpoint alerts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes a structured critical endpoint marker with bounded details", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    reportCriticalEndpointFailure({
      endpoint: "/api/generate",
      status: 500,
      userId: "user_123",
      details: {
        stage: "generation",
        error: "x".repeat(600),
      },
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "CRITICAL_ENDPOINT_FAILURE",
      expect.objectContaining({
        endpoint: "/api/generate",
        status: 500,
        userId: "user_123",
        details: {
          stage: "generation",
          error: `${"x".repeat(500)}...`,
        },
      }),
    );
  });
});
