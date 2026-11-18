import { expect, it, vi } from "vitest";
import {
  photoFailureCode,
  runPhotoJob,
} from "../../../utils/listingPhotoWorker";

it("retains a failed rear dependency separately from its original provider failure", async () => {
  const rear: any = {
    id: "rear",
    kind: "rear",
    lease_token: "r",
    retry_count: 0,
    payload: {},
  };
  const listing: any = {
    id: "listing",
    kind: "listing",
    lease_token: "l",
    retry_count: 0,
    payload: {
      plan: {
        eligible: true,
        category: "full_body",
        frontIndex: 0,
        backIndex: 1,
        detailIndex: -1,
      },
    },
  };
  const edits = vi.fn(async () => ({
    bytes: Buffer.from("controlled-candidate"),
    usage: {},
  }));
  const metrics: any[] = [];
  function dependencies(job: any): any {
    return {
      mutate: async (_owner: string, action: string, input: any) => {
        if (action === "claim" || action === "get") return structuredClone(job);
        if (action === "stage") return { id: job.id + ":" + input.stage };
        if (action === "metrics") metrics.push(input);
        if (action === "save") {
          Object.assign(job.payload, input.payload);
          if (input.state) job.state = input.state;
          if (input.errorCode) job.error_code = input.errorCode;
        }
        return structuredClone(job);
      },
      sources: async () => ["controlled-front", "controlled-back"],
      front: async () => "controlled-model",
      rear: async () => {
        await runPhotoJob("owner", rear.id, dependencies(rear));
        if (rear.state === "failed") throw new Error("rear_model_failed");
        return null;
      },
      edit: edits,
      check: async () => {
        throw new Error("photo_provider_503");
      },
      upload: async () => {},
    };
  }
  await runPhotoJob("owner", listing.id, dependencies(listing));
  expect(rear.state).toBe("failed");
  expect(rear.error_code).toBe("photo_provider_503");
  expect(metrics.filter((receipt) => receipt.status === "failed")).toEqual([
    expect.objectContaining({
      metrics: { errorCode: "photo_provider_503" },
      status: "failed",
      cost: null,
    }),
  ]);
  expect(listing.state).toBe("failed");
  expect(listing.error_code).toBe("rear_model_failed");
  expect(edits).toHaveBeenCalledTimes(1);
  expect(listing.payload.primary).toBeUndefined();
  expect(listing.payload.secondary).toBeUndefined();
});

it("does not retain arbitrary provider messages as a dependency code", () => {
  expect(photoFailureCode(new Error("rear_model_failed: private detail"))).toBe(
    "photo_operation_failed",
  );
});
