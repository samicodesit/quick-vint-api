import { afterEach, describe, expect, it, vi } from "vitest";
import { reportCriticalEndpointFailure } from "../../../utils/criticalEndpointAlert";
import { recordServerIncident } from "../../../utils/incidents/service";

vi.mock("../../../utils/incidents/service", () => ({
  recordServerIncident: vi.fn(async () => "issue-1"),
  continueIncidentWork: (work: Promise<unknown>) => {
    void work.catch(() => {});
  },
}));

describe("critical endpoint incident consolidation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(recordServerIncident).mockClear();
  });
  it("preserves the original exception and strips private diagnostic context", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new TypeError("photo transfer failed");
    reportCriticalEndpointFailure({
      endpoint: "/api/phone-upload",
      status: 500,
      error,
      details: {
        stage: "uploading",
        sessionId: "private-session",
        error: "x".repeat(600),
      },
    });
    expect(recordServerIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "phone_upload_transfer_error",
        error,
        context: expect.objectContaining({
          stage: "uploading",
          error: "x".repeat(500),
        }),
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-session");
  });
  it("does not throw when incident storage fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(recordServerIncident).mockRejectedValueOnce(new Error("offline"));
    expect(() =>
      reportCriticalEndpointFailure({
        endpoint: "/api/stripe/webhook",
        status: 500,
      }),
    ).not.toThrow();
  });
});
