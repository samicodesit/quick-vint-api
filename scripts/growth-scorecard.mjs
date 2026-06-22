import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envPath = new URL("../.env", import.meta.url);
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }
}

function daysAgo(days) {
  return new Date(Date.now() - days * 864e5);
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

async function fetchAll(supabase, table, columns, buildQuery) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase.from(table).select(columns).range(from, from + 999);
    if (buildQuery) query = buildQuery(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function pct(part, total) {
  return total ? `${Math.round((part / total) * 1000) / 10}%` : "0%";
}

loadEnv();

if (!process.env.VERCEL_APP_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env vars.");
}

const supabase = createClient(
  process.env.VERCEL_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const profiles = await fetchAll(
  supabase,
  "profiles",
  "id, created_at, subscription_status, subscription_tier",
);
const logs30 = await fetchAll(
  supabase,
  "api_logs",
  "user_id, created_at, response_status, endpoint",
  (query) => query.gte("created_at", `${dayKey(daysAgo(30))}T00:00:00Z`),
);

const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
const paidProfiles = profiles.filter(
  (profile) =>
    profile.subscription_status === "active" &&
    profile.subscription_tier &&
    profile.subscription_tier !== "free",
);
const signups30 = profiles.filter(
  (profile) => new Date(profile.created_at) >= daysAgo(30),
);
const successfulGenerations = logs30.filter(
  (log) => log.endpoint === "/api/generate" && Number(log.response_status) === 200,
);
const limitHits = logs30.filter(
  (log) => log.endpoint === "/api/generate" && Number(log.response_status) === 429,
);
const activeUsers = new Set(
  logs30
    .filter((log) => log.endpoint === "/api/generate" && log.user_id)
    .map((log) => log.user_id),
);
const repeatUsers = new Set();
const activeDaysByUser = new Map();
for (const log of successfulGenerations) {
  if (!log.user_id) continue;
  const days = activeDaysByUser.get(log.user_id) || new Set();
  days.add(dayKey(new Date(log.created_at)));
  activeDaysByUser.set(log.user_id, days);
  if (days.size >= 2) repeatUsers.add(log.user_id);
}

const paidActiveUsers = [...activeUsers].filter((userId) => {
  const profile = profileById.get(userId);
  return (
    profile?.subscription_status === "active" &&
    profile?.subscription_tier &&
    profile.subscription_tier !== "free"
  );
});

console.log(`AutoLister Growth Scorecard (${new Date().toISOString()})`);
console.log("=".repeat(56));
console.log(`Profiles: ${profiles.length}`);
console.log("Chrome public users: paste from Chrome Web Store dashboard/listing");
console.log(`Active paid profiles: ${paidProfiles.length}`);
console.log(`30d signups: ${signups30.length}`);
console.log(`30d active generators: ${activeUsers.size}`);
console.log(`30d paid active generators: ${paidActiveUsers.length}`);
console.log(`30d successful generations: ${successfulGenerations.length}`);
console.log(`30d limit hits: ${limitHits.length}`);
console.log(`Repeat active users: ${repeatUsers.size} (${pct(repeatUsers.size, activeUsers.size)})`);
console.log(
  `30d signup-to-paid: ${pct(
    signups30.filter(
      (profile) =>
        profile.subscription_status === "active" &&
        profile.subscription_tier &&
        profile.subscription_tier !== "free",
    ).length,
    signups30.length,
  )}`,
);
console.log("");
console.log("Manual weekly inputs still needed:");
console.log("- Chrome Web Store impressions, visitors, installs, uninstall rate");
console.log("- TrustMRR MRR, net revenue, active subscriptions, churn");
console.log("- Paid/creator spend by source when campaigns start");
