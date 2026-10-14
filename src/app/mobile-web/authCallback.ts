import { completeWebCallback } from "./auth";
import { initializeMobileTelemetry } from "./telemetry";
import { trackMobileAuthComplete } from "./analytics";

/** Queue a verified sign-in before leaving the callback page. */
export async function completeMobileAuthCallback(url: URL) {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const hasCredentials = Boolean(
    url.searchParams.get("code") ||
    (hash.get("access_token") && hash.get("refresh_token")),
  );
  const session = await completeWebCallback(url);
  // URL detection must not race the explicit PKCE exchange above.
  initializeMobileTelemetry();
  if (hasCredentials) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        trackMobileAuthComplete(
          session.user.id,
          session.user.app_metadata?.provider === "google" ? "google" : "email",
        ),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 500);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  return session;
}
