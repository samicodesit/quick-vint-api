import Cors from "cors";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAllowedAppOrigin, isAllowedVintedOrigin } from "./allowedOrigins";

const checkoutCors = Cors({
  origin: (incomingOrigin, callback) => {
    if (!incomingOrigin) return callback(null, true);
    if (isAllowedAppOrigin(incomingOrigin)) return callback(null, true);
    if (isAllowedVintedOrigin(incomingOrigin)) return callback(null, true);
    return callback(new Error("CORS origin denied for checkout"), false);
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Autolister-Client"],
  preflightContinue: true,
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
