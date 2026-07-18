(() => {
  const API_BASE = "https://autolister.app";
  const EXTENSION_ID = "mommklhpammnlojjobejddmidmdcalcl";

  const statusEl = document.getElementById("authCallbackStatus");
  const copyEl = document.getElementById("authCallbackCopy");

  function setStatus(message, copy) {
    if (statusEl) statusEl.textContent = message;
    if (copyEl && copy) copyEl.textContent = copy;
  }

  function getParams() {
    const searchParams = new URLSearchParams(window.location.search || "");
    const hashParams = new URLSearchParams(
      String(window.location.hash || "").replace(/^#/, ""),
    );
    return { searchParams, hashParams };
  }

  function getUrlContext() {
    const { searchParams, hashParams } = getParams();
    return {
      hasCode: Boolean(searchParams.get("code")),
      hasAccessToken: Boolean(hashParams.get("access_token")),
      hasRefreshToken: Boolean(hashParams.get("refresh_token")),
      hasError: Boolean(
        hashParams.get("error") ||
        hashParams.get("error_description") ||
        searchParams.get("error") ||
        searchParams.get("error_description"),
      ),
    };
  }

  function track(event, context = {}) {
    fetch(`${API_BASE}/api/events/track`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        source: "web_auth_callback",
        page: "auth_callback",
        context: {
          ...getUrlContext(),
          ...context,
        },
      }),
    }).catch(() => {});
  }

  function getSessionFromUrl() {
    const { hashParams } = getParams();
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    if (!accessToken || !refreshToken) return null;

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Number(hashParams.get("expires_in") || 0) || undefined,
      token_type: hashParams.get("token_type") || "bearer",
    };
  }

  function clearAuthParamsFromUrl() {
    try {
      window.history?.replaceState(
        null,
        document.title,
        `${window.location.origin}${window.location.pathname}`,
      );
    } catch {
      // Best-effort only; auth handoff should not fail because history is blocked.
    }
  }

  function sendAuthHandoff(session) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        reject(new Error("extension_messaging_unavailable"));
        return;
      }

      chrome.runtime.sendMessage(
        EXTENSION_ID,
        { type: "AUTH_HANDOFF", session },
        (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(new Error(lastError.message || "extension_handoff_failed"));
            return;
          }
          if (!response?.ok) {
            reject(new Error(response?.error || "extension_handoff_rejected"));
            return;
          }
          resolve(response);
        },
      );
    });
  }

  async function run() {
    track("auth_link_landed");

    const context = getUrlContext();
    if (context.hasError) {
      track("auth_link_error");
      setStatus(
        "Sign-in link failed.",
        "Please request a new sign-in email from the extension.",
      );
      return;
    }

    const session = getSessionFromUrl();
    if (!session) {
      track("auth_link_missing_tokens");
      setStatus(
        "Sign-in link missing session.",
        "Please request a new sign-in email from the extension.",
      );
      return;
    }
    clearAuthParamsFromUrl();

    try {
      track("auth_extension_handoff_started");
      await sendAuthHandoff(session);
      track("auth_extension_handoff_success");
      setStatus("Signed in.", "You can return to Vinted and keep listing.");
    } catch (error) {
      track("auth_extension_handoff_error", {
        message: String(error?.message || error || "unknown").slice(0, 180),
      });
      setStatus(
        "Could not open the extension.",
        "Open this link in the same Chrome profile where AutoLister AI is installed, then try again.",
      );
    }
  }

  run();
})();
