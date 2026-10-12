import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("keeps critical capacity after a repeat flood and preserves the old RPC", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE incident_groups(id uuid PRIMARY KEY, severity text);
      CREATE TABLE incident_daily_budgets(day date PRIMARY KEY, sentry integer DEFAULT 0);
      CREATE FUNCTION incident_reserve_sentry() RETURNS boolean LANGUAGE sql AS 'SELECT true';
      INSERT INTO incident_groups VALUES ('00000000-0000-4000-8000-000000000001','transient'),('00000000-0000-4000-8000-000000000002','blocking');`);
    await db.exec(
      readFileSync(
        resolve("migrations/2026-10-12_sentry_capture_sampling.sql"),
        "utf8",
      ),
    );
    const reserve = async (id: string | null) =>
      (
        await db.query<{ allowed: boolean }>(
          "SELECT incident_reserve_sentry($1::uuid) AS allowed",
          [id],
        )
      ).rows[0].allowed;
    const flood = await Promise.all(
      Array.from({ length: 120 }, () =>
        reserve("00000000-0000-4000-8000-000000000001"),
      ),
    );
    expect(flood.filter(Boolean)).toHaveLength(3);
    for (let n = 3; n < 30; n++) {
      const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      await db.query(
        "INSERT INTO incident_groups VALUES ($1::uuid,'transient')",
        [id],
      );
      await reserve(id);
    }
    const budget = (
      await db.query<{ sentry: number; sentry_transient: number }>(
        "SELECT * FROM incident_daily_budgets",
      )
    ).rows[0];
    expect(budget.sentry).toBe(20);
    expect(budget.sentry_transient).toBe(20);
    const critical = await Promise.all(
      Array.from({ length: 90 }, () =>
        reserve("00000000-0000-4000-8000-000000000002"),
      ),
    );
    expect(critical.filter(Boolean)).toHaveLength(80);
    expect(await reserve(null)).toBe(false);
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM incident_groups",
        )
      ).rows[0].n,
    ).toBe(29);
    await db.exec("DELETE FROM incident_daily_budgets;");
    expect(await reserve("00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT incident_reserve_sentry() AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(true);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT has_function_privilege('anon','incident_reserve_sentry(uuid)','EXECUTE') AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  } finally {
    await db.close();
  }
}, 30000);
