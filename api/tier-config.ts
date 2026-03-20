import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPublicTierConfigs } from "../utils/tierConfig";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");

  if (_req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (_req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json(getPublicTierConfigs());
}
