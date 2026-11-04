import { it, expect } from "vitest";
import { runPhotoJob } from "../../../utils/listingPhotoWorker";
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
      return { accepted: true, usage: {}, quality: { defects: [] } };
    },
    upload: async () => {},
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
