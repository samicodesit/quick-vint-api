(function (root) {
  "use strict";
  const crumbs = [];
  let operationId;
  let lastConfirmedStage;
  let account;
  function setAccount(next) {
    if (account !== next) {
      crumbs.length = 0;
      operationId = undefined;
      lastConfirmedStage = undefined;
      account = next;
    }
  }
  const definitions = root.AutoListerEventRegistry || {};
  function eventId() {
    if (root.crypto.randomUUID) return root.crypto.randomUUID();
    const bytes = root.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  const text = (value, limit = 500) =>
    String(value || "")
      .replace(/\b(?:data|blob):[^\s<>"']+/gi, "[url]")
      .replace(/https?:\/\/[^\s<>"']+/gi, "[url]")
      .replace(/\bBearer\s+\S+/gi, "[credential]")
      .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[credential]")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
      .replace(
        /\b(access[_-]?token|refresh[_-]?token|token|secret|password|session[_-]?id|session|authorization|api[_-]?key)["']?\s*[=:]\s*["']?[^\s,;"'}]+/gi,
        "$1=[redacted]",
      )
      .slice(0, limit);
  const policy = root.AutoListerContextPolicy || {};
  const allowed = new Set([
    ...(policy.strings || []),
    ...(policy.numbers || []),
    ...(policy.booleans || []),
  ]);
  function imageContext(value) {
    const result = { sourceUrl: null };
    for (const key of policy.imageStrings || [])
      if (typeof value?.[key] === "string") result[key] = text(value[key], 80);
    for (const key of policy.imageNumbers || [])
      if (Number.isFinite(value?.[key]))
        result[key] = Math.max(0, Math.min(value[key], 1e9));
    for (const key of policy.imageBooleans || [])
      if (typeof value?.[key] === "boolean") result[key] = value[key];
    return result;
  }
  function context(input, trace = false) {
    // Older callers use provider code/status names. Normalize before allowlisting.
    const source = {
      ...input,
      errorCode: input?.errorCode || input?.code,
      statusCode:
        input?.statusCode ??
        (typeof input?.status === "number" ? input.status : undefined),
    };
    const output = {};
    for (const [key, value] of Object.entries(source)) {
      if (allowed.has(key) && typeof value === "string")
        output[key] = text(value);
      if (
        allowed.has(key) &&
        typeof value === "number" &&
        Number.isFinite(value)
      )
        output[key] = value;
      if (allowed.has(key) && typeof value === "boolean") output[key] = value;
    }
    if (Array.isArray(input?.imageSources))
      output.imageSources = input.imageSources.slice(0, 3).map(imageContext);
    if (trace && input?.stack) output.stack = text(input.stack, 2000);
    while (new TextEncoder().encode(JSON.stringify(output)).length > 8192) {
      const key = Object.keys(output)
        .reverse()
        .find(
          (name) =>
            !["errorCode", "stage", "generationAttemptId"].includes(name),
        );
      if (!key) break;
      delete output[key];
    }
    return output;
  }
  function prepare(event, input = {}, source = "extension_content") {
    const definition = definitions[event] || {};
    if (input.generationAttemptId || input.operationId || input.batchId)
      operationId =
        input.generationAttemptId || input.operationId || input.batchId;
    else if (
      definition.kind === "checkpoint" &&
      [
        "generation_requested",
        "uploading",
        "authenticating",
        "batch_running",
        "waiting_for_photos",
      ].includes(definition.stage) &&
      !operationId
    )
      operationId = eventId();
    const critical =
      definition.kind === "incident" || definition.kind === "report";
    const safe = context(input, critical);
    if (operationId) safe.operationId ||= operationId;
    if (lastConfirmedStage) safe.lastConfirmedStage ||= lastConfirmedStage;
    if (definition.stage) lastConfirmedStage = definition.stage;
    const ua = root.navigator?.userAgent || "";
    const ios = /iPhone|iPad|iPod/i.test(ua);
    safe.clientPlatform = ios
      ? "ios"
      : /Android/i.test(ua)
        ? "android"
        : "desktop";
    safe.clientBrowser =
      root.KAGI || /Orion/i.test(ua) || (ios && root.chrome?.runtime?.id)
        ? "orion"
        : /Firefox/i.test(ua)
          ? "firefox"
          : /Edg/i.test(ua)
            ? "edge"
            : /Chrome/i.test(ua)
              ? "chrome"
              : "other";
    safe.browserFamily = safe.clientBrowser;
    if (critical) {
      safe.breadcrumbs = crumbs.slice(-30);
      while (
        new TextEncoder().encode(JSON.stringify(safe)).length > 8192 &&
        safe.breadcrumbs.length
      )
        safe.breadcrumbs.shift();
    }
    // Style examples are a distinct business input, never diagnostic breadcrumbs.
    if (event === "generation_output_edited") {
      for (const key of [
        "generatedTitle",
        "generatedDescription",
        "finalTitle",
        "finalDescription",
      ]) {
        if (typeof input[key] === "string")
          safe[key] = input[key].slice(0, 6000);
      }
    }
    crumbs.push({ stage: definition.stage || event, ...context(input) });
    if (crumbs.length > 30) crumbs.shift();
    return {
      critical,
      event: {
        id: eventId(),
        occurredAt: new Date().toISOString(),
        event,
        source,
        page: root.location
          ? `${root.location.origin}${root.location.pathname}`
          : "background",
        context: safe,
        market: root.location?.hostname
          ?.match(/vinted\.([a-z.]+)$/)?.[1]
          ?.replace("co.uk", "uk"),
        extensionVersion: root.chrome?.runtime?.getManifest?.().version,
      },
    };
  }
  const pending = new Set();
  async function trackOne(
    event,
    input = {},
    source = "extension_content",
    immediate = false,
  ) {
    try {
      const { supabaseSession } =
        await chrome.storage.local.get("supabaseSession");
      setAccount(supabaseSession?.user?.id || null);
      const prepared = prepare(event, input, source);
      if (
        typeof input.sessionId === "string" &&
        input.sessionId &&
        root.crypto?.subtle
      ) {
        const hash = await root.crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(input.sessionId),
        );
        prepared.event.phoneSessionKey = Array.from(
          new Uint8Array(hash),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
      }
      const result = root.AutoListerBackgroundTelemetry
        ? await root.AutoListerBackgroundTelemetry.accept(
            prepared.event,
            supabaseSession?.user?.id || null,
            prepared.critical,
            immediate,
          )
        : await chrome.runtime.sendMessage({
            type: "AUTOLISTER_TELEMETRY",
            event: prepared.event,
            accountId: supabaseSession?.user?.id || null,
            critical: prepared.critical,
            immediate,
          });
      return result || { queued: false };
    } catch {
      return { queued: false, reason: "transport_unavailable" };
    }
  }
  function track(...args) {
    const operation = trackOne(...args);
    pending.add(operation);
    void operation.finally(() => pending.delete(operation));
    return operation;
  }
  async function flush() {
    await Promise.allSettled([...pending]);
    if (root.AutoListerBackgroundTelemetry)
      return root.AutoListerBackgroundTelemetry.flush();
    try {
      return chrome.runtime
        .sendMessage({ type: "AUTOLISTER_TELEMETRY_FLUSH" })
        .catch(() => {});
    } catch {
      return Promise.resolve();
    }
  }
  root.AutoListerTelemetry = {
    track,
    flush,
    prepare,
    sanitize: context,
    setAccount,
  };
  // Content scripts share a page with Vinted. Only capture errors attributed to
  // our packaged scripts, never unrelated host-page JavaScript exceptions.
  root.addEventListener?.("error", (error) => {
    const ownOrigin = root.chrome?.runtime?.getURL?.("");
    if (!ownOrigin || !String(error.filename || "").startsWith(ownOrigin))
      return;
    void track(
      /extension context invalidated|receiving end does not exist|message port closed/i.test(
        String(error.message || ""),
      )
        ? "operation_interrupted"
        : "own_context_exception",
      {
        errorName: error.error?.name,
        message: error.message,
        stack: error.error?.stack,
        operationId,
      },
    );
  });
  root.addEventListener?.("unhandledrejection", (event) => {
    const ownOrigin = root.chrome?.runtime?.getURL?.("");
    if (!ownOrigin || !String(event.reason?.stack || "").includes(ownOrigin))
      return;
    void track(
      /extension context invalidated|receiving end does not exist|message port closed/i.test(
        String(event.reason?.message || ""),
      )
        ? "operation_interrupted"
        : "own_context_exception",
      {
        errorName: event.reason?.name,
        message: event.reason?.message,
        stack: event.reason?.stack,
        operationId,
      },
    );
  });
})(globalThis);
