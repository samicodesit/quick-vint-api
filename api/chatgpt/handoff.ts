import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hostedPluginRequest } from "../../utils/chatgptHosted";
export const maxDuration = 30;
export default function handler(req: VercelRequest, res: VercelResponse) {
  return hostedPluginRequest(req, res, "handoff");
}
