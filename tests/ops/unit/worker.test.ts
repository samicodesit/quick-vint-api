import { describe, expect, it } from "vitest";
import { runWorker } from "../../../utils/ops/jobs/worker";

const job = {
  id: "c0000000-0000-4000-8000-000000000001",
  workspaceId: "c0000000-0000-4000-8000-000000000002",
  requestedBy: "a0000000-0000-4000-8000-000000000001",
  kind: "fixture.echo",
  payload: { value: 1 },
  attempts: 1,
};

describe("T02 bounded worker", () => {
  it("awaits one committed result and never starts beyond its job bound", async () => {
    const finished: string[] = [];
    let claims = 0;
    const result = await runWorker({
      deadlineMs: 1000,
      maxJobs: 1,
      workerId: "test-worker",
      environment: "test",
      repository: {
        claimJobs: async () => {
          claims++;
          return [job];
        },
        isAuthorized: async () => true,
        finishJob: async (id) => {
          finished.push(id);
        },
        failJob: async () => {
          throw new Error("unexpected failure");
        },
      },
    });
    expect(result).toMatchObject({ claimed: 1, completed: 1, failed: 0 });
    expect(finished).toEqual([job.id]);
    expect(claims).toBe(1);
  });

  it("rechecks revoked membership before a handler runs", async () => {
    const failed: string[] = [];
    const result = await runWorker({
      deadlineMs: 1000,
      maxJobs: 1,
      workerId: "test-worker",
      environment: "test",
      repository: {
        claimJobs: async () => [job],
        isAuthorized: async () => false,
        finishJob: async () => {
          throw new Error("revoked job was finished");
        },
        failJob: async (id) => {
          failed.push(id);
        },
      },
    });
    expect(result.failed).toBe(1);
    expect(failed).toEqual([job.id]);
  });
});
