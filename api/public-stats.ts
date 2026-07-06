import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../utils/supabaseClient";

const CACHE_CONTROL = "public, s-maxage=900, stale-while-revalidate=3600";

function coerceCount(value: number | string | null | undefined): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value || 0), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function readPublicStats() {
  const [profilesResult, generationsResult] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("api_logs")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", "/api/generate")
      .eq("response_status", 200),
  ]);

  if (profilesResult.error) {
    throw profilesResult.error;
  }

  if (generationsResult.error) {
    throw generationsResult.error;
  }

  return {
    totalUsers: coerceCount(profilesResult.count),
    totalGenerations: coerceCount(generationsResult.count),
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
      totalUsers: stats.totalUsers,
      totalGenerations: stats.totalGenerations,
    });
  } catch (error: any) {
    console.error("Failed to load public stats", error);
    return res.status(503).json({ error: "Stats unavailable." });
  }
}
