/** Decoding is used only to deny access, never to establish identity. */
export function isOAuthToken(token: string): boolean {
  try {
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    );
    return Boolean(claims.client_id || claims.role === "autolister_plugin");
  } catch {
    return false;
  }
}

type PluginAccess = { users: string[]; publicAccess?: boolean };

export function pluginAccessConfig(): PluginAccess {
  return {
    publicAccess: process.env.CHATGPT_PLUGIN_ACCESS === "public",
    users: (process.env.CHATGPT_PRIVATE_USER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  };
}

/** Identity must already have been verified by Supabase. */
export function isPluginUserAllowed(
  user: unknown,
  config: PluginAccess,
): user is string {
  return (
    typeof user === "string" &&
    user.length > 0 &&
    (config.publicAccess === true || config.users.includes(user))
  );
}

/** Call only with claims returned by Supabase getClaims(), which verifies JWTs. */
export function validatePluginClaims(
  claims: Record<string, unknown>,
  config: { issuer: string; clientId: string } & PluginAccess,
  now = Math.floor(Date.now() / 1000),
): string {
  if (
    !config.clientId ||
    claims.iss !== config.issuer ||
    claims.aud !== "authenticated" ||
    claims.client_id !== config.clientId ||
    claims.role !== "autolister_plugin" ||
    typeof claims.exp !== "number" ||
    claims.exp <= now ||
    !isPluginUserAllowed(claims.sub, config)
  ) {
    throw new Error(
      "This account is not connected to the private AutoLister plugin.",
    );
  }
  return claims.sub;
}
