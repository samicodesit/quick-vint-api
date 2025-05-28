import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VERCEL_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.VERCEL_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Supabase URL or Anon Key is missing. Check Vercel environment variables: VERCEL_APP_SUPABASE_URL and VERCEL_APP_SUPABASE_ANON_KEY"
  );
  // Throwing an error here will prevent functions from running without proper config.
  // Depending on deployment, this might cause server startup failure or function errors.
  throw new Error("Supabase configuration is incomplete.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
