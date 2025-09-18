// api/admin/emergency-brake.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../utils/supabaseClient";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Secure the endpoint with admin secret
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || req.headers.authorization !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, reason } = req.body;

  try {
    if (action === "enable") {
      // Enable emergency brake - stops all API calls
      await supabase
        .from('system_settings')
        .upsert({
          key: 'emergency_brake',
          value: 'true',
          reason: reason || 'Manual activation',
          updated_at: new Date().toISOString()
        });

      console.log(`🚨 EMERGENCY BRAKE ENABLED: ${reason}`);
      return res.status(200).json({ 
        success: true, 
        message: "Emergency brake enabled - all API calls are now blocked",
        reason 
      });
      
    } else if (action === "disable") {
      // Disable emergency brake - restore normal operation
      await supabase
        .from('system_settings')
        .upsert({
          key: 'emergency_brake',
          value: 'false',
          reason: reason || 'Manual deactivation',
          updated_at: new Date().toISOString()
        });

      console.log(`✅ Emergency brake disabled: ${reason}`);
      return res.status(200).json({ 
        success: true, 
        message: "Emergency brake disabled - API calls resumed",
        reason 
      });
      
    } else {
      return res.status(400).json({ error: "Invalid action. Use 'enable' or 'disable'" });
    }

  } catch (error: any) {
    console.error("Error toggling emergency brake:", error);
    return res.status(500).json({ error: error.message });
  }
}