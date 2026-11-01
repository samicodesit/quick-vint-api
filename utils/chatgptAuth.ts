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

/** Call only with claims returned by Supabase getClaims(), which verifies JWTs. */
export function validatePluginClaims(
  claims: Record<string, unknown>,
  config: { issuer: string; clientId: string; users: string[] },
  now = Math.floor(Date.now() / 1000),
): string {
  if (
    !config.clientId ||
    !config.users.length ||
    claims.iss !== config.issuer ||
    claims.aud !== "authenticated" ||
    claims.client_id !== config.clientId ||
    claims.role !== "autolister_plugin" ||
    typeof claims.exp !== "number" ||
    claims.exp <= now ||
    typeof claims.sub !== "string" ||
    !config.users.includes(claims.sub)
  ) {
    throw new Error(
      "This account is not connected to the private AutoLister plugin.",
    );
  }
  return claims.sub;
}
