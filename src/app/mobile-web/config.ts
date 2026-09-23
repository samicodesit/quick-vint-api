export interface MobileWebBuildConfig {
  enabled: boolean;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}

export type MobileWebBuildEnv = Record<string, string | undefined>;

function configError(code: string): Error {
  const error = new Error(code);
  error.name = "MobileWebConfigError";
  return error;
}

function validateSupabaseUrl(value: string | undefined): string {
  if (!value?.trim()) throw configError("missing_supabase_url");

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw configError("invalid_supabase_url");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw configError("invalid_supabase_url");
  }

  return parsed.origin;
}

export function getMobileWebBuildConfig(
  env: MobileWebBuildEnv = {},
): MobileWebBuildConfig {
  if (env.PUBLIC_MOBILE_WEB_APP_ENABLED !== "true") {
    return {
      enabled: false,
      supabaseUrl: null,
      supabaseAnonKey: null,
    };
  }

  const supabaseUrl = validateSupabaseUrl(env.PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseAnonKey) throw configError("missing_supabase_anon_key");

  return { enabled: true, supabaseUrl, supabaseAnonKey };
}
