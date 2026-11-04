import { describe, it, expect, vi } from "vitest";
import {
  runModelOperation,
  parseQuality,
  type GenerationDependencies,
  type ModelJob,
} from "../../../utils/userModelGeneration";
const pass = {
  phone_obscures_face: true,
  full_body_and_shoes_visible: true,
  no_major_defects: true,
};
function fixture(version = 1) {
  const jobs = [1, 2].map(
    (n) =>
      ({
        id: "model",
        user_id: "owner",
        operation_id: "op",
        lease_token: "lease" + n,
        attempt_count: n,
        prompt_version: version,
        catalog_version: version,
      }) as ModelJob,
  );
  const mutate = vi.fn(async (_u: string, action: string) =>
    action === "claim"
      ? jobs.shift() || null
      : action === "fail"
        ? { state: jobs.length ? "queued" : "failed" }
        : { state: "ready" },
  );
  const deps: GenerationDependencies = {
    mutate,
    generate: vi.fn(async () => ({
      bytes: Buffer.from("jpeg"),
      usage: { output_tokens: 400 },
      durationMs: 9000,
    })),
    check: vi.fn(async () => ({
      quality: pass,
      usage: { input_tokens: 2000 },
      durationMs: 1300,
    })),
    upload: vi.fn(async () => {}),
  };
  return deps;
}
describe("bounded image worker", () => {
  it("records unknown billing after a provider timeout instead of claiming it was free", async () => {
    const d = fixture();
    vi.mocked(d.generate).mockRejectedValue(new Error("timeout"));
    await runModelOperation("owner", "op", d);
    expect(d.mutate).toHaveBeenCalledWith(
      "owner",
      "fail",
      expect.objectContaining({
        metrics: expect.objectContaining({
          estimatedCostUsd: null,
          usageComplete: false,
        }),
      }),
    );
  });
  it.each([1, 2])(
    "publishes recipe %s only after storage and validated quality, recording costs",
    async (version) => {
      const d = fixture(version);
      await runModelOperation("owner", "op", d);
      expect(d.generate).toHaveBeenCalledTimes(1);
      expect(d.mutate).toHaveBeenCalledWith(
        "owner",
        "finish",
        expect.objectContaining({
          lease: "lease1",
          metrics: expect.objectContaining({ estimatedCostUsd: 0.0135 }),
        }),
      );
    },
  );
  it("retries a bad image once, with no publication of the rejected candidate", async () => {
    const d = fixture();
    vi.mocked(d.check).mockResolvedValueOnce({
      quality: { ...pass, full_body_and_shoes_visible: false },
      usage: {},
      durationMs: 100,
    });
    await runModelOperation("owner", "op", d);
    expect(d.generate).toHaveBeenCalledTimes(2);
    expect(d.mutate).toHaveBeenCalledWith(
      "owner",
      "fail",
      expect.objectContaining({ errorCode: "quality_failed", lease: "lease1" }),
    );
    expect(d.mutate).toHaveBeenCalledWith(
      "owner",
      "finish",
      expect.objectContaining({ lease: "lease2" }),
    );
  });
  it("never publishes after storage failures or unparseable checks", async () => {
    const d = fixture();
    vi.mocked(d.upload).mockRejectedValue(new Error("offline"));
    await runModelOperation("owner", "op", d);
    expect(d.generate).toHaveBeenCalledTimes(2);
    expect(vi.mocked(d.mutate).mock.calls.some((c) => c[1] === "finish")).toBe(
      false,
    );
    expect(() => parseQuality('{"phone_obscures_face":"true"}')).toThrow();
    expect(parseQuality(JSON.stringify(pass))).toEqual(pass);
  });
  it("does nothing when another worker owns the lease", async () => {
    const d = fixture();
    vi.mocked(d.mutate).mockResolvedValue(null);
    await runModelOperation("owner", "op", d);
    expect(d.generate).not.toHaveBeenCalled();
  });
});
