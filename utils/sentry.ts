import * as Sentry from "@sentry/node";

let didInitialize = false;

function getSampleRate(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

export function initSentry() {
  if (didInitialize) return true;

  if (!process.env.SENTRY_DSN) return false;
  didInitialize = true;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment:
      process.env.SENTRY_ENVIRONMENT ||
      process.env.VERCEL_ENV ||
      process.env.NODE_ENV ||
      "development",
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    maxBreadcrumbs: 20,
    tracesSampleRate: getSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0),
    profilesSampleRate: 0,
    beforeSend(event) {
      if (event.level === "debug" || event.level === "info") return null;

      // Keep request metadata useful without sending bodies, cookies, auth
      // headers, or other noisy/sensitive data into Sentry.
      if (event.request) {
        event.request = {
          method: event.request.method,
          url: event.request.url,
          query_string: event.request.query_string,
        };
      }

      return event;
    },
  });

  return true;
}

export function getSentry() {
  return initSentry() ? Sentry : null;
}
