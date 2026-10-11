// Read-only metadata checks. Never reserve a generation or return secret values.
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const flags = [
  "MOBILE_WEB_APP_ENABLED",
  "PUBLIC_MOBILE_WEB_APP_ENABLED",
  "LISTING_DRAFTS_ENABLED",
  "PUBLIC_LISTING_DRAFTS_ENABLED",
];
const requiredFunctions = [
  "reserve_generation_request_for_current_status",
  "claim_mobile_generation_idempotency",
  "reserve_and_bind_mobile_generation_reservation",
  "bind_mobile_generation_reservation",
  "mark_mobile_generation_commit_pending",
  "complete_mobile_generation_idempotency",
  "cleanup_expired_mobile_generation_idempotency",
];

async function getJson(url, headers) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(`Metadata request failed: HTTP ${response.status}`);
  return response.json();
}

const report = { checkedAt: new Date().toISOString() };
const options = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const separator = argument.indexOf("=");
    return [argument.slice(2, separator), argument.slice(separator + 1)];
  }),
);
try {
  const auth = JSON.parse(
    await readFile(
      options["vercel-auth"] ||
        join(homedir(), ".local/share/com.vercel.cli/auth.json"),
      "utf8",
    ),
  );
  const config = JSON.parse(
    await readFile(
      options["vercel-config"] ||
        join(homedir(), ".local/share/com.vercel.cli/config.json"),
      "utf8",
    ),
  );
  const headers = { Authorization: `Bearer ${auth.token}` };
  const scope = new URLSearchParams({ teamId: config.currentTeam });
  let projects;
  try {
    projects = await getJson(
      `https://api.vercel.com/v9/projects?${scope}&limit=100`,
      headers,
    );
  } catch {
    scope.delete("teamId");
    projects = await getJson(
      "https://api.vercel.com/v9/projects?limit=100",
      headers,
    );
  }
  const project = projects.projects.find(
    (item) =>
      item.link?.repo === "quick-vint-api" && item.link?.org === "samicodesit",
  );
  if (!project)
    throw new Error(
      "Could not match the backend repository to a Vercel project",
    );
  scope.set("teamId", project.accountId);
  report.project = {
    id: project.id,
    name: project.name,
    productionBranch: project.link?.productionBranch,
  };
  report.previewProtection = {
    sso: project.ssoProtection?.deploymentType || null,
    password: Boolean(project.passwordProtection),
  };
  const variables = await getJson(
    `https://api.vercel.com/v10/projects/${project.id}/env?${scope}`,
    headers,
  );
  const environmentItems = Array.isArray(variables)
    ? variables
    : variables.envs || [];
  report.environmentVariableNames = environmentItems.map((item) => item.key);
  report.flags = [];
  for (const variable of environmentItems) {
    if (!flags.includes(variable.key)) continue;
    const value = await getJson(
      `https://api.vercel.com/v9/projects/${project.id}/env/${variable.id}?${scope}`,
      headers,
    );
    report.flags.push({
      key: variable.key,
      targets: variable.target,
      branch: variable.gitBranch || null,
      enabled: value.value === "true",
    });
  }
  report.databaseCredentialVariables = environmentItems
    .filter((item) =>
      /SUPABASE_(ACCESS_TOKEN|DB)|DATABASE_URL|POSTGRES/.test(item.key),
    )
    .map((item) => ({ key: item.key, targets: item.target }));
} catch (error) {
  report.vercelError = error.message;
}
try {
  const backendEnv = options["backend-env"]
    ? await readFile(options["backend-env"], "utf8")
    : "";
  const fileValue = (name) => {
    const line = backendEnv
      .split(/\r?\n/)
      .find((value) => value.startsWith(`${name}=`));
    const value = line?.slice(name.length + 1).trim();
    return value?.replace(/^(["'])(.*)\1$/, "$2");
  };
  const url =
    process.env.VERCEL_APP_SUPABASE_URL || fileValue("VERCEL_APP_SUPABASE_URL");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    fileValue("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key)
    throw new Error(
      "Load existing backend credentials into this process to check schema metadata",
    );
  const schema = await getJson(`${url.replace(/\/$/, "")}/rest/v1/`, {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/openapi+json",
  });
  report.schema = {
    tables: [
      "profiles",
      "generation_reservations",
      "mobile_generation_idempotency",
    ].map((name) => ({ name, present: Boolean(schema.definitions?.[name]) })),
    functions: requiredFunctions.map((name) => ({
      name,
      present: Boolean(schema.paths?.[`/rpc/${name}`]),
      parameters: (schema.paths?.[`/rpc/${name}`]?.post?.parameters || []).find(
        (item) => item.in === "body",
      )?.schema?.properties
        ? Object.keys(
            schema.paths[`/rpc/${name}`].post.parameters.find(
              (item) => item.in === "body",
            ).schema.properties,
          )
        : [],
    })),
  };
  report.profileColumns = Object.entries(
    schema.definitions?.profiles?.properties || {},
  ).map(([name, definition]) => ({
    name,
    type: definition.format || definition.type,
  }));
  report.baselineColumns = Object.fromEntries(
    [
      "profiles",
      "rate_limits",
      "daily_stats",
      "system_settings",
      "credit_ledger",
    ].map((table) => [
      table,
      Object.entries(schema.definitions?.[table]?.properties || {}).map(
        ([name, definition]) => ({
          name,
          type: definition.format || definition.type,
        }),
      ),
    ]),
  );
  report.catalogReadFunctions = Object.keys(schema.paths || {}).filter((path) =>
    /\/rpc\/(.*schema.*|.*sql.*|.*query.*|.*migration.*)/.test(path),
  );
  report.prerequisitesPresent =
    report.schema.tables.every((item) => item.present) &&
    report.schema.functions.every((item) => item.present);
  // NULL cannot match the NOT NULL profile primary key. Both known migration
  // versions return before the reservation call on this branch. No user rows,
  // claims, reservations or credits are created by this compatibility probe.
  if (options["probe-extension"] === "true" && report.prerequisitesPresent) {
    const response = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/rpc/reserve_and_bind_mobile_generation_reservation`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_user_id: null,
          p_record_id: null,
          p_attempt_id: null,
          p_client: "extension",
          p_request_id: "00000000-0000-4000-8000-000000000000",
          p_request_hash: "0".repeat(64),
          p_pricing_limits_mode: "current",
          p_effective_tier: "free",
          p_monthly_limit: 0,
          p_daily_limit: 0,
          p_burst_limit: 0,
          p_free_lifetime_limit: 0,
          p_has_unlimited_daily: false,
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new Error(`Compatibility probe failed: HTTP ${response.status}`);
    const result = await response.json();
    report.extensionCompatibilityProbe = {
      allowed: result.allowed,
      code: result.code,
      clientAcceptedBeforeMissingProfile:
        result.allowed === false &&
        result.code === "service_unavailable" &&
        result.error === "Could not retrieve profile.",
    };
  }
  report.limitations =
    "OpenAPI proves exposed objects and signatures only. Function bodies, grants and extension client constraints require database catalog verification before release.";
} catch (error) {
  report.schemaError = error.message;
}
console.log(
  JSON.stringify(
    {
      checkedAt: report.checkedAt,
      project: report.project,
      previewProtection: report.previewProtection,
      flags: report.flags,
      databaseCredentialVariables: report.databaseCredentialVariables,
      environmentVariableNames: report.environmentVariableNames,
      prerequisitesPresent: report.prerequisitesPresent,
      extensionCompatibilityProbe: report.extensionCompatibilityProbe,
      vercelError: report.vercelError,
      schemaError: report.schemaError,
    },
    null,
    2,
  ),
);
if (options.report)
  await writeFile(options.report, JSON.stringify(report, null, 2) + "\n");
if (
  !report.prerequisitesPresent ||
  report.vercelError ||
  report.extensionCompatibilityProbe?.clientAcceptedBeforeMissingProfile ===
    false
)
  process.exitCode = 2;
