import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./supabaseClient";
import { ApiLogger } from "./apiLogger";
import { hasPaidEntitlementStatus } from "../src/utils/subscriptionStatus";
import { buildHomepageExperimentStats } from "./homepageExperimentStats";
import { HOMEPAGE_EXPERIMENT } from "../src/scripts/homepageExperiment";

const DAY = 86400000;
const MAX_LOGS = 50000;
type Log = {
  id: string;
  user_id?: string;
  user_email?: string;
  endpoint: string;
  response_status: number;
  created_at: string;
  full_request_body?: any;
};
type Profile = {
  id: string;
  email?: string;
  created_at?: string;
  subscription_status?: string;
  subscription_tier?: string;
};
const emptyDay = (date: string) => ({
  date,
  visits: 0,
  newSignups: 0,
  generations: 0,
  copies: 0,
  failedGenerations: 0,
});

/** Verified generation outcomes come from the API, never client success claims. */
export function buildWebAppStats(
  logs: Log[],
  profiles: Profile[],
  start: string,
  end: string,
  days: number,
) {
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const excluded = new Set(
    profiles
      .filter((p) => ApiLogger.isInternalLogExcludedEmail(p.email))
      .map((p) => p.id),
  );
  const excludedClients = new Set(
    logs
      .filter(
        (l) =>
          excluded.has(l.user_id || "") ||
          ApiLogger.isInternalLogExcludedEmail(l.user_email),
      )
      .map(
        (l) =>
          l.full_request_body?.analyticsClientId ||
          l.full_request_body?.context?.analyticsClientId,
      )
      .filter(Boolean),
  );
  const safe = logs.filter(
    (l) =>
      !excluded.has(l.user_id || "") &&
      !ApiLogger.isInternalLogExcludedEmail(l.user_email) &&
      !excludedClients.has(
        l.full_request_body?.analyticsClientId ||
          l.full_request_body?.context?.analyticsClientId,
      ) &&
      Date.parse(l.created_at) >= Date.parse(start) &&
      Date.parse(l.created_at) <= Date.parse(end),
  );
  const daily = new Map<string, ReturnType<typeof emptyDay>>();
  for (let time = Date.parse(start); time <= Date.parse(end); time += DAY) {
    const key = new Date(time).toISOString().slice(0, 10);
    daily.set(key, emptyDay(key));
  }
  const sessions = new Set<string>(),
    signedIn = new Set<string>(),
    signupUsers = new Set<string>(),
    activated = new Set<string>();
  const firstArrival = new Map<string, number>(),
    firstAuth = new Map<string, { time: number; client: string }>();
  const generationDays = new Map<string, Set<string>>(),
    eventsSeen = new Set<string>();
  const entrySources = new Map<string, number>();
  const requests = new Map<string, Log>();
  let copies = 0,
    checkoutStarts = 0,
    unidentifiedViews = 0,
    homepageClicks = 0;
  for (const log of safe.sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )) {
    const body = log.full_request_body || {},
      context = body.context || {};
    if (
      ["/api/generate", "/api/generation-result"].includes(log.endpoint) &&
      body.client === "mobile_web" &&
      log.user_id
    ) {
      const key = `${log.user_id}:${body.requestId || log.id}`;
      const previous = requests.get(key);
      const successful =
        log.response_status === 200 || body.generationCommitted === true;
      // A response-loss retry is the same generation; success supersedes errors.
      if (!previous || (previous.response_status !== 200 && successful))
        requests.set(key, {
          ...log,
          response_status: successful ? 200 : log.response_status,
          created_at: Number.isFinite(Date.parse(body.generationStartedAt))
            ? body.generationStartedAt
            : log.created_at,
        });
      continue;
    }
    const isApp = body.source === "mobile_web";
    const isEntry = body.source === "website" && body.event === "web_app_click";
    if (!isApp && !isEntry) continue;
    const eventKey = body.transportEventId || log.id;
    if (eventsSeen.has(eventKey)) continue;
    eventsSeen.add(eventKey);
    const time = Date.parse(body.occurredAt || log.created_at);
    const client =
      typeof context.analyticsClientId === "string"
        ? context.analyticsClientId
        : "";
    if (client && (isEntry || body.event === "web_app_view"))
      firstArrival.set(
        client,
        Math.min(time, firstArrival.get(client) ?? Infinity),
      );
    if (
      !Number.isFinite(time) ||
      time < Date.parse(start) ||
      time > Date.parse(end)
    )
      continue;
    if (isEntry) {
      homepageClicks++;
      continue;
    }
    const day = daily.get(new Date(time).toISOString().slice(0, 10));
    if (body.event === "web_app_view") {
      const visit =
        typeof context.webSessionId === "string" ? context.webSessionId : "";
      if (!visit) unidentifiedViews++;
      else if (!sessions.has(visit)) {
        sessions.add(visit);
        if (day) day.visits++;
        const source = String(context.source || "unknown").slice(0, 80);
        entrySources.set(source, (entrySources.get(source) || 0) + 1);
      }
    }
    if (log.user_id && body.event === "auth_complete") {
      signedIn.add(log.user_id);
      if (
        !firstAuth.has(log.user_id) ||
        time < firstAuth.get(log.user_id)!.time
      )
        firstAuth.set(log.user_id, { time, client });
    }
    if (log.user_id && body.event === "copy") {
      copies++;
      if (day) day.copies++;
    }
    if (log.user_id && body.event === "checkout_start") checkoutStarts++;
  }
  let generations = 0,
    failedGenerations = 0;
  for (const log of requests.values()) {
    if (
      Date.parse(log.created_at) < Date.parse(start) ||
      Date.parse(log.created_at) > Date.parse(end)
    )
      continue;
    const day = daily.get(log.created_at.slice(0, 10));
    if (log.response_status === 200) {
      generations++;
      if (day) day.generations++;
      activated.add(log.user_id!);
      const userDays = generationDays.get(log.user_id!) || new Set<string>();
      userDays.add(log.created_at.slice(0, 10));
      generationDays.set(log.user_id!, userDays);
    } else if (log.response_status >= 400 && log.response_status !== 429) {
      failedGenerations++;
      if (day) day.failedGenerations++;
    }
  }
  for (const [user, auth] of firstAuth) {
    const created = Date.parse(profileById.get(user)?.created_at || "");
    const arrival = firstArrival.get(auth.client);
    if (
      Number.isFinite(created) &&
      arrival !== undefined &&
      created >= arrival &&
      created <= auth.time + 120000 &&
      created - arrival <= DAY &&
      created >= Date.parse(start)
    ) {
      signupUsers.add(user);
      const day = daily.get(new Date(created).toISOString().slice(0, 10));
      if (day) day.newSignups++;
    }
  }
  const observedUsers = new Set([...signedIn, ...activated]);
  return {
    available: true,
    homepageExperiment: buildHomepageExperimentStats(
      logs,
      profiles,
      Date.parse(end),
    ),
    window: { start, end, days },
    totals: {
      homepageClicks,
      visits: sessions.size,
      signedInUsers: signedIn.size,
      newSignups: signupUsers.size,
      activatedUsers: activated.size,
      generations,
      failedGenerations,
      copies,
      checkoutStarts,
      returningGenerators: [...generationDays.values()].filter(
        (d) => d.size >= 2,
      ).length,
      currentPaidUsers: [...observedUsers].filter((id) => {
        const p = profileById.get(id);
        return (
          p?.subscription_tier &&
          p.subscription_tier !== "free" &&
          hasPaidEntitlementStatus(p.subscription_status)
        );
      }).length,
    },
    daily: [...daily.values()],
    entrySources: [...entrySources]
      .map(([source, visits]) => ({ source, visits }))
      .sort((a, b) => b.visits - a.visits),
    measurement: {
      unidentifiedViews,
      visitDefinition:
        "One browser session after 30 minutes of inactivity; not unique people.",
      signupDefinition:
        "Profile created after a same-browser arrival and before the first observed web sign-in. Missing or cross-device evidence is not attributed.",
      generationDefinition:
        "Authenticated web API successes, deduplicated by request ID. Client success claims are not counted.",
      returningDefinition: "Generated on at least two UTC days in this window.",
      paidDefinition:
        "Current paid entitlement among observed web users, not new payments or revenue.",
      retentionDays: 30,
    },
  };
}

export async function handleWebAppStats(
  req: VercelRequest,
  res: VercelResponse,
) {
  const days = req.query.days === "30" ? 30 : 7;
  const now = new Date(),
    end = now.toISOString();
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - (days - 1),
    ),
  ).toISOString();
  // While the fixed experiment is reportable, load its cohorts even in the
  // seven-day activity view. Always stay within existing thirty-day retention.
  const queryStart =
    now.getTime() <= HOMEPAGE_EXPERIMENT.end + DAY
      ? new Date(
          Math.min(
            Date.parse(start),
            Math.max(HOMEPAGE_EXPERIMENT.start, now.getTime() - 30 * DAY),
          ),
        ).toISOString()
      : start;
  try {
    const logs: Log[] = [];
    let truncated = false;
    for (let offset = 0; offset <= MAX_LOGS; offset += 1000) {
      const { data, error } = await supabase
        .from("api_logs")
        .select(
          "id,user_id,user_email,endpoint,response_status,created_at,full_request_body",
        )
        .gte("created_at", queryStart)
        .lte("created_at", end)
        .or(
          `full_request_body->>client.eq.mobile_web,full_request_body->>source.eq.mobile_web,and(endpoint.eq./event/web_app_click,full_request_body->>source.eq.website),and(endpoint.in.(/event/home_hero_exposure,/event/chrome_store_click),full_request_body->>source.eq.website,full_request_body->context->>heroExperiment.eq.${HOMEPAGE_EXPERIMENT.id}),and(endpoint.eq./event/subscription_started,full_request_body->>source.eq.stripe_webhook)`,
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + 999);
      if (error) throw error;
      if (offset === MAX_LOGS) {
        truncated = Boolean(data?.length);
        break;
      }
      logs.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const ids = [
      ...new Set(
        logs.map((l) => l.user_id).filter((id): id is string => Boolean(id)),
      ),
    ];
    const profiles: Profile[] = [];
    for (let offset = 0; offset < ids.length; offset += 250) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,created_at,subscription_status,subscription_tier")
        .in("id", ids.slice(offset, offset + 250));
      if (error) throw error;
      profiles.push(...(data || []));
    }
    return res.status(200).json({
      ...buildWebAppStats(logs, profiles, start, end, days),
      completeness: { truncated, rows: logs.length },
    });
  } catch {
    return res.status(503).json({
      available: false,
      error: "Web app metrics could not be loaded. Retry shortly.",
    });
  }
}
