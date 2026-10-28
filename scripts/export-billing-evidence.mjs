import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

// Read-only source queries. Output is private, scoped and deliberately not a claim of completeness.
const args = process.argv.slice(2);
const subscriptionId = args[args.indexOf("--subscription") + 1];
const outArg = args[args.indexOf("--out") + 1];
if (
  !args.includes("--subscription") ||
  !/^sub_[A-Za-z0-9]+$/.test(subscriptionId || "") ||
  !args.includes("--out") ||
  !outArg
)
  throw new Error(
    "Usage: node scripts/export-billing-evidence.mjs --subscription sub_ID --out NEW_PRIVATE_DIRECTORY",
  );
for (const key of [
  "VERCEL_APP_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
])
  if (!process.env[key]) throw new Error(`Missing ${key}`);
const db = createClient(
  process.env.VERCEL_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const subscription = await stripe.subscriptions.retrieve(subscriptionId);
const customerId =
  typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
async function rows(table, columns, filter) {
  const result = [];
  for (let page = 0; ; page++) {
    const { data, error } = await filter(db.from(table).select(columns))
      .order("id")
      .range(page * 500, page * 500 + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    result.push(...data);
    if (data.length < 500) return result;
  }
}
const profiles = await rows(
  "profiles",
  "id,email,stripe_customer_id,stripe_subscription_id",
  (query) => query.eq("stripe_customer_id", customerId),
);
const profile = profiles.find(
  (item) => item.stripe_subscription_id === subscriptionId,
);
if (!profile)
  throw new Error(
    "No unambiguous profile currently linked to this subscription; reconcile identity before exporting",
  );
const ledger = await rows("billing_events", "*", (query) =>
  query.eq("stripe_subscription_id", subscriptionId),
);
const welcomes = await rows("subscription_welcome_emails", "*", (query) =>
  query.eq("stripe_subscription_id", subscriptionId),
);
// Non-ID primary keys use their own paginated ordering below.
async function noticeRows(filter) {
  const result = [];
  for (let page = 0; ; page++) {
    const { data, error } = await filter(db.from("billing_notices").select("*"))
      .order("key")
      .range(page * 500, page * 500 + 499);
    if (error) throw error;
    result.push(...data);
    if (data.length < 500) return result;
  }
}
const notices = await noticeRows((query) =>
  query.eq("stripe_subscription_id", subscriptionId),
);
const withdrawals = await rows("billing_withdrawals", "*", (query) =>
  query.eq("email", profile.email),
);
for (const request of withdrawals)
  notices.push(
    ...(await noticeRows((query) =>
      query.eq("key", `withdrawal/${request.id}`),
    )),
  );
const delivery = [];
for (const id of new Set(
  [...welcomes, ...notices].map((row) => row.resend_email_id).filter(Boolean),
))
  delivery.push(
    ...(await rows("billing_email_delivery_events", "*", (query) =>
      query.eq("resend_email_id", id),
    )),
  );
const reports = await rows(
  "api_logs",
  "id,created_at,endpoint,full_request_body",
  (query) =>
    query
      .eq("user_id", profile.id)
      .eq("endpoint", "/event/listing_report_submitted"),
);
const usage = await rows(
  "api_logs",
  "id,created_at,endpoint,response_status",
  (query) =>
    query
      .eq("user_id", profile.id)
      .eq("endpoint", "/api/generate")
      .eq("response_status", 200),
);
const invoices = [];
for await (const invoice of stripe.invoices.list({
  subscription: subscriptionId,
  limit: 100,
}))
  invoices.push(invoice);
const charges = [];
for await (const charge of stripe.charges.list({
  customer: customerId,
  limit: 100,
})) {
  const invoiceId =
    typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;
  if (invoiceId && invoices.some((invoice) => invoice.id === invoiceId))
    charges.push(charge);
}
const refunds = [];
for (const charge of charges)
  for await (const refund of stripe.refunds.list({
    charge: charge.id,
    limit: 100,
  }))
    refunds.push(refund);
const creditNotes = [];
for (const invoice of invoices)
  for await (const note of stripe.creditNotes.list({
    invoice: invoice.id,
    limit: 100,
  }))
    creditNotes.push(note);
const output = resolve(outArg);
await mkdir(output, { mode: 0o700 });
const artifacts = {
  subscription,
  profile,
  ledger,
  welcomes,
  notices,
  withdrawals,
  delivery,
  reports,
  usage,
  invoices,
  charges,
  refunds,
  creditNotes,
};
const manifest = {
  createdAt: new Date().toISOString(),
  subscriptionId,
  files: {},
  limits: [
    "This export is not a conclusion that no other requests or refunds exist.",
    "Search all support inboxes, aliases, spam, archived mail and other contact channels separately.",
    "Withdrawal matches use the current profile email and can include other contracts; check each statement. Alternate-email requests require a separate search.",
    "Charge/refund correlation relies on invoice IDs returned by Stripe; check invoice payment links and the Stripe dashboard when missing.",
    "Retained successful generation rows show observed activity, not guaranteed complete history or proof of reading terms.",
    "Historical missing consent or email payloads remain unknown. Sent means provider acceptance; delivered means recipient-server acceptance, not reading.",
  ],
};
for (const [name, value] of Object.entries(artifacts)) {
  const data = JSON.stringify(value, null, 2) + "\n";
  await writeFile(resolve(output, `${name}.json`), data, {
    mode: 0o600,
    flag: "wx",
  });
  manifest.files[`${name}.json`] = createHash("sha256")
    .update(data)
    .digest("hex");
}
await writeFile(
  resolve(output, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  { mode: 0o600, flag: "wx" },
);
console.log(
  `Evidence exported to ${output}. Review manifest limitations before making claims.`,
);
