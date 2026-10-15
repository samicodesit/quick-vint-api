import { beforeEach, describe, expect, it, vi } from "vitest";

const { track, context } = vi.hoisted(() => ({
  track: vi.fn(),
  context: vi.fn(() => ({ webSessionId: "visit-1" })),
}));
vi.mock("../../../scripts/webAnalyticsContext", () => ({
  getWebAnalyticsContext: context,
}));

describe("restored-session telemetry", () => {
  let stored: Map<string, string>;
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    stored = new Map();
    context.mockReturnValue({ webSessionId: "visit-1" });
    track.mockResolvedValue({ queued: true });
    vi.stubGlobal("AutoListerWebsiteTelemetry", { track });
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    });
  });

  it("queues one restored-session event across reloads instead of new sign-ins", async () => {
    let analytics = await import("../analytics.js");
    await analytics.trackMobileSessionRestored("seller-1");
    vi.resetModules();
    analytics = await import("../analytics.js");
    await analytics.trackMobileSessionRestored("seller-1");
    expect(track.mock.calls.map(([event]) => event)).toEqual([
      "session_restored",
    ]);
  });

  it("queues bounded style setup outcomes without seller-note or preview text", async () => {
    const analytics = await import("../analytics.js");
    expect(
      await analytics.trackMobileEvent("web_style_setup", {
        phase: "complete",
        method: "apply",
        descriptionLength: "short",
        descriptionFooterText: "Private seller note",
        generatedDescription: "Example output",
      }),
    ).toBe(true);
    const body = track.mock.calls[0][1];
    expect(body.context).toMatchObject({
      phase: "complete",
      method: "apply",
      descriptionLength: "short",
    });
    expect(JSON.stringify(body)).not.toContain("Private seller note");
    expect(JSON.stringify(body)).not.toContain("Example output");
  });

  it("records new visits and changed accounts separately", async () => {
    const analytics = await import("../analytics.js");
    await analytics.trackMobileSessionRestored("seller-1");
    context.mockReturnValue({ webSessionId: "visit-2" });
    await analytics.trackMobileSessionRestored("seller-1");
    await analytics.trackMobileSessionRestored("seller-2");
    expect(track.mock.calls.map(([event]) => event)).toEqual([
      "session_restored",
      "session_restored",
      "session_restored",
    ]);
  });

  it("retries enqueue failures and coalesces concurrent restoration checks", async () => {
    track.mockResolvedValueOnce({ queued: false });
    const analytics = await import("../analytics.js");
    await analytics.trackMobileSessionRestored("seller-1");
    await Promise.all([
      analytics.trackMobileSessionRestored("seller-1"),
      analytics.trackMobileSessionRestored("seller-1"),
    ]);
    expect(track).toHaveBeenCalledTimes(2);
  });

  it("keeps a successful email or Google sign-in visible without a redundant restoration", async () => {
    const analytics = await import("../analytics.js");
    await analytics.trackMobileAuthComplete("seller-1", "google");
    await analytics.trackMobileSessionRestored("seller-1");
    await analytics.trackMobileAuthComplete("seller-1", "email");
    expect(
      track.mock.calls.map(([event, body]) => [event, body.context.method]),
    ).toEqual([
      ["auth_complete", "google"],
      ["auth_complete", "email"],
    ]);
    expect(JSON.stringify(track.mock.calls)).not.toContain("seller-1");
  });

  it("does not break or repeat background work when browser storage is blocked", async () => {
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new Error("blocked");
      },
    });
    const analytics = await import("../analytics.js");
    await analytics.trackMobileSessionRestored("seller-1");
    await analytics.trackMobileSessionRestored("seller-1");
    expect(track).toHaveBeenCalledTimes(1);
  });
});
