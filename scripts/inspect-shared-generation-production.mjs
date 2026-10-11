// Catalog-only release inspection using the operator's existing Supabase login.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const env = await readFile("/home/mests/projects/quick-vint-api/.env", "utf8");
const url = env
  .match(/^VERCEL_APP_SUPABASE_URL=(.+)$/m)?.[1]
  .trim()
  .replace(/^['"]|['"]$/g, "");
if (!url) throw new Error("Existing project URL is missing");
const ref = new URL(url).hostname.split(".")[0];
const token = (
  await readFile("/home/mests/.supabase/access-token", "utf8")
).trim();
const query = `SELECT jsonb_build_object(
  'functions', (SELECT jsonb_agg(jsonb_build_object(
    'name', p.proname, 'arguments', pg_get_function_identity_arguments(p.oid),
    'body', p.prosrc, 'securityDefiner', p.prosecdef, 'config', p.proconfig,
    'acl', p.proacl::text,
    'anonExecute', has_function_privilege('anon', p.oid, 'EXECUTE'),
    'authenticatedExecute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    'serviceExecute', has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE '%mobile_generation%' OR p.proname IN ('reserve_generation_request_for_current_status', 'get_generation_reservation_status'))),
  'constraints', (SELECT jsonb_agg(jsonb_build_object('name', conname, 'definition', pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid='public.mobile_generation_idempotency'::regclass),
  'tableSecurity', (SELECT jsonb_build_object('rls', relrowsecurity, 'acl', relacl::text) FROM pg_class WHERE oid='public.mobile_generation_idempotency'::regclass),
  'databaseCronPresent', to_regclass('cron.job') IS NOT NULL
) AS catalog;`;
const response = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, read_only: true }),
    signal: AbortSignal.timeout(30000),
  },
);
if (!response.ok)
  throw new Error(
    `Supabase catalog access failed: HTTP ${response.status}: ${(await response.text()).replaceAll(token, "[redacted]").slice(0, 1500)}`,
  );
const rows = await response.json();
const catalog = rows[0]?.catalog;
if (!catalog) throw new Error("No catalog returned");
const oldSql = await readFile(
  resolve(root, "migrations/2026-09-23_mobile_web_generation_idempotency.sql"),
  "utf8",
);
const newSql = await readFile(
  resolve(root, "migrations/2026-10-11_shared_generation_retry_protection.sql"),
  "utf8",
);
const body = (sql, name) =>
  sql
    .match(
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`,
      ),
    )?.[1]
    .trim();
const checks = catalog.functions.map((f) => ({
  name: f.name,
  matchesSeptember: body(oldSql, f.name) === f.body.trim(),
  matchesOctober: body(newSql, f.name) === f.body.trim(),
  serviceOnly: !f.anonExecute && !f.authenticatedExecute && f.serviceExecute,
}));
if (process.argv.includes("--apply")) {
  const binderName = "reserve_and_bind_mobile_generation_reservation";
  const binder = catalog.functions.find((f) => f.name === binderName);
  const constraint = catalog.constraints.find(
    (c) => c.name === "mobile_generation_idempotency_client_check",
  );
  if (
    binder?.body.trim() === body(newSql, binderName) &&
    constraint?.definition.includes("extension")
  ) {
    console.log("Shared migration is already applied");
  } else {
    if (
      !binder ||
      binder.body.trim() !== body(oldSql, binderName) ||
      !checks.every((c) => c.serviceOnly) ||
      !catalog.tableSecurity.rls ||
      constraint?.definition !== "CHECK ((client = 'mobile_web'::text))"
    ) {
      throw new Error(
        "Production catalog differs from the tested baseline; refusing migration",
      );
    }
    await writeFile(
      resolve(
        root,
        "docs/qa/browser-drafts/production-generation-catalog-before.json",
      ),
      JSON.stringify(
        { checkedAt: new Date().toISOString(), catalog, checks },
        null,
        2,
      ) + "\n",
    );
    const guard = `SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s';
DO $guard$ BEGIN
IF (SELECT btrim(prosrc, chr(32)||chr(10)||chr(13)||chr(9)) FROM pg_proc WHERE oid='public.reserve_and_bind_mobile_generation_reservation(uuid,uuid,uuid,text,uuid,text,text,text,integer,integer,integer,integer,boolean)'::regprocedure) IS DISTINCT FROM $expected$${body(oldSql, binderName)}$expected$ THEN
RAISE EXCEPTION 'Production binder changed since inspection'; END IF;
END $guard$;`;
    const applied = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: newSql.replace("BEGIN;", () => `BEGIN;\n${guard}`),
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!applied.ok)
      throw new Error(
        `Migration failed: HTTP ${applied.status}: ${(await applied.text()).replaceAll(token, "[redacted]").slice(0, 1500)}`,
      );
    console.log(
      "Shared migration transaction completed. Run catalog inspection again to verify.",
    );
  }
}
const report = { checkedAt: new Date().toISOString(), catalog, checks };
await writeFile(
  resolve(root, "docs/qa/browser-drafts/production-generation-catalog.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      checks,
      constraints: catalog.constraints,
      tableSecurity: catalog.tableSecurity,
      cleanupJobs: catalog.cleanupJobs,
    },
    null,
    2,
  ),
);
