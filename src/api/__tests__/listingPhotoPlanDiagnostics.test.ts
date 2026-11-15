import { expect, it, vi } from "vitest";
import { parsePhotoPlan } from "../../../utils/listingPhotoGeneration";
import { runPhotoJob } from "../../../utils/listingPhotoWorker";

const valid = {
  eligible: true,
  category: "top",
  itemType: "top",
  frontIndex: 0,
  backIndex: -1,
  detailIndex: -1,
  viewDetails: { front: -1, rear: -1 },
  sourceEvidence: { shape: "Long top", front: "Plain", rear: "Not visible" },
  backViewEvidence: "absent",
};

async function failedClassification(classify: () => Promise<unknown>) {
  const job: any = {
    id: "j",
    kind: "listing",
    lease_token: "l",
    retry_count: 0,
    payload: {},
  };
  const mutate = vi.fn(async (_user, action, input) => {
    if (action === "claim") return job;
    if (action === "stage") return { id: "classify-attempt" };
    if (action === "save") Object.assign(job, { state: input.state });
    return job;
  });
  const edit = vi.fn();
  await runPhotoJob("u", "j", {
    mutate,
    classify,
    sources: async () => ["controlled-source"],
    edit,
  } as any);
  expect(edit).not.toHaveBeenCalled();
  expect(job.state).toBe("failed");
  const metrics = mutate.mock.calls.find((call) => call[1] === "metrics")?.[2];
  expect(metrics).toMatchObject({
    attemptId: "classify-attempt",
    status: "failed",
    cost: null,
  });
  return metrics.metrics;
}

it.each([
  ["invalid_shape", { frontIndex: 9 }],
  ["invalid_view_details", { viewDetails: { front: 9, rear: -1 } }],
  [
    "invalid_source_evidence",
    {
      sourceEvidence: {
        shape: "private raw response",
        front: "",
        rear: "Not visible",
      },
    },
  ],
  [
    "invalid_construction",
    { construction: { sleeveLength: "private raw response" } },
  ],
  ["inconsistent_back_view", { backViewEvidence: "separate_photo" }],
  ["invalid_item_type", { itemType: "private raw response" }],
  ["inconsistent_item_framing", { itemType: "trousers" }],
])(
  "retains only bounded %s through real parser and worker failure handling",
  async (reason, patch) => {
    const metrics = await failedClassification(async () => ({
      plan: parsePhotoPlan(
        JSON.stringify({ ...valid, ...(patch as object) }),
        1,
        true,
      ),
    }));
    expect(metrics).toEqual({
      errorCode: "invalid_photo_plan",
      planValidationReason: reason,
    });
    expect(JSON.stringify(metrics)).not.toContain("private raw response");
  },
);

it("does not accept arbitrary reason properties on unrelated errors", async () => {
  const error = Object.assign(new Error("invalid_photo_plan"), {
    planValidationReason: "private raw response",
  });
  expect(
    await failedClassification(async () => {
      throw error;
    }),
  ).toEqual({ errorCode: "invalid_photo_plan" });
});

it("keeps valid and unsupported classifier results unchanged", () => {
  expect(parsePhotoPlan(JSON.stringify(valid), 1, true)).toEqual(valid);
  expect(
    parsePhotoPlan(JSON.stringify({ ...valid, itemType: "other" }), 1, true),
  ).toMatchObject({ eligible: false, category: "skip" });
});
