import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VERCEL_APP_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// During static build, environment variables may not be available
// We create a mock client that will throw only when actually used
function createSafeSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    // Return a proxy that throws when any method is called
    return new Proxy({} as ReturnType<typeof createClient>, {
      get(target, prop) {
        if (prop === 'auth' || prop === 'from' || prop === 'storage') {
          return new Proxy({}, {
            get() {
              return () => {
                throw new Error(
                  'Supabase configuration is incomplete. Check VERCEL_APP_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
                );
              };
            }
          });
        }
        return target[prop as keyof typeof target];
      }
    });
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

export const supabase = createSafeSupabaseClient();
