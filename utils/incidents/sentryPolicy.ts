import { redact, sanitizeContext } from "./contract";

function safeUrl(value: unknown) {
  try {
    const url = new URL(String(value));
    if (!["http:", "https:", "chrome-extension:"].includes(url.protocol))
      return "[url]";
    return `${url.origin}${url.pathname}`.slice(0, 250);
  } catch {
    return redact(value, 250);
  }
}

export function sanitizeSentryEvent(event: any) {
  const safe: any = Object.fromEntries(
    [
      "event_id",
      "timestamp",
      "platform",
      "level",
      "release",
      "environment",
      "exception",
      "message",
      "user",
      "request",
      "tags",
      "breadcrumbs",
    ]
      .filter((key) => event[key] !== undefined)
      .map((key) => [key, event[key]]),
  );
  delete safe.extra;
  delete safe.contexts;
  delete safe.logentry;
  delete safe.threads;
  delete safe.server_name;
  if (safe.message) safe.message = redact(safe.message);
  if (safe.user) safe.user = { id: safe.user.id };
  if (safe.request)
    safe.request = {
      method: safe.request.method,
      url: safeUrl(safe.request.url),
    };
  safe.tags = Object.fromEntries(
    Object.entries(safe.tags || {})
      .filter(([key]) =>
        [
          "endpoint",
          "status",
          "critical_endpoint",
          "stage",
          "market",
          "incidentId",
          "release",
        ].includes(key),
      )
      .map(([key, value]) => [key, redact(value, 120)]),
  );
  safe.breadcrumbs = (safe.breadcrumbs || []).slice(-30).map((crumb: any) => ({
    category: redact(crumb.category, 80),
    message: redact(crumb.message, 200),
    level: crumb.level,
    timestamp: crumb.timestamp,
    data: sanitizeContext(crumb.data, false),
  }));
  if (safe.exception?.values)
    safe.exception = {
      values: safe.exception.values.slice(-5).map((exception: any) => ({
        type: redact(exception.type, 120),
        value: redact(exception.value),
        mechanism: exception.mechanism
          ? {
              type: exception.mechanism.type,
              handled: exception.mechanism.handled,
            }
          : undefined,
        stacktrace: exception.stacktrace
          ? {
              frames: (exception.stacktrace.frames || [])
                .slice(-40)
                .map((frame: any) => ({
                  filename: safeUrl(frame.filename),
                  function: redact(frame.function, 120),
                  lineno: frame.lineno,
                  colno: frame.colno,
                  in_app: frame.in_app,
                })),
            }
          : undefined,
      })),
    };
  while (
    Buffer.byteLength(JSON.stringify(safe)) > 8192 &&
    safe.breadcrumbs?.length
  )
    safe.breadcrumbs.shift();
  while (
    Buffer.byteLength(JSON.stringify(safe)) > 8192 &&
    safe.exception?.values?.some(
      (value: any) => value.stacktrace?.frames?.length,
    )
  ) {
    safe.exception.values
      .find((value: any) => value.stacktrace?.frames?.length)
      .stacktrace.frames.shift();
  }
  while (
    Buffer.byteLength(JSON.stringify(safe)) > 8192 &&
    safe.exception?.values?.length > 1
  )
    safe.exception.values.shift();
  for (const optional of [
    "breadcrumbs",
    "tags",
    "request",
    "user",
    "message",
    "release",
    "environment",
  ]) {
    if (Buffer.byteLength(JSON.stringify(safe)) <= 8192) break;
    delete safe[optional];
  }
  return safe;
}
