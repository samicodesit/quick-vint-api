import { createClient } from "@supabase/supabase-js";
import { summarizeConversions } from "./conversion-report-lib.mjs";
const until = process.argv[3] || new Date().toISOString();
const from =
  process.argv[2] || new Date(Date.parse(until) - 72 * 3600000).toISOString();
const url = process.env.VERCEL_APP_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error(
    "Load the local API environment before running this read-only report.",
  );
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function all(table, columns, filter = (q) => q) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await filter(db.from(table).select(columns))
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
const [profiles, events, generations] = await Promise.all([
  all("profiles", "id,email,created_at"),
  all(
    "billing_events",
    "id,event_type,user_id,user_email,created_at,stripe_event_created_at,stripe_event_id,stripe_customer_id,stripe_subscription_id,stripe_invoice_id,billing_reason,currency,raw_event",
  ),
  all("api_logs", "id,user_id", (q) =>
    q
      .eq("endpoint", "/api/generate")
      .eq("response_status", 200)
      .gte("created_at", from)
      .lt("created_at", until),
  ),
]);
const confirmedIds = [];
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({
    page,
    perPage: 1000,
  });
  if (error) throw error;
  for (const u of data.users) if (u.email_confirmed_at) confirmedIds.push(u.id);
  if (data.users.length < 1000) break;
}
console.log(
  JSON.stringify(
    summarizeConversions({
      from,
      until,
      profiles,
      events,
      generations,
      confirmedIds,
    }),
    null,
    2,
  ),
);
