import { expect, it } from "vitest";
import { analyseItem } from "../../../utils/ops/ai/extract";

it("refuses a queued analysis after its requester loses workspace access", async () => {
  const client = {
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        single: async () => ({
          data:
            table === "ops_analysis_runs"
              ? {
                  id: "b0000000-0000-4000-8000-000000001701",
                  workspace_id: "c0000000-0000-4000-8000-000000000001",
                  item_id: "b0000000-0000-4000-8000-000000001702",
                  status: "queued",
                  model: "fixture",
                  requested_by: "a0000000-0000-4000-8000-000000001701",
                }
              : null,
          error: null,
        }),
        maybeSingle: async () => ({ data: null, error: null }),
      };
    },
  };
  let called = false;
  await expect(
    analyseItem(
      {
        workspaceId: "c0000000-0000-4000-8000-000000000001",
        payload: { runId: "b0000000-0000-4000-8000-000000001701" },
      },
      {
        client: client as any,
        environment: "test",
        provider: async () => {
          called = true;
          throw new Error("should not run");
        },
      },
    ),
  ).rejects.toThrow("no longer has analysis access");
  expect(called).toBe(false);
});
