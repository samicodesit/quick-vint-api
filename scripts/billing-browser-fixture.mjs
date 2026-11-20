export async function signInFixture(
  context,
  accountId = "123e4567-e89b-42d3-a456-426614174000",
) {
  await context.addInitScript((id) => {
    const encode = (value) =>
      btoa(JSON.stringify(value))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    const user = {
      id,
      email: "fixture@example.test",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
    };
    const expires = Math.floor(Date.now() / 1000) + 36000;
    localStorage.setItem(
      "sb-drafts-test-auth-token",
      JSON.stringify({
        access_token:
          encode({ alg: "HS256", typ: "JWT" }) +
          "." +
          encode({ sub: user.id, exp: expires, role: "authenticated" }) +
          ".fixture",
        refresh_token: "fixture",
        expires_at: expires,
        expires_in: 36000,
        token_type: "bearer",
        user,
      }),
    );
  }, accountId);
}
