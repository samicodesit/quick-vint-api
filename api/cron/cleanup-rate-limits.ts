// api/cron/cleanup-rate-limits.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { RateLimiter } from "../../utils/rateLimiter";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Secure the endpoint
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await RateLimiter.cleanupExpiredRecords();
    
    console.log("Rate limit cleanup cron job completed successfully");
    return res.status(200).json({ 
      success: true, 
      message: "Rate limit records cleaned up successfully" 
    });
  } catch (error: any) {
    console.error("Rate limit cleanup cron job failed:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}