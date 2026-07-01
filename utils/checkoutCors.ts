import Cors from "cors";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const vintedOriginPattern =
  /^https:\/\/(?:[\w-]+\.)?vinted\.(?:[a-z]{2,}|co\.[a-z]{2})$/;

const rawOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS || "";
const allowedOrigins = rawOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const checkoutCors = Cors({
  origin: (incomingOrigin, callback) => {
    if (!incomingOrigin) return callback(null, true);
    if (incomingOrigin === "https://autolister.app") return callback(null, true);
    if (incomingOrigin === "https://www.autolister.app") return callback(null, true);
    if (allowedOrigins.includes(incomingOrigin)) return callback(null, true);
    if (vintedOriginPattern.test(incomingOrigin)) return callback(null, true);
    return callback(new Error("CORS origin denied for checkout"), false);
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
});

export function runCheckoutCors(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) => {
    checkoutCors(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

export async function handleCheckoutCors(
  req: VercelRequest,
  res: VercelResponse,
) {
  try {
    await runCheckoutCors(req, res);
  } catch (corsError: any) {
    res
      .status(403)
      .json({ error: corsError.message || "CORS check failed for checkout" });
    return false;
  }

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return false;
  }

  return true;
}
