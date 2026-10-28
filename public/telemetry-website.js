(function (root) {
  "use strict";
  let database;
  let identityProvider = async () => null;
  let timer;
  let contextProvider = async () => ({});
  // Website-only context stays here so the extension asset sync cannot remove it.
  function safeExceptionProvenance(value) {
    if (
      value?.version !== 1 ||
      !["error", "unhandledrejection"].includes(value.capture)
    )
      return;
    const location = (input) => {
      if (
        !root.AutoListerContextPolicy?.exceptionSources?.includes(input?.source)
      )
        return;
      const result = { source: input.source };
      for (const key of ["line", "column"])
        if (Number.isInteger(input[key]) && input[key] > 0 && input[key] <= 1e7)
          result[key] = input[key];
      return result;
    };
    const primary = location(value.location);
    return {
      version: 1,
      capture: value.capture,
      ...(value.pageRuntime === 1 ? { pageRuntime: 1 } : {}),
      ...(primary ? { location: primary } : {}),
      frames: Array.isArray(value.frames)
        ? value.frames.slice(0, 3).map(location).filter(Boolean)
        : [],
    };
  }
  function openDatabase() {
    if (!database)
      database = new Promise((resolve, reject) => {
        const request = indexedDB.open("autolister-telemetry", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("queue");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(new Error("telemetry storage blocked"));
      }).catch((error) => {
        database = null;
        throw error;
      });
    return database;
  }
  const storage = {
    async transact(fn) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("queue", "readwrite");
        const store = transaction.objectStore("queue");
        const request = store.get("state");
        let result;
        request.onsuccess = () => {
          try {
            const state = request.result || { events: [], dropped: 0 };
            result = fn(state);
            store.put(state, "state");
          } catch (error) {
            transaction.abort();
            reject(error);
          }
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () =>
          reject(
            transaction.error || new Error("telemetry transaction aborted"),
          );
      });
    },
  };
  const queue = root.AutoListerTelemetryCore.createQueue({
    storage,
    identity: () => identityProvider(),
    send: async (body, token) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch("/api/events/track", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        });
        const payload = [200, 503].includes(response.status)
          ? await response.json()
          : {};
        return {
          status: response.status,
          headers: response.headers,
          json: async () => payload,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  });
  async function track(event, properties = {}, immediate = false) {
    try {
      properties = { ...(await contextProvider()), ...properties };
      const current = await identityProvider();
      root.AutoListerTelemetry.setAccount(current?.id || null);
      const prepared = root.AutoListerTelemetry.prepare(
        event,
        properties.context || {},
        properties.source || "website",
      );
      if (
        event === "own_context_exception" &&
        properties.source === "phone_upload_page"
      ) {
        const provenance = safeExceptionProvenance(
          properties.context?.exceptionProvenance,
        );
        // Bound the complete context again after the website-specific addition.
        if (
          provenance &&
          new TextEncoder().encode(
            JSON.stringify({
              ...prepared.event.context,
              exceptionProvenance: provenance,
            }),
          ).length <= 8192
        )
          prepared.event.context.exceptionProvenance = provenance;
      }
      prepared.event.page = properties.page || root.location.pathname;
      prepared.event.plan = properties.plan;
      prepared.event.utm = properties.utm;
      prepared.event.extensionVersion = properties.extensionVersion;
      // Legacy uninstall attribution is explicitly unverified by the server.
      if (properties.source === "uninstall_page")
        prepared.event.userId = properties.userId;
      if (properties.phoneSessionKey)
        prepared.event.phoneSessionKey = properties.phoneSessionKey;
      const result = await queue.enqueue(
        prepared.event,
        current?.id || null,
        prepared.critical,
      );
      if (!result.queued) return result;
      if (prepared.critical || immediate) {
        const delivery = await queue.flush();
        return {
          ...result,
          accepted:
            delivery.acknowledgedIds?.includes(prepared.event.id) || false,
          report: delivery.reports?.[prepared.event.id],
        };
      }
      if (!timer)
        timer = setTimeout(() => {
          timer = null;
          void queue.flush();
        }, 1200);
      return result;
    } catch {
      return { queued: false };
    }
  }
  root.AutoListerWebsiteTelemetry = {
    track,
    flush: queue.flush,
    setContextProvider(provider) {
      contextProvider = provider;
    },
    setIdentityProvider(provider) {
      identityProvider = provider;
      void queue.flush();
    },
  };
  root.addEventListener?.("online", () => {
    void queue.flush();
  });
  root.addEventListener?.("pageshow", () => {
    void queue.flush();
  });
  // Page closure does not delete the queue. The next visit/reconnection resumes it.
  root.addEventListener?.("pagehide", () => {
    void queue.flush();
  });
  root.setInterval?.(() => {
    if (root.document?.visibilityState === "visible") void queue.flush();
  }, 60000);
  const ownScript = (value, lineNumber) => {
    // An empty filename resolves to this page, but proves no script ownership.
    if (typeof value !== "string" || !value.trim()) return false;
    try {
      const url = new URL(value, root.location.href);
      return (
        url.origin === root.location.origin &&
        (/\.js$/.test(url.pathname) ||
          (Number.isFinite(lineNumber) &&
            lineNumber > 0 &&
            /^\/(?:phone-upload|uninstall|auth\/callback)$/.test(url.pathname)))
      );
    } catch {
      return false;
    }
  };
  const ownStack = (stack) => {
    const frames = String(stack || "").match(/https?:[^\s)]+/g) || [];
    return frames.some((frame) => {
      const position = frame.match(/:(\d+)(?::\d+)?$/);
      return ownScript(
        frame.replace(/:\d+(?::\d+)?$/, ""),
        Number(position?.[1]),
      );
    });
  };
  // Keep only fixed script labels and coordinates before URL redaction. A frame
  // can be an external throw site even when an owned caller admitted the event.
  const phoneExceptionProvenance = (capture, event, stack) => {
    if (root.location.pathname !== "/phone-upload") return;
    try {
      const known = {
        "/phone-upload": "phone_page",
        "/phone-upload-runtime.js": "phone_runtime",
        "/phone-upload-recovery.js": "phone_recovery",
        "/telemetry-registry.js": "telemetry_registry",
        "/telemetry-core.js": "telemetry_core",
        "/telemetry-client.js": "telemetry_client",
        "/telemetry-website.js": "telemetry_website",
        "/dng-preview.js": "dng_preview",
      };
      const location = (filename, line, column) => {
        let source = "opaque";
        if (typeof filename === "string" && filename.trim()) {
          try {
            const url = new URL(filename, root.location.href);
            if (["http:", "https:"].includes(url.protocol))
              source =
                url.origin === root.location.origin
                  ? known[url.pathname] || "same_origin_other"
                  : "external";
          } catch {
            // One malformed frame must not discard the other locations.
          }
        }
        const result = { source };
        if (Number.isInteger(line) && line > 0 && line <= 1e7)
          result.line = line;
        if (Number.isInteger(column) && column > 0 && column <= 1e7)
          result.column = column;
        return result;
      };
      const frames =
        (typeof stack === "string" ? stack.slice(0, 6000) : "").match(
          /(?:https?:\/\/|blob:|data:)[^\s)]+/g,
        ) || [];
      return {
        version: 1,
        capture,
        ...(root.document?.querySelector?.(
          'script[data-autolister-phone-runtime="1"]',
        )
          ? { pageRuntime: 1 }
          : {}),
        ...(capture === "error"
          ? { location: location(event.filename, event.lineno, event.colno) }
          : {}),
        frames: frames.slice(0, 3).map((frame) => {
          const position = frame.match(/:(\d+)(?::(\d+))?$/);
          return location(
            frame.replace(/:\d+(?::\d+)?$/, ""),
            Number(position?.[1]),
            Number(position?.[2]),
          );
        }),
      };
    } catch {
      // Diagnostics must never interrupt photo handling or error delivery.
      return;
    }
  };
  root.addEventListener?.("error", (event) => {
    if (
      !ownScript(event.filename, event.lineno) &&
      !ownStack(event.error?.stack)
    )
      return;
    void track("own_context_exception", {
      context: {
        errorName: event.error?.name,
        message: event.message,
        stack: event.error?.stack,
        exceptionProvenance: phoneExceptionProvenance(
          "error",
          event,
          event.error?.stack,
        ),
      },
    });
  });
  root.addEventListener?.("unhandledrejection", (event) => {
    if (!ownStack(event.reason?.stack)) return;
    void track("own_context_exception", {
      context: {
        errorName: event.reason?.name,
        message: event.reason?.message,
        stack: event.reason?.stack,
        exceptionProvenance: phoneExceptionProvenance(
          "unhandledrejection",
          event,
          event.reason?.stack,
        ),
      },
    });
  });
  void queue.flush();
})(globalThis);
