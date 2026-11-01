import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hostedPluginRequest } from "../../utils/chatgptHosted";
// Two 8s ledger calls and one 18s bounded upstream download, plus streaming.
export const maxDuration = 45;
export default function handler(req: VercelRequest, res: VercelResponse) {
  return hostedPluginRequest(req, res, "handoff");
}
