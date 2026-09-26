import { randomUUID, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createSupabaseJobRepository,
  queueMetrics,
} from "../utils/ops/jobs/claim";
import { runWorker } from "../utils/ops/jobs/worker";

type Metrics = { claimed: number; completed: number; failed: number };

export function createWorkerHandler(
  secret: string,
  run: () => Promise<Metrics>,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST")
      return res.status(405).json({ error: "POST required" });
    if (!secret)
      return res.status(503).json({ error: "Worker is not configured" });
    const supplied = req.headers["x-ops-worker-token"];
    const actual = typeof supplied === "string" ? supplied : "";
    const expectedBytes = Buffer.from(secret);
    const actualBytes = Buffer.from(actual);
    if (
      expectedBytes.length !== actualBytes.length ||
      !timingSafeEqual(expectedBytes, actualBytes)
    ) {
      return res.status(401).json({ error: "Worker authentication required" });
    }
    try {
      return res.status(200).json(await run());
    } catch {
      return res.status(503).json({ error: "Worker run failed" });
    }
  };
}

export default createWorkerHandler(
  process.env.OPS_WORKER_TOKEN ?? "",
  async () => ({
    ...(await runWorker({
      deadlineMs: 20_000,
      maxJobs: 10,
      workerId: `vercel-${randomUUID()}`,
      environment: process.env.OPS_ENV ?? "production",
      repository: createSupabaseJobRepository(),
    })),
    queue: await queueMetrics(),
  }),
);
