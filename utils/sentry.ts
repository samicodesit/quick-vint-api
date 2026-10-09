import * as Sentry from "@sentry/node";
import { supabase } from "./supabaseClient";
import { sanitizeSentryEvent } from "./incidents/sentryPolicy";

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
    shutdownTimeout: 1500,
    tracesSampleRate: getSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0),
    profilesSampleRate: 0,
    async beforeSend(event) {
      if (event.level === "debug" || event.level === "info") return null;
      if (process.env.INCIDENT_PROCESSING_PAUSED === "true") return null;
      try {
        const { data, error } = await supabase
          .rpc("incident_reserve_sentry")
          .abortSignal(AbortSignal.timeout(1000));
        if (error || data !== true) return null;
        return sanitizeSentryEvent(event);
      } catch {
        return null;
      }
    },
  });

  return true;
}

export function getSentry() {
  return initSentry() ? Sentry : null;
}
