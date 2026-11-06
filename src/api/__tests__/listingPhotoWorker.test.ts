import { it, expect, vi } from "vitest";
import { runPhotoJob } from "../../../utils/listingPhotoWorker";
import { checkListingPhoto } from "../../../utils/listingPhotoGeneration";
function correctionFixture() {
  const job: any = {
    id: "j",
    kind: "listing",
    lease_token: "l",
    retry_count: 0,
    payload: {
      plan: {
        eligible: true,
        category: "full_body",
        frontIndex: 0,
        backIndex: 1,
        detailIndex: 2,
      },
      primary: { state: "ready", key: "u/j/0/primary.jpg" },
    },
  };
  const defect = {
    code: "wrong_item_construction",
    evidence: "Sleeves are shorter than PRODUCT.",
  };
  const deps: any = {
    mutate: vi.fn(async (_user, action, input) => {
      if (action === "claim" || action === "get")
        return { ...job, payload: { ...job.payload } };
      if (action === "stage") return { id: input.stage };
      if (action === "save") {
        Object.assign(job.payload, input.payload);
        if (input.state) job.state = input.state;
      }
      return job;
    }),
    sources: async () => ["product-front", "product-rear", "detail"],
    front: async () => "front-pose",
    rear: async () => "rear-pose",
    edit: vi.fn(async () => ({ bytes: Buffer.from("candidate"), usage: {} })),
    check: vi.fn(async () => ({
      accepted: false,
      quality: { defects: [defect] },
      usage: {},
    })),
    upload: vi.fn(async () => {}),
    download: vi.fn(async () => Buffer.from("saved-candidate")),
  };
  return { job, deps, defect };
}
it("keeps a candidate private when real checker parsing finds a mismatch behind empty defects", async () => {
  const { job, deps } = correctionFixture();
  process.env.VERCEL_APP_OPENAI_API_KEY = "test";
  const comparison = {
    shape: { product: "Long dress", candidate: "Long dress", verdict: "match" },
    construction: {
      product: "Wrist-length sleeves",
      candidate: "Sleeves end at the elbow",
      verdict: "mismatch",
    },
    decoration: {
      product: "Plain back",
      candidate: "Plain back",
      verdict: "match",
    },
  };
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: "completed",
      service_tier: "default",
      usage: { input_tokens: 1000, output_tokens: 200 },
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                defects: [],
                productComparison: comparison,
              }),
            },
          ],
        },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetcher);
  deps.check = checkListingPhoto;
  try {
    await runPhotoJob("u", "j", deps);
    expect(job.state).toBe("failed");
    expect(job.payload.secondary.state).toBe("failed");
    expect(job.payload.secondary.correction.defects).toEqual([
      {
        code: "wrong_item_construction",
        evidence: expect.stringContaining("elbow"),
      },
    ]);
    expect(job.payload.primary).toEqual({
      state: "ready",
      key: "u/j/0/primary.jpg",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(deps.edit).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
it("passes per-view close-ups through first attempt, correction and validation without extra calls", async () => {
  const { job, deps } = correctionFixture();
  job.payload.plan = {
    eligible: true,
    category: "bottom",
    itemType: "trousers",
    frontIndex: 0,
    backIndex: 2,
    detailIndex: 8,
    backViewEvidence: "separate_photo",
    viewDetails: { front: 3, rear: 6 },
  };
  deps.sources = async () => Array.from({ length: 10 }, (_, i) => "source" + i);
  await runPhotoJob("u", "j", deps);
  const references = ["source2", "source6", "source8", "source0"];
  expect(deps.edit).toHaveBeenCalledExactlyOnceWith(
    "u",
    ["rear-pose", ...references],
    expect.any(String),
  );
  expect(deps.check).toHaveBeenCalledExactlyOnceWith(
    "rear-pose",
    Buffer.from("candidate"),
    job.payload.plan,
    "secondary",
    false,
    references,
  );
  job.retry_count = 1;
  deps.edit.mockClear();
  deps.check.mockClear();
  deps.check.mockResolvedValue({
    accepted: true,
    quality: { defects: [] },
    usage: {},
  });
  await runPhotoJob("u", "j", deps);
  expect(deps.edit).toHaveBeenCalledExactlyOnceWith(
    "u",
    [
      "data:image/jpeg;base64," +
        Buffer.from("saved-candidate").toString("base64"),
      ...references,
      "rear-pose",
    ],
    expect.stringContaining("Frame waist through feet"),
  );
  expect(deps.check).toHaveBeenCalledExactlyOnceWith(
    "rear-pose",
    Buffer.from("candidate"),
    job.payload.plan,
    "secondary",
    false,
    references,
  );
  expect(job.payload.primary).toEqual({
    state: "ready",
    key: "u/j/0/primary.jpg",
  });
  expect(job.state).toBe("ready");
});
it("records classification with its actual model and service-tier cost", async () => {
  const { job, deps } = correctionFixture();
  job.payload = {};
  deps.classify = vi.fn(async () => ({
    plan: {
      eligible: false,
      category: "skip",
      frontIndex: -1,
      backIndex: -1,
      detailIndex: -1,
    },
    usage: { input_tokens: 1000, output_tokens: 200 },
    serviceTier: "default",
    durationMs: 1200,
  }));
  await runPhotoJob("u", "j", deps);
  expect(deps.mutate).toHaveBeenCalledWith(
    "u",
    "metrics",
    expect.objectContaining({
      attemptId: "classify",
      cost: expect.closeTo(0.004, 9),
      metrics: expect.objectContaining({
        model: "gpt-6.1-sol",
        serviceTier: "default",
        durationMs: 1200,
      }),
    }),
  );
  expect(deps.edit).not.toHaveBeenCalled();
});
it("corrects only the rejected slot on the existing retry and checks all original evidence", async () => {
  const { job, deps, defect } = correctionFixture();
  await runPhotoJob("u", "j", deps);
  expect(job.state).toBe("failed");
  expect(job.payload.secondary.correction).toEqual({
    candidateKey: "u/j/0/secondary.jpg",
    defects: [defect],
  });
  expect(deps.edit).toHaveBeenCalledTimes(1);
  job.retry_count = 1;
  deps.edit.mockClear();
  deps.check.mockClear();
  deps.check.mockResolvedValue({
    accepted: true,
    quality: { defects: [] },
    usage: {},
  });
  await runPhotoJob("u", "j", deps);
  expect(deps.download).toHaveBeenCalledWith("u/j/0/secondary.jpg");
  expect(deps.edit).toHaveBeenCalledExactlyOnceWith(
    "u",
    [
      "data:image/jpeg;base64," +
        Buffer.from("saved-candidate").toString("base64"),
      "product-rear",
      "product-front",
      "detail",
      "rear-pose",
    ],
    expect.stringContaining(defect.evidence),
  );
  expect(deps.check).toHaveBeenCalledExactlyOnceWith(
    "rear-pose",
    Buffer.from("candidate"),
    job.payload.plan,
    "secondary",
    false,
    ["product-rear", "product-front", "detail"],
  );
  expect(job.payload.primary).toEqual({
    state: "ready",
    key: "u/j/0/primary.jpg",
  });
  expect(job.payload.secondary).toEqual({
    state: "ready",
    key: "u/j/1/secondary.jpg",
  });
  expect(job.state).toBe("ready");
});
it("does not publish or retain another correction when the correction fails", async () => {
  const { job, deps } = correctionFixture();
  await runPhotoJob("u", "j", deps);
  job.retry_count = 1;
  await runPhotoJob("u", "j", deps);
  expect(job.state).toBe("failed");
  expect(job.payload.secondary).toEqual({
    state: "failed",
    errorCode: "photo_quality_failed",
  });
  expect(deps.edit).toHaveBeenCalledTimes(2);
});
it.each(["foreign", "missing", "mixed", "upload", "no-evidence"])(
  "keeps correction recovery safe for %s",
  async (failure) => {
    const { job, deps } = correctionFixture();
    if (failure === "upload")
      deps.upload.mockRejectedValue(new Error("storage failed"));
    if (failure === "mixed")
      deps.check.mockResolvedValue({
        accepted: false,
        usage: {},
        quality: { defects: [{ code: "extra_limb", evidence: "Three arms" }] },
      });
    if (failure === "no-evidence")
      deps.check.mockResolvedValue({ accepted: false, usage: {}, quality: {} });
    await runPhotoJob("u", "j", deps);
    if (["mixed", "upload", "no-evidence"].includes(failure)) {
      expect(job.payload.secondary.correction).toBeUndefined();
      return;
    }
    expect(job.payload.secondary.correction).toBeDefined();
    if (failure === "foreign")
      job.payload.secondary.correction.candidateKey = "other/j/0/secondary.jpg";
    else deps.download.mockRejectedValue(new Error("gone"));
    job.retry_count = 1;
    deps.edit.mockClear();
    deps.check.mockClear();
    await runPhotoJob("u", "j", deps);
    expect(deps.download).toHaveBeenCalledTimes(failure === "foreign" ? 0 : 1);
    expect(deps.edit).toHaveBeenCalledTimes(failure === "foreign" ? 1 : 0);
    expect(deps.check).toHaveBeenCalledTimes(failure === "foreign" ? 1 : 0);
    expect(job.payload.secondary.correction).toBeUndefined();
    expect(job.state).toBe("failed");
  },
);
it("keeps both product surfaces in validation when a plain-side edit omits the opposite print", async () => {
  const job: any = {
    id: "j",
    kind: "listing",
    lease_token: "l",
    retry_count: 0,
    payload: {
      plan: {
        eligible: true,
        category: "full_body",
        frontIndex: 0,
        backIndex: 1,
        detailIndex: 2,
        backViewEvidence: "separate_photo",
        construction: {
          sleeveLength: "unknown",
          legLength: "unknown",
          frontDecoration: "decorated",
          backDecoration: "plain",
        },
      },
    },
  };
  const edit = vi.fn(async () => ({ bytes: Buffer.from("image"), usage: {} }));
  const check = vi.fn(async () => ({ accepted: true, usage: {}, quality: {} }));
  await runPhotoJob("u", "j", {
    mutate: async (_user: string, action: string, input: any) => {
      if (action === "claim" || action === "get")
        return { ...job, payload: { ...job.payload } };
      if (action === "stage") return { id: input.stage };
      if (action === "save") {
        Object.assign(job.payload, input.payload);
        if (input.state) job.state = input.state;
      }
      return job;
    },
    sources: async () => ["printed-front", "plain-back", "label"],
    front: async () => "front-pose",
    rear: async () => "rear-pose",
    edit,
    check,
    upload: async () => {},
  } as any);
  expect(edit.mock.calls.map((args: any[]) => args[1])).toEqual(
    expect.arrayContaining([
      ["front-pose", "printed-front", "plain-back", "label"],
      ["rear-pose", "plain-back", "label"],
    ]),
  );
  const rearCheck = (check.mock.calls as any[][]).find(
    (args) => args[3] === "secondary",
  )!;
  expect(rearCheck[5]).toEqual(["plain-back", "printed-front", "label"]);
  expect(job.state).toBe("ready");
});
it("keeps two front-facing outputs when the back is unknown without paying for a rear pose", async () => {
  const job: any = {
    id: "j",
    kind: "listing",
    lease_token: "l",
    retry_count: 0,
    payload: {
      plan: {
        eligible: true,
        category: "top",
        frontIndex: 0,
        backIndex: -1,
        detailIndex: 1,
      },
    },
  };
  const edit = vi.fn(async () => ({ bytes: Buffer.from("image"), usage: {} }));
  const rear = vi.fn(async () => {
    throw Error("must not prepare an unsupported rear");
  });
  const deps: any = {
    mutate: async (_user: string, action: string, input: any) => {
      if (action === "claim" || action === "get")
        return { ...job, payload: { ...job.payload } };
      if (action === "stage") return { id: input.stage };
      if (action === "save") {
        Object.assign(job.payload, input.payload);
        if (input.state) job.state = input.state;
      }
      return job;
    },
    sources: async () => ["product-front", "label"],
    front: async () => "front-pose",
    rear,
    edit,
    check: async () => ({ accepted: true, usage: {}, quality: {} }),
    upload: async () => {},
  };
  await runPhotoJob("u", "j", deps);
  expect(rear).not.toHaveBeenCalled();
  expect(edit).toHaveBeenCalledTimes(2);
  expect(
    edit.mock.calls.every((args: any[]) => args[1][0] === "front-pose"),
  ).toBe(true);
  expect(job.state).toBe("ready");
  expect(job.payload.secondary.state).toBe("ready");
});
it.each(["rejected", "missing", "foreign-key"])(
  "keeps saved-photo recovery safe when %s",
  async (failure) => {
    const job: any = {
      id: "j",
      kind: "listing",
      lease_token: "l",
      retry_count: 1,
      payload: {
        plan: {
          eligible: true,
          category: "top",
          frontIndex: 0,
          backIndex: 1,
          detailIndex: -1,
        },
        primary: { state: "ready", key: "u/j/0/primary.jpg" },
        secondary: {
          state: "failed",
          errorCode: "photo_provider_timeout",
          candidateKey:
            failure === "foreign-key"
              ? "other/j/0/secondary.jpg"
              : "u/j/0/secondary.jpg",
        },
      },
    };
    const deps: any = {
      mutate: async (_u: string, action: string, input: any) => {
        if (action === "claim" || action === "get")
          return { ...job, payload: { ...job.payload } };
        if (action === "stage") return { id: input.stage };
        if (action === "save") {
          Object.assign(job.payload, input.payload);
          if (input.state) job.state = input.state;
        }
        return job;
      },
      sources: async () => ["front", "back"],
      front: async () => "front-pose",
      rear: async () => "rear-pose",
      edit: vi.fn(async () => ({ bytes: Buffer.from("new-image"), usage: {} })),
      check: vi.fn(async () => ({ accepted: false, usage: {}, quality: {} })),
      upload: vi.fn(async () => {}),
      download: vi.fn(async () => {
        if (failure === "missing") throw new Error("missing");
        return Buffer.from("saved-image");
      }),
    };
    await runPhotoJob("u", "j", deps);
    expect(job.state).toBe("failed");
    expect(job.payload.secondary.candidateKey).toBeUndefined();
    expect(deps.edit).toHaveBeenCalledTimes(failure === "foreign-key" ? 1 : 0);
    expect(deps.download).toHaveBeenCalledTimes(
      failure === "foreign-key" ? 0 : 1,
    );
    expect(deps.check).toHaveBeenCalledTimes(failure === "missing" ? 0 : 1);
  },
);
it("retains a checker timeout without losing an accepted view or repeating image calls", async () => {
  const job: any = {
    id: "j",
    user_id: "u",
    kind: "listing",
    lease_token: "l",
    retry_count: 0,
    payload: {
      plan: {
        eligible: true,
        category: "top",
        frontIndex: 0,
        backIndex: 1,
        detailIndex: -1,
      },
    },
  };
  const records: any[] = [];
  let edits = 0;
  await runPhotoJob("u", "j", {
    mutate: async (_u, action, input) => {
      if (action === "claim" || action === "get") return job;
      if (action === "stage") return { id: input.stage };
      if (action === "metrics") records.push(input);
      if (action === "save") {
        Object.assign(job.payload, input.payload);
        if (input.state) job.state = input.state;
      }
      return job;
    },
    sources: async () => ["front", "back"],
    front: async () => "front-pose",
    rear: async () => "back-pose",
    classify: async () => {
      throw new Error("unexpected classification");
    },
    edit: async () => {
      edits++;
      return { bytes: Buffer.from("image"), usage: {} };
    },
    check: async (_pose, _bytes, _plan, slot) => {
      if (slot === "secondary")
        throw Object.assign(new Error("sensitive signed URL"), {
          name: "TimeoutError",
        });
      return {
        accepted: true,
        usage: {
          input_tokens: 1000,
          input_tokens_details: { cached_tokens: 100 },
          output_tokens: 100,
        },
        serviceTier: "priority",
        quality: { defects: [] },
      };
    },
    upload: async () => {},
    download: async () => {
      throw new Error("unexpected download");
    },
  });
  expect(edits).toBe(2);
  expect(job.payload.primary.state).toBe("ready");
  expect(job.payload.secondary).toMatchObject({
    state: "failed",
    errorCode: "photo_provider_timeout",
  });
  expect(records).toContainEqual(
    expect.objectContaining({
      attemptId: "secondary_check",
      status: "failed",
      metrics: expect.objectContaining({ errorCode: "photo_provider_timeout" }),
    }),
  );
  expect(records).toContainEqual(
    expect.objectContaining({
      attemptId: "primary_check",
      cost: expect.closeTo(0.00562, 9),
      metrics: expect.objectContaining({ serviceTier: "priority" }),
    }),
  );
  expect(JSON.stringify(records)).not.toContain("sensitive signed URL");
  expect(job.state).toBe("failed");
});
it("starts both views independently and preserves the accepted view across a failed-view retry", async () => {
  const job: any = {
    id: "job",
    user_id: "user",
    kind: "listing",
    lease_token: "lease",
    retry_count: 0,
    payload: {
      plan: {
        eligible: true,
        category: "top",
        frontIndex: 0,
        backIndex: 1,
        detailIndex: -1,
      },
    },
  };
  const calls: string[] = [];
  const checkedSources: string[][] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const deps: any = {
    mutate: async (_u: string, action: string, input: any) => {
      if (action === "claim" || action === "get")
        return { ...job, payload: { ...job.payload } };
      if (action === "stage") return { id: input.stage };
      if (action === "save") {
        Object.assign(job.payload, input.payload);
        if (input.state) job.state = input.state;
        return job;
      }
      return job;
    },
    sources: async () => ["front-product", "back-product"],
    front: async () => "front-pose",
    rear: async () => "rear-pose",
    edit: async (_u: string, images: string[]) => {
      calls.push(images[0]);
      if (calls.length === 2) release();
      await gate;
      return { bytes: Buffer.from(images[0]), usage: {} };
    },
    check: async (
      _pose: string,
      bytes: Buffer,
      _plan: unknown,
      _slot: string,
      _rear: boolean,
      originals: string[],
    ) => (
      checkedSources.push(originals),
      {
        accepted: bytes.toString() === "front-pose",
        usage: {},
        quality: {},
      }
    ),
    upload: async () => {},
    classify: async () => {
      throw new Error("must reuse plan");
    },
  };
  await runPhotoJob("user", "job", deps);
  expect(calls).toEqual(["front-pose", "rear-pose"]);
  expect(checkedSources).toEqual([
    ["front-product", "back-product"],
    ["back-product", "front-product"],
  ]);
  expect(job.state).toBe("failed");
  expect(job.payload.primary.state).toBe("ready");
  deps.check = async () => ({ accepted: true, usage: {}, quality: {} });
  await runPhotoJob("user", "job", deps);
  expect(calls).toEqual(["front-pose", "rear-pose", "rear-pose"]);
  expect(job.state).toBe("ready");
});
it("quietly skips ineligible items without preparing a rear model or generating images", async () => {
  const states: string[] = [];
  const deps: any = {
    mutate: async (_u: string, a: string, i: any) =>
      a === "claim"
        ? { id: "j", kind: "listing", lease_token: "l", payload: {} }
        : a === "stage"
          ? { id: "a" }
          : (states.push(i.state), {}),
    sources: async () => ["book"],
    classify: async () => ({
      plan: { eligible: false, category: "skip" },
      usage: {},
    }),
    rear: () => {
      throw new Error("no rear work for books");
    },
  };
  await runPhotoJob("u", "j", deps);
  expect(states).toContain("skipped");
});

it.each(["timeout", "provider", "quality", "upload"])(
  "retries %s failures without reusing rejected or unpersisted photos",
  async (failure) => {
    const job: any = {
      id: "j",
      user_id: "u",
      kind: "listing",
      lease_token: "l",
      retry_count: 0,
      payload: {
        plan: {
          eligible: true,
          category: "top",
          frontIndex: 0,
          backIndex: 1,
          detailIndex: -1,
        },
      },
    };
    const stored = new Map<string, Buffer>();
    const deps: any = {
      mutate: async (_u: string, action: string, input: any) => {
        if (action === "claim" || action === "get")
          return { ...job, payload: { ...job.payload } };
        if (action === "stage") return { id: input.stage };
        if (action === "save") {
          Object.assign(job.payload, input.payload);
          if (input.state) job.state = input.state;
        }
        return job;
      },
      sources: async () => ["front", "back"],
      front: async () => "front-pose",
      rear: async () => "rear-pose",
      classify: vi.fn(),
      edit: vi.fn(async () => ({
        bytes: Buffer.from("saved-image"),
        usage: {},
      })),
      check: vi.fn(
        async (_pose: string, _bytes: Buffer, _plan: unknown, slot: string) => {
          if (slot === "secondary" && job.retry_count === 0) {
            if (failure === "timeout")
              throw Object.assign(new Error("timeout"), {
                name: "TimeoutError",
              });
            if (failure === "provider") throw new Error("photo_provider_503");
            if (failure === "quality")
              return { accepted: false, usage: {}, quality: {} };
          }
          return { accepted: true, usage: {}, quality: {} };
        },
      ),
      upload: vi.fn(async (key: string, bytes: Buffer) => {
        if (failure === "upload" && key.endsWith("/0/secondary.jpg"))
          throw new Error("storage_failed");
        stored.set(key, bytes);
      }),
      download: vi.fn(async (key: string) => {
        const bytes = stored.get(key);
        if (!bytes) throw new Error("missing");
        return bytes;
      }),
    };
    await runPhotoJob("u", "j", deps);
    expect(job.state).toBe("failed");
    expect(job.payload.primary.state).toBe("ready");
    job.retry_count = 1;
    await runPhotoJob("u", "j", deps);
    const reusable = ["timeout", "provider"].includes(failure);
    expect(deps.edit).toHaveBeenCalledTimes(reusable ? 2 : 3);
    expect(deps.download).toHaveBeenCalledTimes(reusable ? 1 : 0);
    expect(deps.check).toHaveBeenCalledTimes(3);
    expect(job.payload.secondary.key).toBe(
      `u/j/${reusable ? 0 : 1}/secondary.jpg`,
    );
    expect(job.state).toBe("ready");
  },
);
