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
