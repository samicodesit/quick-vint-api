import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ init: vi.fn(), rpc: vi.fn() }));
vi.mock("@sentry/node", () => ({ init: mocks.init }));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    rpc: (...args: any[]) => ({ abortSignal: () => mocks.rpc(...args) }),
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.SENTRY_DSN = "https://public@example.test/1";
  delete process.env.INCIDENT_PROCESSING_PAUSED;
});
it("applies the shared atomic budget and scrubber to automatic SDK captures", async () => {
  const { initSentry } = await import("../../../utils/sentry.js");
  initSentry();
  const config = mocks.init.mock.calls[0][0];
  expect(config.shutdownTimeout).toBe(1500);
  mocks.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: false })
    .mockRejectedValueOnce(new Error("database down"));
  const event = {
    exception: { values: [{ type: "TypeError", value: "token=private" }] },
    request: { headers: { Authorization: "private" } },
  };
  const accepted = await config.beforeSend(event);
  expect(accepted.exception.values[0].type).toBe("TypeError");
  expect(JSON.stringify(accepted)).not.toContain("private");
  expect(await config.beforeSend(event)).toBeNull();
  expect(await config.beforeSend(event)).toBeNull();
  expect(mocks.rpc).toHaveBeenCalledWith("incident_reserve_sentry");
});
it("does not reserve or send when paused", async () => {
  const { initSentry } = await import("../../../utils/sentry.js");
  initSentry();
  process.env.INCIDENT_PROCESSING_PAUSED = "true";
  expect(
    await mocks.init.mock.calls[0][0].beforeSend({ level: "error" }),
  ).toBeNull();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
