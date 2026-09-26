import { pathToFileURL } from "node:url";

export function assertLocalSeedTarget(databaseUrl, environment) {
  if (environment !== "local" && environment !== "test") {
    throw new Error("Seeding requires a local or test environment");
  }
  const parsed = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error("Seeding requires a local database URL");
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  assertLocalSeedTarget(
    process.env.OPS_DATABASE_URL ?? "",
    process.env.OPS_ENV ?? "",
  );
  throw new Error("OS seed data is not implemented yet");
}
