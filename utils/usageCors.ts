import Cors from "cors";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { CorsOptions } from "cors";
import { isAllowedAppOrigin } from "./allowedOrigins";

export const usageCorsOptions: CorsOptions = {
  origin: (incomingOrigin, callback) => {
    if (isAllowedAppOrigin(incomingOrigin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS origin denied for usage"), false);
  },
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Autolister-Client"],
  preflightContinue: true,
};

const usageCors = Cors(usageCorsOptions);

export function runUsageCors(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) => {
    usageCors(req, res, (err) => (err ? reject(err) : resolve()));
  });
}
