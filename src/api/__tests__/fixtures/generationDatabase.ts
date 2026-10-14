import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

export const owner = "00000000-0000-4000-8000-000000000001";
export const other = "00000000-0000-4000-8000-000000000002";

export async function createGenerationDatabase() {
  const db = new PGlite();
  const setup = readFileSync(
    "scripts/mobile-generation-idempotency-harness.sql",
    "utf8",
  )
    .split("\\ir ")[0]
    .replace(/^\\.*$/gm, "")
    .replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
  await db.exec(setup);
  for (const migration of [
    "2026-09-23_mobile_web_generation_idempotency.sql",
    "2026-10-11_shared_generation_retry_protection.sql",
  ]) {
    await db.exec(
      readFileSync(`migrations/${migration}`, "utf8").replace(
        "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
        "",
      ),
    );
  }
  await db.query("INSERT INTO profiles(id) VALUES ($1), ($2)", [owner, other]);
  return db;
}

/** Use the production quota/ledger functions, not the retry harness's stub. */
export async function createRateLimitedGenerationDatabase() {
  const db = await createGenerationDatabase();
  await db.exec(`
    ALTER TABLE profiles
      ADD COLUMN subscription_tier text DEFAULT 'free',
      ADD COLUMN subscription_status text DEFAULT 'free',
      ADD COLUMN api_calls_this_month integer DEFAULT 0,
      ADD COLUMN free_lifetime_generations_used integer DEFAULT 0,
      ADD COLUMN pack_credits integer DEFAULT 0,
      ADD COLUMN is_legacy_plan boolean DEFAULT false,
      ADD COLUMN custom_daily_limit integer,
      ADD COLUMN custom_monthly_limit integer,
      ADD COLUMN custom_limit_expires_at timestamptz;
    CREATE TABLE system_settings (key text PRIMARY KEY, value text);
    CREATE TABLE daily_stats (
      date text PRIMARY KEY, total_api_calls integer DEFAULT 0,
      estimated_cost numeric DEFAULT 0, created_at timestamptz, updated_at timestamptz
    );
    CREATE TABLE rate_limits (
      id serial PRIMARY KEY, key text, user_id uuid, count integer DEFAULT 0,
      window_type text, expires_at timestamptz, created_at timestamptz, updated_at timestamptz
    );
    CREATE TABLE credit_ledger (
      id serial PRIMARY KEY, user_id uuid, type text, delta integer,
      balance_after integer, metadata jsonb, created_at timestamptz DEFAULT now()
    );
  `);
  for (const migration of [
    "2026-06-20_atomic_generation_reservation.sql",
    "2026-08-23_paid_entitlement_reservation.sql",
    "2026-08-24_suspend_delinquent_generation.sql",
  ]) {
    await db.exec(
      readFileSync(`migrations/${migration}`, "utf8").replace(
        "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
        "",
      ),
    );
  }
  return db;
}
