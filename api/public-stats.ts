import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../utils/supabaseClient";

const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";
const DISPLAY_STEP_MS = 3200;
const DISPLAY_WINDOW_MS = 60_000;

function coerceCount(value: number | string | null | undefined): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value || 0), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function readPublicStats() {
  const generationsResult = await supabase
    .from("api_logs")
    .select("id", { count: "exact", head: true })
    .eq("endpoint", "/api/generate")
    .eq("response_status", 200);

  if (generationsResult.error) {
    throw generationsResult.error;
  }

  const totalGenerations = coerceCount(generationsResult.count);
  const displayOffset = Math.min(
    Math.max(totalGenerations - 1, 0),
    6 + (totalGenerations % 5),
  );
  const displayWindowStartedAt = new Date(
    Math.floor(Date.now() / DISPLAY_WINDOW_MS) * DISPLAY_WINDOW_MS,
  ).toISOString();

  return {
    totalGenerations,
    displayStartGenerations: totalGenerations - displayOffset,
    displayWindowStartedAt,
    displayStepMs: DISPLAY_STEP_MS,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  res.setHeader("Cache-Control", CACHE_CONTROL);

  try {
    const stats = await readPublicStats();

    return res.status(200).json({
      totalGenerations: stats.totalGenerations,
      displayStartGenerations: stats.displayStartGenerations,
      displayWindowStartedAt: stats.displayWindowStartedAt,
      displayStepMs: stats.displayStepMs,
    });
  } catch (error: any) {
    console.error("Failed to load public stats", error);
    return res.status(503).json({ error: "Stats unavailable." });
  }
}
