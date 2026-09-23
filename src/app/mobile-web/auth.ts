import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { getMobileWebBuildConfig, type MobileWebBuildEnv } from "./config";
import type { MobileWebRuntimeConfig } from "./types";

const MOBILE_MAGIC_LINK_ENDPOINT = "/api/auth/magic-link";
const MOBILE_CALLBACK_PATH = "/app/auth/callback";

let browserClient: SupabaseClient | null = null;

function getPublicBuildEnv(): MobileWebBuildEnv {
  const runtimeConfig: MobileWebRuntimeConfig | undefined =
    typeof window === "undefined"
      ? undefined
      : window.__AUTOLISTER_MOBILE_WEB_CONFIG__;
  if (!runtimeConfig) return {};
  return {
    PUBLIC_MOBILE_WEB_APP_ENABLED: "true",
    PUBLIC_SUPABASE_URL: runtimeConfig.supabaseUrl,
    PUBLIC_SUPABASE_ANON_KEY: runtimeConfig.supabaseAnonKey,
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function authError(code: string, cause?: unknown, message?: string): Error {
  const error = new Error(message?.trim() || code);
  error.name = "MobileWebAuthError";
  Object.defineProperty(error, "code", {
    value: code,
    enumerable: true,
  });
  if (cause && typeof cause === "object" && "status" in cause) {
    Object.defineProperty(error, "status", {
      value: (cause as { status?: unknown }).status,
      enumerable: true,
    });
  }
  return error;
}

function createSupabaseClient(detectSessionInUrl: boolean): SupabaseClient {
  const config = getMobileWebBuildConfig(getPublicBuildEnv());
  if (!config.enabled || !config.supabaseUrl || !config.supabaseAnonKey) {
    throw authError("mobile_web_disabled");
  }

  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl,
    },
  });
}

function getCallbackRedirectUrl(): string {
  return `${window.location.origin}${MOBILE_CALLBACK_PATH}`;
}

function cleanCallbackUrl() {
  window.history.replaceState({}, "", "/app");
}

async function readResponseBody(
  response: Response,
): Promise<Record<string, unknown>> {
  try {
    const body = await response.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function createBrowserSupabaseClient(): SupabaseClient {
  if (browserClient) return browserClient;

  browserClient = createSupabaseClient(true);

  return browserClient;
}

export async function signInWithGoogle() {
  const { data, error } =
    await createBrowserSupabaseClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getCallbackRedirectUrl() },
    });
  if (error) throw authError("google_sign_in_failed", error);
  return data;
}

export async function requestMagicLink(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw authError("invalid_email");

  let response: Response;
  try {
    response = await fetch(MOBILE_MAGIC_LINK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, client: "mobile_web" }),
    });
  } catch {
    throw authError("magic_link_request_failed");
  }

  const body = await readResponseBody(response);
  if (!response.ok) {
    const code =
      typeof body.code === "string" && body.code.trim()
        ? body.code
        : `magic_link_http_${response.status}`;
    throw authError(
      code,
      { status: response.status },
      getErrorMessage(body.error, "Unable to send the sign-in email."),
    );
  }

  return body;
}

export async function verifyEmailOtp(
  email: string,
  token: string,
): Promise<Session> {
  const { data, error } = await createBrowserSupabaseClient().auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "email",
  });
  if (error || !data.session)
    throw authError("email_otp_verification_failed", error);
  return data.session;
}

export async function completeWebCallback(url: URL | string): Promise<Session> {
  const callbackUrl = typeof url === "string" ? new URL(url) : url;
  // The browser client intentionally detects URL sessions for normal app
  // startup. Callback handling is explicit, so a second client disables URL
  // detection to prevent Supabase's auto-initializer from exchanging a PKCE
  // code before this function can handle it.
  const client = createSupabaseClient(false);

  try {
    const code = callbackUrl.searchParams.get("code");
    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error || !data.session)
        throw authError("auth_callback_exchange_failed");
      cleanCallbackUrl();
      return data.session;
    }

    const hash = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (accessToken && refreshToken) {
      const { data, error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error || !data.session)
        throw authError("auth_callback_session_failed");
      cleanCallbackUrl();
      return data.session;
    }

    const { data, error } = await client.auth.getSession();
    if (error || !data.session)
      throw authError("auth_callback_missing_session");
    cleanCallbackUrl();
    return data.session;
  } catch (error) {
    cleanCallbackUrl();
    if (error instanceof Error && error.name === "MobileWebAuthError")
      throw error;
    throw authError("auth_callback_failed", error);
  }
}

export async function getBrowserSession(): Promise<Session | null> {
  const { data, error } = await createBrowserSupabaseClient().auth.getSession();
  if (error) throw authError("session_read_failed", error);
  return data.session;
}

export async function refreshBrowserSession(): Promise<Session | null> {
  const { data, error } =
    await createBrowserSupabaseClient().auth.refreshSession();
  if (error) throw authError("session_refresh_failed", error);
  return data.session;
}

export async function signOutBrowser(): Promise<void> {
  const { error } = await createBrowserSupabaseClient().auth.signOut();
  if (error) throw authError("sign_out_failed", error);
}
