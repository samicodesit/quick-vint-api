(() => {
  const API_BASE = "https://autolister.app";
  const EXTENSION_ID = "mommklhpammnlojjobejddmidmdcalcl";
  const SUCCESS_CLOSE_DELAY_MS = 3400;

  const cardEl = document.getElementById("authCallbackCard");
  const statusEl = document.getElementById("authCallbackStatus");
  const copyEl = document.getElementById("authCallbackCopy");
  const countdownEl = document.getElementById("authCountdown");

  function setStatus(message, copy, state = "") {
    if (cardEl && state) cardEl.dataset.state = state;
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
        { type: "AUTH_HANDOFF", closeDelayMs: SUCCESS_CLOSE_DELAY_MS, session },
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

  function shouldFallbackToExtensionCallback(error) {
    return /extension_messaging_unavailable|extension_handoff_failed|message port closed|receiving end does not exist/i.test(
      String(error?.message || error || ""),
    );
  }

  function buildExtensionCallbackUrl(session) {
    const hashParams = new URLSearchParams();
    hashParams.set("access_token", session.access_token);
    hashParams.set("refresh_token", session.refresh_token);
    if (session.expires_in) {
      hashParams.set("expires_in", String(session.expires_in));
    }
    if (session.token_type) {
      hashParams.set("token_type", session.token_type);
    }
    return `chrome-extension://${EXTENSION_ID}/callback.html#${hashParams.toString()}`;
  }

  function startSuccessCountdown() {
    let remaining = 3;
    const tick = () => {
      if (countdownEl) countdownEl.textContent = String(Math.max(remaining, 1));
      remaining -= 1;
      if (remaining > 0) {
        setTimeout(tick, 1000);
        return;
      }
      setTimeout(() => {
        if (countdownEl) countdownEl.textContent = "Closing";
        window.close();
      }, 1000);
    };
    tick();
  }

  async function run() {
    track("auth_link_landed");

    const context = getUrlContext();
    if (context.hasError) {
      track("auth_link_error");
      setStatus(
        "Sign-in link failed.",
        "Please request a new sign-in email from the extension.",
        "error",
      );
      return;
    }

    const session = getSessionFromUrl();
    if (!session) {
      track("auth_link_missing_tokens");
      setStatus(
        "Sign-in link missing session.",
        "Please request a new sign-in email from the extension.",
        "error",
      );
      return;
    }
    clearAuthParamsFromUrl();

    try {
      track("auth_extension_handoff_started");
      await sendAuthHandoff(session);
      track("auth_extension_handoff_success");
      setStatus("Signed in.", "This tab will close automatically.", "success");
      startSuccessCountdown();
    } catch (error) {
      track("auth_extension_handoff_error", {
        message: String(error?.message || error || "unknown").slice(0, 180),
      });
      if (shouldFallbackToExtensionCallback(error)) {
        track("auth_extension_callback_fallback");
        setStatus(
          "Opening the extension.",
          "Finish sign-in in AutoLister AI.",
          "success",
        );
        window.location.href = buildExtensionCallbackUrl(session);
        return;
      }
      setStatus(
        "Could not open the extension.",
        "Open this link in the same Chrome profile where AutoLister AI is installed, then try again.",
        "error",
      );
    }
  }

  run();
})();
