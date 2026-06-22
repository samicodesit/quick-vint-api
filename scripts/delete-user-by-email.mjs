import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const ENV_FILES = [".env.local", ".env"];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

function loadEnv() {
  for (const file of ENV_FILES) {
    loadEnvFile(path.resolve(process.cwd(), file));
  }
}

function getArg(flag, fallback = undefined) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function usage() {
  console.error(
    [
      "Usage:",
      "  pnpm run ops:delete-user -- --email user@example.com --confirm user@example.com",
      "",
      "Options:",
      "  --email <email>      Required. Account email to delete.",
      "  --confirm <email>    Required unless --dry-run. Must match --email.",
      "  --dry-run            Look up matching records without deleting anything.",
      "",
      "Environment:",
      "  VERCEL_APP_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
      "  STRIPE_SECRET_KEY optional, used to cancel/delete Stripe records.",
    ].join("\n"),
  );
}

function requireEmail(value, label) {
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    console.error(`${label} must be a valid email address.`);
    usage();
    process.exit(1);
  }

  return value.toLowerCase();
}

async function findAuthUserByEmail(supabase, email) {
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) throw error;

    const users = data?.users || [];
    const match = users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (users.length < 100) break;
    page += 1;
  }

  return null;
}

loadEnv();

const dryRun = hasFlag("--dry-run");
const email = requireEmail(getArg("--email"), "--email");
const confirmEmail = getArg("--confirm");

if (!dryRun && requireEmail(confirmEmail, "--confirm") !== email) {
  console.error("--confirm must exactly match --email.");
  process.exit(1);
}

const supabaseUrl = process.env.VERCEL_APP_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing Supabase configuration in environment.");
  process.exit(1);
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const summary = {
  email,
  dry_run: dryRun,
  profile: null,
  deleted: {
    api_logs_by_user_id: 0,
    api_logs_by_email: 0,
    rate_limits: 0,
    profiles: 0,
    auth_user_deleted: false,
    stripe_subscription_canceled: false,
    stripe_customer_deleted: false,
    stripe_customers_deleted_by_email: 0,
  },
  verification: {},
};

const { data: profiles, error: profileLookupError } = await supabase
  .from("profiles")
  .select(
    "id, email, stripe_customer_id, stripe_subscription_id, subscription_status",
  )
  .ilike("email", email);

if (profileLookupError) {
  console.error("Failed to look up profile:", profileLookupError.message);
  process.exit(1);
}

const profile = profiles?.[0] || null;
summary.profile = profile;

let userId = profile?.id || null;
let stripeCustomerId = profile?.stripe_customer_id || null;
let stripeSubscriptionId = profile?.stripe_subscription_id || null;

if (userId) {
  if (!dryRun) {
    const { count: apiLogsByUserId, error: apiLogDeleteError } = await supabase
      .from("api_logs")
      .delete({ count: "exact" })
      .eq("user_id", userId);
    if (apiLogDeleteError) throw apiLogDeleteError;
    summary.deleted.api_logs_by_user_id = apiLogsByUserId || 0;

    const { count: rateLimitsDeleted, error: rateLimitDeleteError } =
      await supabase
        .from("rate_limits")
        .delete({ count: "exact" })
        .eq("user_id", userId);
    if (rateLimitDeleteError) throw rateLimitDeleteError;
    summary.deleted.rate_limits = rateLimitsDeleted || 0;
  }
}

if (!dryRun) {
  const { count: apiLogsByEmail, error: apiLogsByEmailDeleteError } =
    await supabase
      .from("api_logs")
      .delete({ count: "exact" })
      .ilike("user_email", email);
  if (apiLogsByEmailDeleteError) throw apiLogsByEmailDeleteError;
  summary.deleted.api_logs_by_email = apiLogsByEmail || 0;

  if (profile?.id) {
    const { count: profilesDeleted, error: profileDeleteError } = await supabase
      .from("profiles")
      .delete({ count: "exact" })
      .eq("id", profile.id);
    if (profileDeleteError) throw profileDeleteError;
    summary.deleted.profiles = profilesDeleted || 0;
  }
}

const authUser = await findAuthUserByEmail(supabase, email);
if (authUser && !dryRun) {
  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
    authUser.id,
  );
  if (authDeleteError) throw authDeleteError;
  summary.deleted.auth_user_deleted = true;
  userId = authUser.id;
} else if (authUser) {
  userId = authUser.id;
}

if (stripe && !dryRun) {
  if (stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
      summary.deleted.stripe_subscription_canceled = true;
    } catch (error) {
      if (error?.code !== "resource_missing") throw error;
    }
  }

  if (stripeCustomerId) {
    try {
      await stripe.customers.del(stripeCustomerId);
      summary.deleted.stripe_customer_deleted = true;
    } catch (error) {
      if (error?.code !== "resource_missing") throw error;
    }
  } else {
    const customers = await stripe.customers.list({ email, limit: 100 });
    for (const customer of customers.data) {
      if (!customer.deleted) {
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: "all",
          limit: 100,
        });

        for (const subscription of subscriptions.data) {
          if (
            subscription.status !== "canceled" &&
            subscription.status !== "incomplete_expired"
          ) {
            await stripe.subscriptions.cancel(subscription.id);
            summary.deleted.stripe_subscription_canceled = true;
          }
        }

        await stripe.customers.del(customer.id);
        summary.deleted.stripe_customers_deleted_by_email += 1;
      }
    }
  }
}

const { data: remainingProfiles, error: remainingProfilesError } = await supabase
  .from("profiles")
  .select("id, email")
  .ilike("email", email);
if (remainingProfilesError) throw remainingProfilesError;

const { count: remainingApiLogsByEmail, error: remainingApiLogsError } =
  await supabase
    .from("api_logs")
    .select("*", { count: "exact", head: true })
    .ilike("user_email", email);
if (remainingApiLogsError) throw remainingApiLogsError;

let remainingApiLogsByUserId = 0;
let remainingRateLimits = 0;

if (userId) {
  const { count, error } = await supabase
    .from("api_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  remainingApiLogsByUserId = count || 0;

  const { count: rateCount, error: rateError } = await supabase
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (rateError) throw rateError;
  remainingRateLimits = rateCount || 0;
}

const remainingAuthUser = await findAuthUserByEmail(supabase, email);

let stripeVerification = null;
if (stripe) {
  const customers = await stripe.customers.list({ email, limit: 100 });
  const activeSubscriptions = [];

  for (const customer of customers.data) {
    if (customer.deleted) continue;
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 100,
    });

    activeSubscriptions.push(
      ...subscriptions.data.filter(
        (subscription) =>
          subscription.status !== "canceled" &&
          subscription.status !== "incomplete_expired",
      ),
    );
  }

  stripeVerification = {
    remaining_customers: customers.data.filter((customer) => !customer.deleted)
      .length,
    remaining_active_subscriptions: activeSubscriptions.length,
  };
}

summary.verification = {
  remaining_profiles: remainingProfiles?.length || 0,
  remaining_api_logs_by_email: remainingApiLogsByEmail || 0,
  remaining_api_logs_by_user_id: remainingApiLogsByUserId,
  remaining_rate_limits: remainingRateLimits,
  remaining_auth_user: Boolean(remainingAuthUser),
  stripe: stripeVerification,
};

console.log(JSON.stringify(summary, null, 2));
