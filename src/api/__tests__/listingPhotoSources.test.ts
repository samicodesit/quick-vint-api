import { it, expect, vi, afterEach } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn() }));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    rpc: m.rpc,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === "profiles"
                ? { id: "u", subscription_status: "active" }
                : { value: "false" },
          }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: m.upload }) },
  },
}));
import { processListingPhotoJob } from "../../../utils/listingPhotoJobs";
afterEach(() => vi.unstubAllEnvs());
it("settles every source snapshot and records storage failure before releasing the job lease", async () => {
  vi.stubEnv("LISTING_MODEL_PHOTOS_ENABLED", "true");
  vi.stubEnv("USER_MODELS_ENABLED", "true");
  const saves: any[] = [],
    metrics: any[] = [];
  m.rpc.mockImplementation(async (_name, args) => {
    const action = args.p_action,
      input = args.p_input;
    if (action === "claim")
      return {
        data: {
          id: "j",
          user_id: "u",
          kind: "listing",
          lease_token: "l",
          payload: {
            sources: [
              "data:image/jpeg;base64,YQ==",
              "data:image/jpeg;base64,Yg==",
            ],
          },
        },
      };
    if (action === "stage") return { data: { id: input.objectKey } };
    if (action === "metrics") metrics.push(input);
    if (action === "save") saves.push(input);
    return { data: {} };
  });
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  m.upload.mockImplementation(async (key: string) => {
    if (key.endsWith("source-0.jpeg"))
      return { error: new Error("private storage token must not leak") };
    await gate;
    return { error: null };
  });
  const work = processListingPhotoJob("u", "j");
  try {
    await vi.waitFor(() => expect(m.upload).toHaveBeenCalledTimes(2));
    expect(saves.some((s) => s.state === "failed")).toBe(false);
  } finally {
    release();
    await work;
  }
  expect(metrics).toHaveLength(2);
  expect(metrics).toContainEqual(
    expect.objectContaining({
      status: "failed",
      cost: 0,
      metrics: { errorCode: "photo_source_snapshot_failed" },
    }),
  );
  expect(saves).toContainEqual(
    expect.objectContaining({
      state: "failed",
      errorCode: "photo_source_snapshot_failed",
    }),
  );
  expect(JSON.stringify({ saves, metrics })).not.toContain(
    "private storage token",
  );
});
