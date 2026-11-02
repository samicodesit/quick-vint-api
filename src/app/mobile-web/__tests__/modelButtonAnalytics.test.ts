import { beforeEach, expect, it, vi } from "vitest";

const { track, context } = vi.hoisted(() => ({
  track: vi.fn(),
  context: vi.fn(() => ({ webSessionId: "visit-1" })),
}));
vi.mock("../../../scripts/webAnalyticsContext", () => ({
  getWebAnalyticsContext: context,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const stored = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    },
  });
  vi.stubGlobal("AutoListerWebsiteTelemetry", { track });
  context.mockReturnValue({ webSessionId: "visit-1" });
  track.mockResolvedValue({ queued: true });
});

it("deduplicates concurrent calls, remounts and reloads in the same visit", async () => {
  let analytics = await import("../analytics.js");
  await Promise.all([
    analytics.trackModelButtonViewed("seller-1"),
    analytics.trackModelButtonViewed("seller-1"),
  ]);
  vi.resetModules();
  analytics = await import("../analytics.js");
  await analytics.trackModelButtonViewed("seller-1");
  expect(track).toHaveBeenCalledTimes(1);
  expect(track.mock.calls[0]).toMatchObject([
    "model_button_viewed",
    { expectedAccountId: "seller-1", context: { entryPoint: "toolbar" } },
  ]);
});

it("separates accounts and visits, including switching back to an account", async () => {
  const analytics = await import("../analytics.js");
  await analytics.trackModelButtonViewed("seller-1");
  await analytics.trackModelButtonViewed("seller-2");
  await analytics.trackModelButtonViewed("seller-1");
  context.mockReturnValue({ webSessionId: "visit-2" });
  await analytics.trackModelButtonViewed("seller-1");
  expect(track).toHaveBeenCalledTimes(3);
});

it("keeps actual popup impressions separate and does not suppress them", async () => {
  const analytics = await import("../analytics.js");
  await analytics.trackModelButtonViewed("seller-1");
  await analytics.trackMobileEvent(
    "model_invitation_shown",
    { entryPoint: "invitation" },
    "seller-1",
  );
  expect(track.mock.calls.map(([event]) => event)).toEqual([
    "model_button_viewed",
    "model_invitation_shown",
  ]);
});

it("does not repeatedly retry an unimportant exposure when storage or telemetry fails", async () => {
  Object.defineProperty(window, "localStorage", {
    get() {
      throw new Error("blocked");
    },
  });
  track.mockResolvedValue({ queued: false });
  const analytics = await import("../analytics.js");
  await analytics.trackModelButtonViewed("seller-1");
  await analytics.trackModelButtonViewed("seller-1");
  expect(track).toHaveBeenCalledTimes(1);
});
