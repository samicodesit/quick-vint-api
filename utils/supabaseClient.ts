import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VERCEL_APP_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error(
    "Supabase URL or Service Key is missing. Check Vercel environment variables: VERCEL_APP_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
  );
  // Throwing an error here will prevent functions from running without proper config.
  // Depending on deployment, this might cause server startup failure or function errors.
  throw new Error("Supabase configuration is incomplete.");
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
