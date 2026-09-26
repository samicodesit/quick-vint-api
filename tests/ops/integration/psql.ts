import { execFileSync, spawn } from "node:child_process";
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

export function sqlAsync(
  statement: string,
  database = "postgres",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
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
      { windowsHide: true },
    );
    let output = "";
    let errors = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      errors += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(output.trim()) : reject(new Error(errors)),
    );
    child.stdin.end(statement);
  });
}

export function createTestDatabase() {
  const name = `ops_test_${randomUUID().replaceAll("-", "")}`;
  sql(`CREATE DATABASE ${name};`);
  sql(
    `CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
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
