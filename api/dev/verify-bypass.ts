import { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { bypass_key } = req.body;

    // Check if the bypass key matches our environment variable
    const validBypassKey = process.env.DEV_BYPASS_KEY;

    if (!validBypassKey) {
      return res.status(500).json({
        valid: false,
        error: "Bypass not configured",
      });
    }

    if (bypass_key && bypass_key === validBypassKey) {
      return res.status(200).json({
        valid: true,
        bypass: true,
        message: "Developer bypass authenticated",
      });
    } else {
      return res.status(401).json({
        valid: false,
        error: "Invalid bypass key",
      });
    }
  } catch (error: any) {
    console.error("Dev bypass verification error:", error);
    return res.status(500).json({
      valid: false,
      error: "Failed to verify bypass",
    });
  }
}
