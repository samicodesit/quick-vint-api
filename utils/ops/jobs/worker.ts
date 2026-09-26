export type ClaimedJob = {
  id: string;
  workspaceId: string;
  requestedBy: string;
  kind: string;
  payload: unknown;
  attempts: number;
};
export type JobRepository = {
  claimJobs(workerId: string, limit: number): Promise<ClaimedJob[]>;
  isAuthorized(job: ClaimedJob): Promise<boolean>;
  finishJob(id: string, workerId: string, result: unknown): Promise<void>;
  failJob(id: string, workerId: string, message: string): Promise<void>;
};

export async function runWorker(options: {
  deadlineMs: number;
  maxJobs: number;
  workerId: string;
  environment: string;
  repository: JobRepository;
}) {
  const { deadlineMs, maxJobs, workerId, environment, repository } = options;
  if (
    !Number.isInteger(deadlineMs) ||
    deadlineMs < 1 ||
    deadlineMs > 300_000 ||
    !Number.isInteger(maxJobs) ||
    maxJobs < 1 ||
    maxJobs > 50
  ) {
    throw new Error("Worker bounds are invalid");
  }
  const deadline = Date.now() + deadlineMs;
  const metrics = { claimed: 0, completed: 0, failed: 0 };
  while (metrics.claimed < maxJobs && Date.now() < deadline) {
    const [job] = await repository.claimJobs(workerId, 1);
    if (!job) break;
    metrics.claimed++;
    try {
      if (!(await repository.isAuthorized(job)))
        throw new Error("Job owner no longer has workspace access");
      let result: unknown;
      switch (job.kind) {
        case "fixture.echo":
          if (environment !== "local" && environment !== "test")
            throw new Error("Fixture job disabled");
          result = { fixture: true, payload: job.payload };
          break;
        default:
          throw new Error("Unsupported job kind");
      }
      await repository.finishJob(job.id, workerId, result);
      metrics.completed++;
    } catch (error) {
      await repository.failJob(
        job.id,
        workerId,
        error instanceof Error ? error.message : "Job failed",
      );
      metrics.failed++;
    }
  }
  return metrics;
}
