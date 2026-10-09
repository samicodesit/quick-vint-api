import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { rpc: mocks.rpc },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.INCIDENT_PROCESSING_PAUSED;
});
it("retries failed registration on later activity and coalesces successful repeated reads", async () => {
  mocks.rpc
    .mockReturnValueOnce({
      abortSignal: async () => ({
        data: null,
        error: new Error("unavailable"),
      }),
    })
    .mockReturnValue({
      abortSignal: async () => ({ data: true, error: null }),
    });
  const { registerPhoneEvidenceOwner } =
    await import("../../../utils/incidents/phone.js");
  await registerPhoneEvidenceOwner("session", "owner");
  await registerPhoneEvidenceOwner("session", "owner");
  await registerPhoneEvidenceOwner("session", "owner");
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
it("shares concurrent registration work without treating a capacity refusal as success", async () => {
  let resolve!: (result: any) => void;
  mocks.rpc
    .mockReturnValueOnce({
      abortSignal: () =>
        new Promise((done) => {
          resolve = done;
        }),
    })
    .mockReturnValue({
      abortSignal: async () => ({ data: true, error: null }),
    });
  const { registerPhoneEvidenceOwner } =
    await import("../../../utils/incidents/phone.js");
  const first = registerPhoneEvidenceOwner("session", "owner");
  const second = registerPhoneEvidenceOwner("session", "owner");
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  resolve({ data: false, error: null });
  await Promise.all([first, second]);
  await registerPhoneEvidenceOwner("session", "owner");
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
