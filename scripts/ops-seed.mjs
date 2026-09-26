import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

export function assertLocalSeedTarget(databaseUrl, environment) {
  if (environment !== "local" && environment !== "test") {
    throw new Error("Seeding requires a local or test environment");
  }
  const parsed = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error("Seeding requires a local database URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !/^\/ops_test_[a-f0-9]{32}$/.test(parsed.pathname)
  ) {
    throw new Error("Seeding requires an isolated local test database");
  }
}

export function seedLocalWorkspace(databaseUrl, environment, psqlExecutable) {
  assertLocalSeedTarget(databaseUrl, environment);
  if (!psqlExecutable) throw new Error("A local psql executable is required");
  const parsed = new URL(databaseUrl);
  const statement = `
    INSERT INTO ops_workspaces(id,name,created_by) VALUES
      ('c0000000-0000-4000-8000-000000000101','Fixture Seller A','a0000000-0000-4000-8000-000000000101'),
      ('c0000000-0000-4000-8000-000000000102','Fixture Seller B','b0000000-0000-4000-8000-000000000102')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO ops_memberships(workspace_id,user_id,role) VALUES
      ('c0000000-0000-4000-8000-000000000101','a0000000-0000-4000-8000-000000000101','owner'),
      ('c0000000-0000-4000-8000-000000000102','b0000000-0000-4000-8000-000000000102','owner')
    ON CONFLICT (workspace_id,user_id) DO NOTHING;
  `;
  execFileSync(
    psqlExecutable,
    [
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      parsed.hostname,
      "-p",
      parsed.port,
      "-U",
      parsed.username,
      "-d",
      parsed.pathname.slice(1),
    ],
    { input: statement, encoding: "utf8", timeout: 10_000, windowsHide: true },
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  seedLocalWorkspace(
    process.env.OPS_DATABASE_URL ?? "",
    process.env.OPS_ENV ?? "",
    process.env.OPS_TEST_PSQL ?? "psql",
  );
}
