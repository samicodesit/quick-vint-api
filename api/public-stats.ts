import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../utils/supabaseClient";

const CACHE_CONTROL = "public, s-maxage=600, stale-while-revalidate=1800";

function coerceCount(value: number | string | null | undefined): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value || 0), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function readPublicStats() {
  const generationsResult = await supabase
    .from("daily_stats")
    .select("total_api_calls");

  if (generationsResult.error) {
    throw generationsResult.error;
  }

  const totalGenerations = (generationsResult.data || []).reduce(
    (sum: number, row: { total_api_calls?: number | string | null }) =>
      sum + coerceCount(row.total_api_calls),
    0,
  );

  return {
    totalGenerations,
    generatedAt: new Date().toISOString(),
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
      generatedAt: stats.generatedAt,
    });
  } catch (error: any) {
    console.error("Failed to load public stats", error);
    return res.status(503).json({ error: "Stats unavailable." });
  }
}
