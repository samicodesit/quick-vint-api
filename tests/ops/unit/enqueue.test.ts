import { describe, expect, it } from "vitest";
import { enqueueJob } from "../../../utils/ops/jobs/enqueue";

const actor = {
  userId: "a0000000-0000-4000-8000-000000000001",
  workspaceId: "c0000000-0000-4000-8000-000000000001",
  role: "owner" as const,
};

describe("T02 enqueue service", () => {
  it("passes verified actor and stable key to one database RPC", async () => {
    let args: Record<string, unknown> | undefined;
    const id = await enqueueJob(
      actor,
      {
        kind: "fixture.echo",
        dedupeKey: "one",
        payload: { value: 1 },
        availableAt: "2026-09-26T12:00:00Z",
      },
      "test",
      async (value) => {
        args = value;
        return "c0000000-0000-4000-8000-000000000002";
      },
    );
    expect(id).toBe("c0000000-0000-4000-8000-000000000002");
    expect(args).toMatchObject({
      p_actor_user_id: actor.userId,
      p_workspace_id: actor.workspaceId,
      p_dedupe_key: "one",
    });
  });

  it("blocks fixture jobs in production before any RPC", async () => {
    await expect(
      enqueueJob(
        actor,
        {
          kind: "fixture.echo",
          dedupeKey: "one",
          payload: {},
          availableAt: "2026-09-26T12:00:00Z",
        },
        "production",
        async () => {
          throw new Error("RPC called");
        },
      ),
    ).rejects.toThrow(/fixture/i);
  });
});
