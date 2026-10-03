/* Shared metadata policy. Adapters own fetch, Chrome messaging and UI. */
(function (root) {
  "use strict";
  const BACKOFF = [700, 1500];
  const DEADLINE = 30000;
  const QUICK_WINDOW = 3000;
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function failure(response, attempts, retryAt = 0) {
    return Object.assign(
      new Error(
        response?.data?.error ||
          response?.error ||
          "Could not finish the phone upload. Please retry.",
      ),
      {
        code: response?.data?.code || response?.code || "PHONE_METADATA_FAILED",
        retryable: response?.data?.retryable ?? response?.retryable,
        status: response?.status,
        attempts,
        retryAt,
      },
    );
  }
  function retryAfterMs(value, now) {
    if (value == null || value === "") return 0;
    if (/^\d+(\.\d+)?$/.test(String(value))) return Number(value) * 1000;
    return Math.max(0, (Date.parse(value) || 0) - now);
  }
  async function run(options) {
    const now = options.now || Date.now;
    const wait = options.wait || pause;
    const random = options.random || Math.random;
    const setTimer = options.setTimer || setTimeout;
    const clearTimer = options.clearTimer || clearTimeout;
    const active = options.active || (() => true);
    const deadline = now() + DEADLINE;
    let transient = 0;
    let recovered = false;
    function checkActive() {
      if (!active())
        throw Object.assign(new Error("Upload cancelled or replaced"), {
          code: "PHONE_OPERATION_CANCELLED",
          retryable: false,
        });
    }
    for (let attempt = 0; attempt < (options.settling ? 8 : 3); attempt++) {
      checkActive();
      const remaining = deadline - now();
      if (remaining <= 0)
        throw failure(
          { code: "PHONE_OPERATION_TIMEOUT", retryable: true },
          attempt,
        );
      const controller = new AbortController();
      const timeoutMs = Math.min(10000, remaining);
      let timer;
      let response;
      try {
        response = await Promise.race([
          Promise.resolve().then(() =>
            options.request({ signal: controller.signal, timeoutMs }),
          ),
          new Promise((_, reject) => {
            timer = setTimer(() => {
              controller.abort();
              reject(
                Object.assign(new Error("Upload request timed out"), {
                  code: "PHONE_REQUEST_TIMEOUT",
                  retryable: true,
                }),
              );
            }, timeoutMs);
          }),
        ]);
      } catch (error) {
        response = {
          ok: false,
          error: error?.message,
          code: error?.code,
          retryable: /Extension context invalidated|cancelled|replaced/i.test(
            error?.message || "",
          )
            ? false
            : error?.retryable,
        };
      } finally {
        clearTimer(timer);
      }
      checkActive(); // Ignore a response from a previous session, even a success.
      if (now() >= deadline)
        throw failure(
          { ...response, code: "PHONE_OPERATION_TIMEOUT" },
          attempt + 1,
        );
      const settling =
        options.settling &&
        response?.status >= 200 &&
        response?.status < 300 &&
        (response.status === 202 || response.data?.settling === true);
      if (response?.ok && !settling && response.data?.complete !== false) {
        if (recovered) options.onRecovered?.({ attempts: attempt + 1 });
        return response;
      }
      let delay;
      if (settling) {
        delay = 900;
      } else {
        const retryable =
          (response?.data?.retryable ?? response?.retryable) !== false &&
          (!response?.status ||
            [408, 429].includes(response.status) ||
            response.status >= 500);
        const retryAfter = retryAfterMs(response.retryAfter, now());
        if (!retryable || ++transient >= 3)
          throw failure(
            response,
            attempt + 1,
            retryAfter ? now() + retryAfter : 0,
          );
        if (retryAfter > QUICK_WINDOW || retryAfter >= deadline - now())
          throw failure(response, attempt + 1, now() + retryAfter);
        delay = Math.max(
          Math.round(
            BACKOFF[transient - 1] *
              (1 + Math.max(0, Math.min(1, random())) * 0.2),
          ),
          retryAfter,
        );
        recovered = true;
        options.onRetry?.({
          attempts: attempt + 1,
          code: response?.data?.code || response?.code,
          delay,
        });
      }
      if (attempt === (options.settling ? 7 : 2) || delay >= deadline - now())
        throw failure(response, attempt + 1);
      await wait(delay);
    }
    throw failure(null, 8);
  }
  const api = { run, retryAfterMs };
  root.AutoListerPhoneRecovery = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
