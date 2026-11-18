import { it, expect, vi, afterEach } from "vitest";
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  classify: vi.fn(),
  edit: vi.fn(),
  check: vi.fn(),
}));
vi.mock("../../../utils/listingPhotoGeneration", async (original) => ({
  ...(await original<typeof import("../../../utils/listingPhotoGeneration")>()),
  classifyListingPhotos: m.classify,
  editListingPhoto: m.edit,
  checkListingPhoto: m.check,
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    rpc: m.rpc,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: { object_key: "front.jpg" } }),
            }),
          }),
          maybeSingle: async () => ({
            data:
              table === "profiles"
                ? { id: "u", subscription_status: "active" }
                : { value: "false" },
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        upload: m.upload,
        createSignedUrl: async () => ({
          data: { signedUrl: "https://storage.test/front.jpg" },
        }),
      }),
    },
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

it.each([13, 16, 20])(
  "persists %i ordered originals through a source status timeout without repeating uploads",
  async (count) => {
    vi.stubEnv("LISTING_MODEL_PHOTOS_ENABLED", "true");
    vi.stubEnv("USER_MODELS_ENABLED", "true");
    vi.clearAllMocks();
    m.classify.mockResolvedValue({
      plan: {
        eligible: true,
        category: "full_body",
        frontIndex: 0,
        backIndex: -1,
        detailIndex: -1,
      },
    });
    m.edit.mockResolvedValue({ bytes: Buffer.from("test-image") });
    m.check.mockResolvedValue({ accepted: true });
    const originals = Array.from(
      { length: count },
      (_, i) =>
        "data:image/jpeg;base64," + Buffer.alloc(160000, i).toString("base64"),
    );
    const keys = originals.map((_, i) => `u/j/source-${i}.jpeg`);
    let active = 0,
      peak = 0,
      timedOut = false;
    const completed: string[] = [];
    const saves: any[] = [];
    const stages: string[] = [];
    const payload = { sources: originals };
    m.upload.mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      active--;
      return { error: null };
    });
    m.rpc.mockImplementation(async (_name, { p_action, p_input }) => {
      if (p_action === "claim")
        return {
          data: {
            id: "j",
            user_id: "u",
            kind: "listing",
            lease_token: "l",
            payload,
          },
        };
      if (p_action === "stage") {
        stages.push(p_input.stage);
        return { data: { id: p_input.objectKey || p_input.stage } };
      }
      if (p_action === "metrics" && p_input.ackOnly) {
        if (p_input.attemptId === keys[0] && !timedOut) {
          timedOut = true;
          return {
            error: {
              code: "57014",
              message: "canceling statement due to statement timeout",
            },
          };
        }
        if (p_input.status !== "failed") completed.push(p_input.attemptId);
      }
      if (p_action === "save") {
        saves.push(p_input);
        Object.assign(payload, p_input.payload);
      }
      if (p_action === "get") return { data: { payload } };
      return { data: {} };
    });
    await processListingPhotoJob("u", "j");
    expect(timedOut).toBe(true);
    expect(saves).toContainEqual({
      id: "j",
      lease: "l",
      payload: { sourceKeys: keys, sources: [] },
    });
    expect(new Set(completed)).toEqual(new Set(keys));
    expect(completed).toHaveLength(count);
    expect(m.upload.mock.calls.slice(0, count).map(([key]) => key)).toEqual(
      keys,
    );
    expect(m.upload).toHaveBeenCalledTimes(count + 2);
    expect(peak).toBeLessThanOrEqual(2);
    expect(stages.filter((s) => s === "source")).toHaveLength(count);
    expect(m.classify).toHaveBeenCalledExactlyOnceWith(originals);
    expect(m.edit).toHaveBeenCalledTimes(2);
    expect(m.check).toHaveBeenCalledTimes(2);
    expect(saves.at(-1)?.state).toBe("ready");
  },
);

it.each([
  {
    label: "persistent database timeout",
    reply: { error: { code: "57014" } },
    calls: 2,
    code: "photo_source_snapshot_failed",
  },
  {
    label: "unconfirmed transport failure",
    reply: { error: { code: "NETWORK" } },
    calls: 1,
    code: "photo_source_snapshot_failed",
  },
  {
    label: "lost lease",
    reply: { data: null },
    calls: 1,
    code: "photo_cancelled",
  },
])(
  "stops on $label after uploading and preserves the upload outcome",
  async ({ reply, calls, code }) => {
    vi.stubEnv("LISTING_MODEL_PHOTOS_ENABLED", "true");
    vi.stubEnv("USER_MODELS_ENABLED", "true");
    vi.clearAllMocks();
    m.upload.mockResolvedValue({ error: null });
    const metrics: any[] = [],
      saves: any[] = [];
    m.rpc.mockImplementation(async (_name, { p_action, p_input }) => {
      if (p_action === "claim")
        return {
          data: {
            id: "j",
            user_id: "u",
            kind: "listing",
            lease_token: "l",
            payload: { sources: ["data:image/jpeg;base64,YQ=="] },
          },
        };
      if (p_action === "stage") return { data: { id: "a" } };
      if (p_action === "metrics") {
        metrics.push(p_input);
        return reply;
      }
      if (p_action === "save") saves.push(p_input);
      return { data: {} };
    });
    await processListingPhotoJob("u", "j");
    expect(metrics).toHaveLength(calls);
    expect(
      metrics.every((row) => row.attemptId === "a" && row.status !== "failed"),
    ).toBe(true);
    expect(saves).toEqual([
      { id: "j", lease: "l", payload: {}, state: "failed", errorCode: code },
    ]);
    expect(m.upload).toHaveBeenCalledTimes(1);
    expect(m.classify).not.toHaveBeenCalled();
    expect(m.edit).not.toHaveBeenCalled();
  },
);
