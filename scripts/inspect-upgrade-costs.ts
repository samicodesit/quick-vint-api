// One-off, read-only, bounded analysis. No customer writes or raw exports.
import { readFileSync, writeFileSync } from "node:fs";
import { estimateOpenAICostUsd } from "../utils/openaiModelExperiment.ts";

const env: Record<string, string> = {};
for (const file of [
  "/home/mests/projects/quick-vint-api/.env",
  "/home/mests/projects/autolister/.env.local",
]) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^(?:export\s+)?([A-Z_0-9]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}
const start = "2026-10-01T00:00:00Z";
const end = new Date().toISOString();
const stats = { requests: 0, bytes: 0, seconds: 0 };
const started = Date.now();
const base = env.VERCEL_APP_SUPABASE_URL + "/rest/v1/";
const key = env.SUPABASE_SERVICE_ROLE_KEY;
async function rows(table: string, params: Record<string, string>) {
  const result: any[] = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    if (stats.requests >= 20) throw new Error("Read cap exceeded");
    const response = await fetch(
      base +
        table +
        "?" +
        new URLSearchParams({
          ...params,
          limit: "1000",
          offset: String(offset),
        }),
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const body = await response.text();
    stats.requests++;
    stats.bytes += Buffer.byteLength(body);
    if (!response.ok)
      throw new Error(`Read failed: ${table} ${response.status}`);
    const page = JSON.parse(body);
    result.push(...page);
    if (page.length < 1000) return result;
  }
  throw new Error("Dataset truncated");
}
const logs = await rows("api_logs", {
  select:
    "id,user_id,created_at,endpoint,request_method,response_status,openai_model,openai_tokens_used,openai_prompt_tokens,openai_completion_tokens,openai_cached_tokens,openai_billing:full_request_body->openaiBilling",
  and: `(created_at.gte.${start},created_at.lt.${end})`,
  openai_model: "not.is.null",
  order: "created_at.asc,id.asc",
});
const updates = await rows("billing_events", {
  select:
    "stripe_invoice_id,stripe_customer_id,stripe_subscription_id,stripe_event_created_at,event_type,status,amount_due,currency",
  billing_reason: "eq.subscription_update",
  and: `(stripe_event_created_at.gte.${start},stripe_event_created_at.lt.${end})`,
  order: "stripe_event_created_at.asc,id.asc",
});
const profiles = await rows("profiles", {
  select:
    "id,stripe_customer_id,api_calls_this_month,current_period_end,subscription_status,subscription_tier",
  stripe_customer_id: "eq.cus_UoUEkWDaxsTtXk",
  order: "id.asc",
});
function summarize(input: any[]) {
  const costed: number[] = [];
  let unknown = 0;
  for (const row of input) {
    const cost = estimateOpenAICostUsd({
      model: row.openai_model,
      promptTokens: row.openai_prompt_tokens,
      completionTokens: row.openai_completion_tokens,
      cachedTokens: row.openai_cached_tokens,
      totalTokens: row.openai_tokens_used,
      serviceTier: row.openai_billing?.serviceTier,
      cacheWriteTokens: row.openai_billing?.cacheWriteTokens,
    });
    if (cost === null) unknown++;
    else costed.push(cost);
  }
  costed.sort((a, b) => a - b);
  const total = costed.reduce((a, b) => a + b, 0);
  return {
    rows: input.length,
    known: costed.length,
    unknown,
    estimatedUsd: total,
    averageKnownUsd: costed.length ? total / costed.length : null,
    p95KnownUsd: costed[Math.floor(costed.length * 0.95)] ?? null,
  };
}
const p = profiles[0];
if (!p) throw new Error("Customer missing");
const paidUpdates = [
  ...new Map(
    updates
      .filter(
        (r) =>
          r.status === "paid" &&
          r.amount_due > 0 &&
          ["invoice.paid", "invoice.payment_succeeded"].includes(r.event_type),
      )
      .map((r) => [r.stripe_invoice_id, r]),
  ).values(),
];
const profileLogs = logs.filter((r) => r.user_id === p.id);
const upgrade = paidUpdates.find(
  (r) => r.stripe_customer_id === p.stripe_customer_id,
);
const cutoff = upgrade?.stripe_event_created_at || "2026-10-26T21:02:34Z";
const cycle = summarize(
  profileLogs.filter((r) => r.created_at >= "2026-10-02T20:32:24Z"),
);
const afterUpgrade = summarize(
  profileLogs.filter((r) => r.created_at >= cutoff),
);
const generating = logs.filter(
  (r) => r.endpoint === "/api/generate" && r.request_method === "POST",
);
stats.seconds = (Date.now() - started) / 1000;
const result = {
  start,
  end,
  provenance:
    "Retained API token logs priced using the existing production estimator. Estimates, not provider invoices. Unknown costs excluded from sums. Includes unsuccessful cost-bearing attempts; not all rows equal a delivered listing. No tax, payment fees, hosting, other services or acquisition spend included.",
  stats,
  allRetainedAi: summarize(logs),
  generationPosts: summarize(generating),
  customer: {
    usage: p.api_calls_this_month,
    periodEnd: p.current_period_end,
    tier: p.subscription_tier,
    status: p.subscription_status,
    cycle,
    afterUpgrade,
    upgradeAt: cutoff,
    upgradePaidEur:
      upgrade?.currency === "eur" ? upgrade.amount_due / 100 : null,
    cyclePaidEurFromPriorVerifiedInvoices: 12.24,
    remainingMonthly: Math.max(0, 600 - p.api_calls_this_month),
  },
  paidPositiveSubscriptionUpdateInvoices: paidUpdates.map((r) => ({
    at: r.stripe_event_created_at,
    amount: r.amount_due / 100,
    currency: r.currency,
    isExaminedCustomer: r.stripe_customer_id === p.stripe_customer_id,
  })),
  scenario: {
    full600AtCustomerMeanUsd: (cycle.averageKnownUsd || 0) * 600,
    extra350AtCustomerMeanUsd: (cycle.averageKnownUsd || 0) * 350,
    full600AtOverallMeanUsd: (summarize(generating).averageKnownUsd || 0) * 600,
  },
};
writeFileSync(
  "/home/mests/projects/autolister/reports/growth-health-2026-10-26/upgrade-cost-check.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
