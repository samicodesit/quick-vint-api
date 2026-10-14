import { HOMEPAGE_EXPERIMENT } from "../src/scripts/homepageExperiment";
import { ApiLogger } from "./apiLogger";

const WEEK = 7 * 86400000;
type Log = {
  id: string;
  user_id?: string | null;
  user_email?: string;
  endpoint: string;
  response_status: number;
  created_at: string;
  full_request_body?: any;
};
type Profile = { id: string; email?: string };
const clientOf = (l: Log): string =>
  l.full_request_body?.analyticsClientId ||
  l.full_request_body?.context?.analyticsClientId ||
  "";
const timeOf = (l: Log): number =>
  Date.parse(
    l.full_request_body?.generationStartedAt ||
      l.full_request_body?.occurredAt ||
      l.created_at,
  );

/** Same-browser observations only; a client success event cannot prove generation. */
export function buildHomepageExperimentStats(
  logs: Log[],
  profiles: Profile[],
  now: number,
) {
  const config = HOMEPAGE_EXPERIMENT;
  const excludedUsers = new Set(
    profiles
      .filter((p) => ApiLogger.isInternalLogExcludedEmail(p.email))
      .map((p) => p.id),
  );
  const internal = (l: Log) =>
    excludedUsers.has(l.user_id || "") ||
    ApiLogger.isInternalLogExcludedEmail(l.user_email);
  const excludedClients = new Set(
    logs.filter(internal).map(clientOf).filter(Boolean),
  );
  const safe = logs.filter(
    (l) => !internal(l) && !excludedClients.has(clientOf(l)),
  );
  const cohorts = new Map<
    string,
    {
      variant: "a" | "b";
      time: number;
      generated: boolean;
      copied: boolean;
      app: boolean;
      extension: boolean;
      paid: boolean;
    }
  >();
  for (const log of safe) {
    const b = log.full_request_body || {},
      c = b.context || {},
      client = clientOf(log),
      time = timeOf(log);
    if (
      log.endpoint !== "/event/home_hero_exposure" ||
      b.automatedTraffic === true ||
      b.source !== "website" ||
      c.heroExperiment !== config.id ||
      !["a", "b"].includes(c.heroVariant) ||
      typeof client !== "string" ||
      !client ||
      time < config.start ||
      time >= config.enrollmentEnd ||
      time > now ||
      !Number.isFinite(time) ||
      (cohorts.get(client)?.time ?? Infinity) <= time
    )
      continue;
    cohorts.set(client, {
      variant: c.heroVariant,
      time,
      generated: false,
      copied: false,
      app: false,
      extension: false,
      paid: false,
    });
  }
  const observedAccounts = new Map<string, Map<string, number>>();
  for (const log of safe) {
    const b = log.full_request_body || {},
      cohort = cohorts.get(clientOf(log)),
      time = timeOf(log);
    if (
      !cohort ||
      !Number.isFinite(time) ||
      time < cohort.time ||
      time > Math.min(cohort.time + WEEK, now)
    )
      continue;
    if (
      log.user_id &&
      (b.client === "mobile_web" ||
        (b.source === "mobile_web" &&
          ["/event/auth_complete", "/event/session_restored"].includes(
            log.endpoint,
          )))
    ) {
      const clients =
        observedAccounts.get(log.user_id) || new Map<string, number>();
      clients.set(
        clientOf(log),
        Math.min(time, clients.get(clientOf(log)) ?? Infinity),
      );
      observedAccounts.set(log.user_id, clients);
    }
    if (
      b.client === "mobile_web" &&
      log.user_id &&
      ["/api/generate", "/api/generation-result"].includes(log.endpoint) &&
      (log.response_status === 200 || b.generationCommitted === true)
    )
      cohort.generated = true;
    if (
      b.source === "mobile_web" &&
      log.user_id &&
      log.endpoint === "/event/copy"
    )
      cohort.copied = true;
    if (b.source === "website" && log.endpoint === "/event/web_app_click")
      cohort.app = true;
    if (b.source === "website" && log.endpoint === "/event/chrome_store_click")
      cohort.extension = true;
  }
  // Stripe is authoritative. Never infer a payment from a browser return or
  // pick a variant when an account has multiple eligible exposed browsers.
  for (const log of safe) {
    const body = log.full_request_body || {},
      context = body.context || {},
      time = timeOf(log);
    if (
      log.endpoint !== "/event/subscription_started" ||
      body.source !== "stripe_webhook" ||
      context.status !== "active" ||
      !["starter", "pro", "business"].includes(context.tier) ||
      !log.user_id ||
      time > now
    )
      continue;
    const candidates = [...(observedAccounts.get(log.user_id) || [])].filter(
      ([client, observed]) =>
        observed <= time && time <= cohorts.get(client)!.time + WEEK,
    );
    if (candidates.length === 1) cohorts.get(candidates[0][0])!.paid = true;
  }
  const arms = (["a", "b"] as const).map((variant) => {
    const values = [...cohorts.values()].filter((c) => c.variant === variant),
      mature = values.filter((c) => c.time + WEEK <= now);
    const successes = mature.filter((c) => c.generated).length,
      n = mature.length,
      p = n ? successes / n : 0,
      z = 1.96;
    const center = (p + (z * z) / (2 * n)) / (1 + (z * z) / n),
      half =
        (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) /
        (1 + (z * z) / n);
    return {
      variant,
      label: variant === "a" ? "A: Demo first" : "B: App first",
      exposed: values.length,
      appClicks: values.filter((c) => c.app).length,
      extensionClicks: values.filter((c) => c.extension).length,
      generated: values.filter((c) => c.generated).length,
      copied: values.filter((c) => c.copied).length,
      paid: values.filter((c) => c.paid).length,
      mature: n,
      matureGenerated: successes,
      conversionRate: n ? 100 * p : null,
      confidenceInterval: n
        ? [
            Math.max(0, 100 * (center - half)),
            Math.min(100, 100 * (center + half)),
          ]
        : null,
    };
  });
  return {
    id: config.id,
    start: new Date(config.start).toISOString(),
    enrollmentEnd: new Date(config.enrollmentEnd).toISOString(),
    end: new Date(config.end).toISOString(),
    arms,
    status:
      now < config.start
        ? "Not started"
        : now < config.enrollmentEnd
          ? "Enrolling"
          : now < config.end
            ? "Collecting outcomes"
            : "Ended",
    definition:
      "50/50 phone browsers. First observed exposure, then seven days for an authenticated web API success. Rates use only complete seven-day cohorts. Paid means Stripe activation after a verified same-browser account visit; ambiguous multi-browser accounts are excluded. Tracking may be blocked. No automatic winner. Export results before 30-day cleanup.",
  };
}
