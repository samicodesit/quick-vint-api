import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const session = {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_at: 1_800_000_000,
    token_type: "bearer",
    user: { id: "user-1", email: "seller@example.com" },
  };

  const auth = {
    signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    setSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    exchangeCodeForSession: vi
      .fn()
      .mockResolvedValue({ data: { session }, error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    refreshSession: vi
      .fn()
      .mockResolvedValue({ data: { session }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };

  const client = { auth };
  return {
    session,
    auth,
    client,
    createClient: vi.fn(() => client),
    getMobileWebBuildConfig: vi.fn(() => ({
      enabled: true,
      supabaseUrl: "https://project.supabase.co",
      supabaseAnonKey: "anon-key",
    })),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("../config", () => ({
  getMobileWebBuildConfig: mocks.getMobileWebBuildConfig,
}));

function setBrowser(href = "https://autolister.app/app") {
  const history = { replaceState: vi.fn() };
  vi.stubGlobal("window", {
    location: new URL(href),
    history,
  });
  vi.stubGlobal("location", new URL(href));
  vi.stubGlobal("history", history);
  vi.stubGlobal("document", { body: { textContent: "" } });
  return history;
}

describe("mobile web browser authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBrowser();
  });

  it("creates a persisted browser Supabase session client", async () => {
    const { createBrowserSupabaseClient } = await import("../auth.js");

    expect(createBrowserSupabaseClient()).toBe(mocks.client);
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "anon-key",
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    );
  });

  it("starts Google OAuth at the web callback", async () => {
    const { signInWithGoogle } = await import("../auth.js");

    await signInWithGoogle();

    expect(mocks.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://autolister.app/app/auth/callback" },
    });
  });

  it("requests one backend email containing the action link and OTP", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Magic link sent" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { requestMagicLink } = await import("../auth.js");

    await requestMagicLink(" seller@example.com ");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/magic-link",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "seller@example.com",
          client: "mobile_web",
        }),
      }),
    );
  });

  it("verifies the six-digit email OTP without a second verify button", async () => {
    const { verifyEmailOtp } = await import("../auth.js");

    await verifyEmailOtp("seller@example.com", "123456");

    expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({
      email: "seller@example.com",
      token: "123456",
      type: "email",
    });
  });

  it("cleans the callback URL and uses the web session without refreshing it again", async () => {
    const history = setBrowser(
      "https://autolister.app/app/auth/callback#access_token=secret&refresh_token=refresh-token&expires_in=3600&token_type=bearer",
    );
    const { completeWebCallback } = await import("../auth.js");

    const session = await completeWebCallback(new URL(window.location.href));

    expect(mocks.auth.setSession).toHaveBeenCalledWith({
      access_token: "secret",
      refresh_token: "refresh-token",
    });
    expect(history.replaceState).toHaveBeenCalledWith({}, "", "/app");
    expect(mocks.auth.refreshSession).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("secret");
    expect(session).toEqual(mocks.session);
  });

  it("exchanges a PKCE code and cleans the callback URL", async () => {
    const history = setBrowser(
      "https://autolister.app/app/auth/callback?code=pkce-code",
    );
    const { completeWebCallback } = await import("../auth.js");

    await completeWebCallback(new URL(window.location.href));

    expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(mocks.auth.setSession).not.toHaveBeenCalled();
    expect(history.replaceState).toHaveBeenCalledWith({}, "", "/app");
  });

  it("exposes the browser session, refresh, and sign-out operations", async () => {
    const { getBrowserSession, refreshBrowserSession, signOutBrowser } =
      await import("../auth.js");

    await expect(getBrowserSession()).resolves.toEqual(mocks.session);
    await expect(refreshBrowserSession()).resolves.toEqual(mocks.session);
    await expect(signOutBrowser()).resolves.toBeUndefined();
    expect(mocks.auth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("mobile web API transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBrowser();
  });

  it("sends bearer authentication and parses a JSON response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ remaining: 5 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchMobileJson } = await import("../api.js");

    await expect(fetchMobileJson("/api/user/usage")).resolves.toEqual({
      remaining: 5,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user/usage",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("refreshes once after a 401 and repeats the original request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "expired" }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ remaining: 4 }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchMobileJson } = await import("../api.js");

    await expect(fetchMobileJson("/api/user/usage")).resolves.toEqual({
      remaining: 4,
    });
    expect(mocks.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a typed error and does not repeat writes when retry is disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Generation timed out", code: "timeout" }),
        {
          status: 504,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchMobileJson } = await import("../api.js");

    await expect(
      fetchMobileJson(
        "/api/generate",
        { method: "POST" },
        { retryOn401: false },
      ),
    ).rejects.toMatchObject({
      status: 504,
      code: "timeout",
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
