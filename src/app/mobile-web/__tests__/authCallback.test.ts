import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  initialize: vi.fn(),
  track: vi.fn(),
}));
vi.mock("../auth", () => ({ completeWebCallback: mocks.complete }));
vi.mock("../telemetry", () => ({
  initializeMobileTelemetry: mocks.initialize,
}));
vi.mock("../analytics", () => ({ trackMobileAuthComplete: mocks.track }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.complete.mockResolvedValue({
    user: { id: "seller", app_metadata: { provider: "google" } },
  });
  mocks.track.mockResolvedValue(true);
});
it("records successful Google callback credentials before navigation", async () => {
  const { completeMobileAuthCallback } = await import("../authCallback.js");
  await completeMobileAuthCallback(
    new URL("https://autolister.app/app/auth/callback?code=fixture"),
  );
  expect(mocks.track).toHaveBeenCalledWith("seller", "google");
  expect(mocks.complete.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.initialize.mock.invocationCallOrder[0],
  );
});
it("records an email magic-link callback as a genuine sign-in", async () => {
  mocks.complete.mockResolvedValue({
    user: { id: "seller", app_metadata: { provider: "email" } },
  });
  const { completeMobileAuthCallback } = await import("../authCallback.js");
  await completeMobileAuthCallback(
    new URL(
      "https://autolister.app/app/auth/callback#access_token=fixture&refresh_token=fixture",
    ),
  );
  expect(mocks.track).toHaveBeenCalledWith("seller", "email");
});
it("does not invent a sign-in when a callback only restores an existing session", async () => {
  const { completeMobileAuthCallback } = await import("../authCallback.js");
  await completeMobileAuthCallback(
    new URL("https://autolister.app/app/auth/callback"),
  );
  expect(mocks.track).not.toHaveBeenCalled();
});
it("does not start URL-detecting telemetry or report success before callback verification", async () => {
  mocks.complete.mockRejectedValueOnce(new Error("verification failed"));
  const { completeMobileAuthCallback } = await import("../authCallback.js");
  await expect(
    completeMobileAuthCallback(
      new URL("https://autolister.app/app/auth/callback?code=bad"),
    ),
  ).rejects.toThrow("verification failed");
  expect(mocks.initialize).not.toHaveBeenCalled();
  expect(mocks.track).not.toHaveBeenCalled();
});

it("continues into the app if background telemetry stalls", async () => {
  vi.useFakeTimers();
  mocks.track.mockReturnValueOnce(new Promise(() => {}));
  try {
    const { completeMobileAuthCallback } = await import("../authCallback.js");
    const pending = completeMobileAuthCallback(
      new URL("https://autolister.app/app/auth/callback?code=fixture"),
    );
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(settled).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
