import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const executable = process.env.OPS_TEST_PSQL;
if (!executable)
  throw new Error("OPS_TEST_PSQL must point to a local test psql executable");
const port = process.env.OPS_TEST_PGPORT;
if (!port)
  throw new Error(
    "OPS_TEST_PGPORT must identify an isolated local test cluster",
  );

export function sql(statement: string, database = "postgres") {
  const output = execFileSync(
    executable,
    [
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      "127.0.0.1",
      "-p",
      port,
      "-U",
      "postgres",
      "-d",
      database,
    ],
    {
      input: statement,
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    },
  );
  return output.trim();
}

export function createTestDatabase() {
  const name = `ops_test_${randomUUID().replaceAll("-", "")}`;
  sql(`CREATE DATABASE ${name};`);
  sql(
    `CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
    GRANT USAGE ON SCHEMA public TO authenticated;`,
    name,
  );
  return name;
}

export function applyMigration(database: string, relativePath: string) {
  const body = readFileSync(relativePath, "utf8");
  sql(body, database);
}

export function dropTestDatabase(database: string) {
  if (!/^ops_test_[a-f0-9]{32}$/.test(database))
    throw new Error("Refusing non-test database drop");
  sql(`DROP DATABASE ${database};`);
}
