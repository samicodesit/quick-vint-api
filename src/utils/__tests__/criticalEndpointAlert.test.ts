import { afterEach, describe, expect, it, vi } from "vitest";
import { reportCriticalEndpointFailure } from "../../../utils/criticalEndpointAlert";
import { getSentry } from "../../../utils/sentry";

vi.mock("../../../utils/sentry", () => ({
  getSentry: vi.fn(),
}));

describe("critical endpoint alerts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getSentry).mockReset();
  });

  it("writes a structured critical endpoint marker with bounded details", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(getSentry).mockReturnValue(null);

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
    expect(getSentry).toHaveBeenCalledOnce();
  });

  it("sends critical failures to Sentry with endpoint tags and bounded context", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const scope = {
      setLevel: vi.fn(),
      setTag: vi.fn(),
      setUser: vi.fn(),
      setContext: vi.fn(),
    };
    const sentry = {
      withScope: vi.fn((callback) => callback(scope)),
      captureException: vi.fn(),
    };
    vi.mocked(getSentry).mockReturnValue(sentry as any);

    reportCriticalEndpointFailure({
      endpoint: "/api/stripe/create-checkout",
      status: 500,
      userId: "user_456",
      details: {
        tier: "pro",
        error: "y".repeat(600),
      },
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "CRITICAL_ENDPOINT_FAILURE",
      expect.objectContaining({
        endpoint: "/api/stripe/create-checkout",
      }),
    );
    expect(sentry.withScope).toHaveBeenCalledOnce();
    expect(scope.setLevel).toHaveBeenCalledWith("error");
    expect(scope.setTag).toHaveBeenCalledWith("critical_endpoint", "true");
    expect(scope.setTag).toHaveBeenCalledWith(
      "endpoint",
      "/api/stripe/create-checkout",
    );
    expect(scope.setTag).toHaveBeenCalledWith("status", "500");
    expect(scope.setUser).toHaveBeenCalledWith({ id: "user_456" });
    expect(scope.setContext).toHaveBeenCalledWith("critical_endpoint_failure", {
      endpoint: "/api/stripe/create-checkout",
      status: 500,
      details: {
        tier: "pro",
        error: `${"y".repeat(500)}...`,
      },
    });
    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Critical endpoint failure: /api/stripe/create-checkout",
      }),
    );
  });
});
