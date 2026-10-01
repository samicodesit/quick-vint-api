(() => {
  const API_BASE = "https://autolister.app";
  const EXTENSION_ID = "mommklhpammnlojjobejddmidmdcalcl";
  const SUCCESS_CLOSE_DELAY_MS = 3400;
  const ATTRIBUTION_CLAIM_TIMEOUT_MS = 1500;
  const FIRST_TOUCH_STORAGE_KEY = "autolister.first_touch.v1";
  const ATTRIBUTION_SOURCES = new Set([
    "x",
    "tiktok",
    "instagram",
    "youtube",
    "facebook",
    "linkedin",
    "reddit",
    "google",
    "direct",
    "unknown",
  ]);
  const ATTRIBUTION_MEDIA = new Set([
    "organic_social",
    "paid_social",
    "referral",
    "search",
    "email",
    "direct",
    "unknown",
  ]);
  const ATTRIBUTION_REFERRERS = new Set([
    "x.com",
    "www.x.com",
    "twitter.com",
    "www.twitter.com",
    "t.co",
    "tiktok.com",
    "www.tiktok.com",
    "vm.tiktok.com",
    "instagram.com",
    "www.instagram.com",
    "youtube.com",
    "www.youtube.com",
    "youtu.be",
    "facebook.com",
    "www.facebook.com",
    "linkedin.com",
    "www.linkedin.com",
    "reddit.com",
    "www.reddit.com",
    "google.com",
    "www.google.com",
  ]);

  const cardEl = document.getElementById("authCallbackCard");
  const statusEl = document.getElementById("authCallbackStatus");
  const copyEl = document.getElementById("authCallbackCopy");
  const countdownEl = document.getElementById("authCountdown");

  function setStatus(message, copy, state = "") {
    if (cardEl && state) cardEl.dataset.state = state;
    if (statusEl) statusEl.textContent = message;
    if (copyEl && copy) copyEl.textContent = copy;
  }

  function normalizeAttributionSlug(value) {
    if (typeof value !== "string") return null;
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return normalized || null;
  }

  function readFirstTouchAttribution() {
    try {
      const raw = window.localStorage?.getItem(FIRST_TOUCH_STORAGE_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
      const source = typeof value.source === "string" ? value.source : "";
      const medium = typeof value.medium === "string" ? value.medium : "";
      const capturedAt =
        typeof value.capturedAt === "string" &&
        Number.isFinite(Date.parse(value.capturedAt))
          ? new Date(value.capturedAt).toISOString()
          : null;
      if (!ATTRIBUTION_SOURCES.has(source) || !ATTRIBUTION_MEDIA.has(medium)) {
        return null;
      }
      if (!capturedAt) return null;

      let referrerHost = null;
      if (typeof value.referrerHost === "string") {
        const candidate = value.referrerHost
          .trim()
          .toLowerCase()
          .replace(/\.$/, "");
        if (ATTRIBUTION_REFERRERS.has(candidate)) referrerHost = candidate;
      }

      return {
        source,
        medium,
        campaign: normalizeAttributionSlug(value.campaign),
        content: normalizeAttributionSlug(value.content),
        capturedAt,
        referrerHost,
      };
    } catch {
      return null;
    }
  }

  function removeFirstTouchAttribution() {
    try {
      window.localStorage?.removeItem(FIRST_TOUCH_STORAGE_KEY);
    } catch {
      // Storage is optional. A failed cleanup must not affect authentication.
    }
  }

  function claimFirstTouchAttribution(session) {
    const attribution = readFirstTouchAttribution();
    if (!attribution || typeof session?.access_token !== "string") {
      return Promise.resolve(false);
    }

    let controller = null;
    let timeoutId = null;
    if (typeof AbortController === "function") {
      controller = new AbortController();
      timeoutId = setTimeout(
        () => controller.abort(),
        ATTRIBUTION_CLAIM_TIMEOUT_MS,
      );
    }

    const request = {
      method: "POST",
      keepalive: true,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ attribution }),
      ...(controller ? { signal: controller.signal } : {}),
    };

    let claimRequest;
    try {
      claimRequest = fetch(`${API_BASE}/api/attribution/claim`, request);
    } catch {
      if (timeoutId !== null) clearTimeout(timeoutId);
      return Promise.resolve(false);
    }

    return claimRequest
      .then((response) => {
        if (response?.ok) {
          removeFirstTouchAttribution();
          return true;
        }
        if (response?.status === 400) {
          removeFirstTouchAttribution();
        }
        return false;
      })
      .catch(() => false)
      .finally(() => {
        if (timeoutId !== null) clearTimeout(timeoutId);
      });
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

      const message = {
        type: "AUTH_HANDOFF",
        closeDelayMs: SUCCESS_CLOSE_DELAY_MS,
        session,
      };
      chrome.runtime.sendMessage(EXTENSION_ID, message, (response) => {
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
      });
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
    // Claim in the website while the magic-link bearer is available. This is
    // deliberately independent of extension messaging, and never gates auth.
    void claimFirstTouchAttribution(session);

    try {
      track("auth_extension_handoff_started");
      await sendAuthHandoff(session);
      track("auth_extension_handoff_success");
      setStatus("Signed in.", "This tab will close shortly.", "success");
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
