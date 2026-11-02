import { PGlite } from "@electric-sql/pglite";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { normalizeIncidentEvent } from "../../../utils/incidents/contract";

let db: PGlite;
const outbound = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: outbound.send };
  },
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    rpc: (name: string, args: any) => ({
      abortSignal: async () => {
        if (name === "incident_claim_notifications")
          return {
            data: (
              await db.query("SELECT * FROM incident_claim_notifications($1)", [
                args.p_limit,
              ])
            ).rows,
          };
        if (name === "incident_freeze_notification")
          return {
            data: (
              await db.query<any>(
                "SELECT incident_freeze_notification($1,$2,$3) AS value",
                [args.p_id, args.p_key, JSON.stringify(args.p_email)],
              )
            ).rows[0].value,
          };
        throw Error("Unexpected RPC");
      },
    }),
    from: (table: string) => {
      if (table !== "incident_groups")
        throw Error(
          "Native auth policy should not make a separate sampled recovery lookup",
        );
      return {
        update: (values: Record<string, any>) => {
          const filters: Array<[string, unknown]> = [];
          const q = {
            eq: (key: string, value: unknown) => {
              filters.push([key, value]);
              return q;
            },
            abortSignal: async () => {
              const params: unknown[] = [];
              const assignments = Object.entries(values).map(([key, value]) => {
                params.push(value);
                return key + "=$" + params.length;
              });
              const where = filters.map(([key, value]) => {
                params.push(value);
                return key + "=$" + params.length;
              });
              await db.query(
                "UPDATE incident_groups SET " +
                  assignments.join(",") +
                  " WHERE " +
                  where.join(" AND "),
                params,
              );
              return { error: null };
            },
          };
          return q;
        },
      };
    },
  },
}));
import { deliverPendingNotifications } from "../../../utils/incidents/notifications";
let now: number;
const owner = "123e4567-e89b-42d3-a456-426614174000";
const migration = "migrations/2026-10-19_actionable_auth_email_policy.sql";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;",
  );
  await db.exec(
    "CREATE TABLE api_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),user_id uuid,user_email text,endpoint text,request_method text,response_status integer,user_agent text,origin text,ip_address text,full_request_body jsonb)",
  );
  await db.exec(
    readFileSync("migrations/2026-10-03_incident_tracking.sql", "utf8"),
  );
  // PGlite is single-connection. The separate native harness exercises actual
  // concurrent index builds with active writers.
  await db.exec(
    readFileSync(
      "migrations/2026-10-19_actionable_auth_email_indexes.sql",
      "utf8",
    ).replace(/ CONCURRENTLY/g, ""),
  );
  if (existsSync(migration)) await db.exec(readFileSync(migration, "utf8"));
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "TRUNCATE incident_receipts,incident_flows,incident_groups,incident_daily_budgets,api_logs CASCADE",
  );
  now = Date.parse((await db.query<any>("SELECT now() AS at")).rows[0].at);
  outbound.send.mockReset();
  outbound.send.mockImplementation(async (email: any) => {
    const qaDir = process.env.AUTH_EMAIL_QA_DIR;
    if (qaDir) {
      mkdirSync(qaDir, { recursive: true });
      writeFileSync(
        qaDir +
          "/" +
          email.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
          ".html",
        email.html,
      );
    }
    return { data: { id: "controlled-resend-id" } };
  });
});

async function failure(
  minutes: number,
  client = "browser-a",
  account = owner,
  entryPoint = "scheduled_refresh",
  version = "1.4.21",
) {
  const operation = randomUUID();
  const value = normalizeIncidentEvent({
    id: randomUUID(),
    event: "token_refresh_failed",
    occurredAt: new Date(now - minutes * 60000).toISOString(),
    source: "extension_background",
    extensionVersion: version,
    context: {
      operationId: operation,
      analyticsClientId: client,
      entryPoint,
      message: "Failed to fetch",
      status: 0,
    },
  }).value!;
  const withLog = {
    ...value,
    businessLog: {
      endpoint: "/event/token_refresh_failed",
      request_method: "POST",
      response_status: 200,
      full_request_body: {
        event: value.event,
        source: value.source,
        extensionVersion: version,
        context: value.context,
      },
    },
  };
  const result = (
    await db.query<any>(
      "SELECT incident_ingest($1::jsonb,$2::uuid,true) AS result",
      [JSON.stringify(withLog), account],
    )
  ).rows[0].result;
  return {
    operation,
    client,
    account,
    incidentId: result.incidentId,
    eventId: value.id,
  };
}
async function outcome(
  ref: Awaited<ReturnType<typeof failure>>,
  minutes = 0,
  overrides: any = {},
) {
  const body = {
    source: "extension_background",
    extensionVersion: "1.4.21",
    occurredAt: new Date(now - minutes * 60000).toISOString(),
    context: {
      operationId: ref.operation,
      analyticsClientId: ref.client,
      authRefreshOperationId: randomUUID(),
      resultStatus: "silent_renewed",
      reason: "token_refresh_success",
      signInRequired: false,
      ...overrides,
    },
  };
  const normalized = normalizeIncidentEvent({
    ...body,
    event: "auth_session_result",
    id: randomUUID(),
  }).value!;
  await db.query("SELECT incident_ingest($1::jsonb,$2::uuid,true)", [
    JSON.stringify({
      ...normalized,
      businessLog: {
        endpoint: "/event/auth_session_result",
        request_method: "POST",
        response_status: 204,
        full_request_body: body,
      },
    }),
    ref.account,
  ]);
}
async function claim() {
  return (await db.query<any>("SELECT * FROM incident_claim_notifications(20)"))
    .rows;
}
async function retainAuthAction(params: [string, string]) {
  const body = JSON.parse(params[1]);
  const normalized = normalizeIncidentEvent({
    ...body,
    event: "auth_action_result",
    id: randomUUID(),
  }).value!;
  await db.query("SELECT incident_ingest($1::jsonb,$2::uuid,true)", [
    JSON.stringify({
      ...normalized,
      businessLog: {
        endpoint: "/event/auth_action_result",
        request_method: "POST",
        response_status: 204,
        full_request_body: body,
      },
    }),
    params[0],
  ]);
}
async function group() {
  return (await db.query<any>("SELECT * FROM incident_groups")).rows[0];
}
async function budget() {
  return (await db.query<any>("SELECT emails FROM incident_daily_budgets"))
    .rows[0].emails;
}
it("retains background diagnostics without evaluating notification policy during ingest", async () => {
  const signature = (
    await db.query<any>(
      "SELECT pg_get_function_identity_arguments(oid) AS args FROM pg_proc WHERE proname='incident_prepare_auth_notifications'",
    )
  ).rows[0].args;
  await db.exec(
    `ALTER FUNCTION incident_prepare_auth_notifications(${signature}) RENAME TO disabled_notification_policy`,
  );
  try {
    await failure(8);
    await failure(4);
    await failure(1);
    expect(
      (await db.query<any>("SELECT count(*)::int AS n FROM incident_receipts"))
        .rows[0].n,
    ).toBe(3);
    expect(await group()).toMatchObject({
      notification_status: "pending",
      notification_budget_day: null,
    });
    expect(await budget()).toBe(0);
  } finally {
    await db.exec(
      `ALTER FUNCTION disabled_notification_policy(${signature}) RENAME TO incident_prepare_auth_notifications`,
    );
  }
});
it("does not let frozen retry mail starve policy evaluation for another affected cohort", async () => {
  const affected = await failure(8);
  await failure(6);
  await failure(1);
  await db.exec(`INSERT INTO incident_groups(fingerprint,event,source,severity,release,market,stage,notification_status,notification_payload,notification_next_at)
    SELECT 'frozen-'||n,'token_refresh_failed','extension_background','transient','1.4.21','unknown','authenticating','failed','{"email":{"subject":"Already frozen"}}'::jsonb,NULL FROM generate_series(1,50)n`);
  await db.query("SELECT incident_prepare_auth_notifications()");
  const actual = (
    await db.query<any>(
      "SELECT notification_payload FROM incident_groups WHERE id=$1",
      [affected.incidentId],
    )
  ).rows[0];
  expect(actual.notification_payload.authPolicy?.reason).toBe("persistent");
});
it("prioritizes and assesses queued background mail before quiet cohorts", async () => {
  await failure(8);
  await failure(6);
  await failure(1);
  await db.exec(`INSERT INTO incident_groups(fingerprint,event,source,severity,release,market,stage)
    SELECT 'quiet-'||n,'token_refresh_failed','extension_background','transient','1.4.21','unknown','authenticating' FROM generate_series(1,50)n`);
  const later = await claim();
  expect(later).toHaveLength(1);
  expect(later[0].notification_payload.authPolicy.reason).toBe("persistent");
});
it("keeps the existing alert path when retained cohort evidence is no longer available", async () => {
  await failure(8);
  await failure(6);
  await failure(1);
  await db.exec(
    "UPDATE incident_receipts SET occurred_at=now()-interval '7 hours'",
  );
  expect(await claim()).toHaveLength(1);
  expect((await group()).status).toBe("open");
});
it("leaves quiet cohorts until due and wakes only the owner-referenced cohort on new auth evidence", async () => {
  const first = await failure(3);
  await failure(2);
  await failure(1);
  expect(await claim()).toHaveLength(0);
  const scheduled = (await group()).notification_next_at;
  await claim();
  expect(Date.parse((await group()).notification_next_at)).toBe(
    Date.parse(scheduled),
  );
  await outcome(first);
  expect(Date.parse((await group()).notification_next_at)).toBeLessThanOrEqual(
    Date.now(),
  );
  expect(await claim()).toHaveLength(0);
  expect(Date.parse((await group()).notification_next_at)).toBeGreaterThan(
    Date.now(),
  );
});
async function sent(row: any) {
  await db.query("SELECT incident_freeze_notification($1,$2,$3)", [
    row.id,
    row.notification_key,
    JSON.stringify({
      subject: "controlled fixture",
      html: "controlled fixture",
    }),
  ]);
  await db.query(
    "UPDATE incident_groups SET notification_status='sent',notified_at=now() WHERE id=$1",
    [row.id],
  );
}

it("does not claim mail for a recovered real SQL queue snapshot, retaining all diagnostic evidence and refunding its reservation", async () => {
  const baseline = readFileSync(
    "migrations/2026-10-03_incident_tracking.sql",
    "utf8",
  );
  for (const name of ["incident_ingest", "incident_claim_notifications"]) {
    const start = baseline.indexOf("CREATE FUNCTION " + name + "(");
    const end = baseline.indexOf("END $$;", start) + 7;
    await db.exec(
      baseline
        .slice(start, end)
        .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"),
    );
  }
  const first = await failure(3);
  await failure(2);
  await failure(1);
  expect((await group()).notification_payload.source).toBeUndefined();
  expect((await group()).notification_payload.example.source).toBe(
    "extension_background",
  );
  await outcome(first);
  await db.exec(readFileSync(migration, "utf8"));
  expect(await claim()).toHaveLength(0);
  expect(await group()).toMatchObject({
    status: "open",
    occurrences: 3,
    notification_status: "quiet",
  });
  expect((await db.query("SELECT * FROM incident_receipts")).rows).toHaveLength(
    4,
  );
  expect((await db.query("SELECT * FROM incident_flows")).rows).toHaveLength(3);
  expect(await budget()).toBe(0);
  await claim();
  expect(await budget()).toBe(0);
});

it("does not email an isolated burst without proven impact, but alerts when actual retries persist for five minutes", async () => {
  await failure(6);
  await failure(5);
  await failure(4);
  expect(await claim()).toHaveLength(0);
  await failure(0);
  const rows = await claim();
  expect(rows).toHaveLength(1);
  expect(rows[0].notification_payload.authPolicy).toMatchObject({
    reason: "persistent",
    persistentClients: 1,
  });
  expect(await budget()).toBe(1);
});

it("does not mute an unrecovered persistent client because another client in the group recovered", async () => {
  const recovering = await failure(9, "browser-a");
  await failure(7, "browser-a");
  await failure(3, "browser-a");
  await failure(8, "browser-b");
  await failure(6, "browser-b");
  await failure(1, "browser-b");
  await outcome(recovering);
  const rows = await claim();
  expect(rows).toHaveLength(1);
  expect(rows[0].notification_payload.authPolicy).toMatchObject({
    reason: "persistent",
    persistentClients: 1,
    recoveredClients: 1,
  });
  expect(rows[0].notification_payload.example.context.analyticsClientId).toBe(
    "browser-b",
  );
});

it("keeps an actual blocked Generate alert even when the background session renewed", async () => {
  const first = await failure(3);
  await failure(2);
  await failure(1);
  await outcome(first);
  await retainAuthAction([
    owner,
    JSON.stringify({
      source: "extension_content",
      extensionVersion: "1.4.21",
      occurredAt: new Date(now - 30000).toISOString(),
      context: {
        analyticsClientId: first.client,
        authRefreshOperationId: first.operation,
        operationId: randomUUID(),
        entryPoint: "generate",
        resultStatus: "blocked",
        statusCode: 401,
        reason: "unauthorized",
        generationAttemptId: "gen-controlled",
      },
    }),
  ]);
  const rows = await claim();
  expect(rows).toHaveLength(1);
  expect(rows[0].notification_payload.authPolicy).toMatchObject({
    reason: "blocked",
    blockedClients: 1,
  });
});

it("does not borrow a renewal from another authenticated owner", async () => {
  const first = await failure(8);
  await failure(6);
  await failure(1);
  await outcome({ ...first, account: "123e4567-e89b-42d3-a456-426614174001" });
  const rows = await claim();
  expect(rows).toHaveLength(1);
  expect(rows[0].notification_payload.authPolicy.reason).toBe("persistent");
});

it("alerts for failures across three browser clients without calling them three affected users", async () => {
  await failure(3, "a");
  await failure(2, "b");
  await failure(1, "c");
  const rows = await claim();
  expect(rows).toHaveLength(1);
  expect(rows[0].notification_payload.authPolicy).toMatchObject({
    reason: "widespread",
    unrecoveredClients: 3,
  });
  await db.query(
    "UPDATE incident_groups SET notification_locked_until=NULL WHERE id=$1",
    [rows[0].id],
  );
  expect(await deliverPendingNotifications()).toEqual({ sent: 1, failed: 0 });
  expect(outbound.send.mock.calls[0][0].subject).toBe(
    "AutoLister: renewal failures across browser clients",
  );
});

it("preserves foreground failures sharing the fingerprint", async () => {
  const first = await failure(3);
  await failure(2);
  await failure(1, "browser-a", owner, "generate");
  await outcome(first);
  expect(await claim()).toHaveLength(1);
});

it("sends one session-recovery update only after an actual prior alert, then permits later genuine recurrence", async () => {
  const first = await failure(8);
  await failure(6);
  await failure(1);
  const original = (await claim())[0];
  await sent(original);
  await outcome(first);
  const recovery = (await claim())[0];
  expect(recovery).toBeDefined();
  expect(recovery.notification_payload.authPolicy.reason).toBe("recovery");
  expect(recovery.notification_key).not.toBe(original.notification_key);
  await sent(recovery);
  expect(await claim()).toHaveLength(0);
  // One new failure after renewal is not a persistent recurrence.
  now = Date.parse((await db.query<any>("SELECT now() AS at")).rows[0].at);
  await failure(0);
  expect(await claim()).toHaveLength(0);
  // Move only fixture history back to exercise a second real episode after
  // the verified renewal, without a wall-clock wait or borrowing old failures.
  await db.exec(
    "UPDATE incident_receipts SET occurred_at=occurred_at-interval '10 minutes'; UPDATE api_logs SET full_request_body=jsonb_set(full_request_body,'{occurredAt}',to_jsonb((full_request_body->>'occurredAt')::timestamptz-interval '10 minutes')) WHERE endpoint='/event/auth_session_result'",
  );
  await failure(8);
  await failure(6);
  await failure(1);
  const recurrence = await claim();
  expect(recurrence).toHaveLength(1);
  expect(recurrence[0].notification_payload.authPolicy.reason).toBe(
    "persistent",
  );
});

it("preserves immutable email/idempotency identity after an ambiguous first send", async () => {
  const first = await failure(8);
  await failure(6);
  await failure(1);
  const row = (await claim())[0];
  const email = { subject: "Already attempted", html: "Exact frozen HTML" };
  await db.query("SELECT incident_freeze_notification($1,$2,$3)", [
    row.id,
    row.notification_key,
    JSON.stringify(email),
  ]);
  await outcome(first);
  await db.query(
    "UPDATE incident_groups SET notification_locked_until=NULL WHERE id=$1",
    [row.id],
  );
  const retry = (await claim())[0];
  expect(retry.notification_key).toBe(row.notification_key);
  expect(retry.notification_payload.email).toEqual(email);
});

it("does not let quiet background bursts consume the email budget before delivery and crowd out genuine alerts", async () => {
  for (let i = 0; i < 20; i++) {
    for (const minute of [3, 2, 1])
      await failure(
        minute,
        "browser-" + i,
        owner,
        "scheduled_refresh",
        "1.4.21." + i,
      );
  }
  expect(await budget()).toBe(0);
  expect(await claim()).toHaveLength(0);
  expect(
    (
      await db.query(
        "SELECT * FROM incident_groups WHERE notification_status<>'quiet'",
      )
    ).rows,
  ).toHaveLength(0);
  const real = normalizeIncidentEvent({
    id: randomUUID(),
    event: "fields_apply_failed",
    occurredAt: new Date().toISOString(),
    source: "extension_content",
    extensionVersion: "1.4.21",
    context: { message: "Actual field rejection", operationId: randomUUID() },
  }).value!;
  await db.query("SELECT incident_ingest($1,$2,true)", [
    JSON.stringify(real),
    owner,
  ]);
  const actionable = await claim();
  expect(actionable).toHaveLength(1);
  expect(actionable[0].event).toBe("fields_apply_failed");
  expect(await budget()).toBe(1);
});

it("recognizes a same-client return after an hour without treating old unrecovered history as new persistence", async () => {
  const first = await failure(8);
  await failure(6);
  await failure(1);
  expect(await deliverPendingNotifications()).toEqual({ sent: 1, failed: 0 });
  await db.exec(
    "UPDATE incident_receipts SET occurred_at=occurred_at-interval '1 hour'; UPDATE incident_groups SET first_seen=first_seen-interval '1 hour',last_seen=last_seen-interval '1 hour',notification_payload=jsonb_set(notification_payload,'{authPolicy,windowStart}',to_jsonb((notification_payload->'authPolicy'->>'windowStart')::timestamptz-interval '1 hour'))",
  );
  await outcome(first);
  expect(await deliverPendingNotifications()).toEqual({ sent: 1, failed: 0 });
  expect(outbound.send.mock.calls[1][0].subject).toBe(
    "AutoLister: session renewal recovered",
  );
});

it.each([1, 2, 3])(
  "runs real ingest, SQL policy, claim, render and freeze without recovered-only mail, then delivers a genuine blocked-action alert (run %s)",
  async () => {
    const first = await failure(8);
    await failure(6);
    await failure(1);
    await outcome(first);
    expect(await deliverPendingNotifications()).toEqual({ sent: 0, failed: 0 });
    expect(outbound.send).not.toHaveBeenCalled();
    expect(await group()).toMatchObject({
      status: "open",
      notification_status: "quiet",
      occurrences: 3,
    });
    await retainAuthAction([
      owner,
      JSON.stringify({
        source: "extension_content",
        extensionVersion: "1.4.21",
        occurredAt: new Date(now - 30000).toISOString(),
        context: {
          analyticsClientId: first.client,
          authRefreshOperationId: first.operation,
          operationId: randomUUID(),
          entryPoint: "generate",
          resultStatus: "blocked",
          statusCode: 401,
          generationAttemptId: "gen-controlled",
        },
      }),
    ]);
    expect(await deliverPendingNotifications()).toEqual({ sent: 1, failed: 0 });
    expect(outbound.send).toHaveBeenCalledTimes(1);
    expect(outbound.send.mock.calls[0][0].subject).toBe(
      "AutoLister: user action interrupted",
    );
    expect(outbound.send.mock.calls[0][0].html).toContain(
      "Session renewal alone does not establish Generate recovery",
    );
    expect(await group()).toMatchObject({
      status: "open",
      notification_status: "sent",
      occurrences: 3,
    });
  },
);

it("delivers one actual recovery notice after a persistent-failure email and no repeated recovery mail", async () => {
  const first = await failure(8);
  await failure(6);
  await failure(1);
  expect(await deliverPendingNotifications()).toEqual({ sent: 1, failed: 0 });
  await outcome(first);
  expect(await deliverPendingNotifications()).toEqual({ sent: 1, failed: 0 });
  expect(outbound.send.mock.calls.map((call) => call[0].subject)).toEqual([
    "AutoLister: persistent background renewal failures",
    "AutoLister: session renewal recovered",
  ]);
  expect(await deliverPendingNotifications()).toEqual({ sent: 0, failed: 0 });
  expect(outbound.send).toHaveBeenCalledTimes(2);
});

it("states an actual sign-in requirement separately from a blocked Generate action", async () => {
  const first = await failure(3);
  await failure(2);
  await failure(1);
  await outcome(first, 0, {
    resultStatus: "signed_in",
    reason: "auth_success",
    signInRequired: true,
  });
  expect(await deliverPendingNotifications()).toEqual({ sent: 1, failed: 0 });
  expect(outbound.send.mock.calls[0][0].html).toContain(
    "Sign-in was required in 1 browser client.",
  );
  expect(outbound.send.mock.calls[0][0].html).not.toContain(
    "Generate was blocked",
  );
});

it("alerts on a new blocked action linked to an older quiet background failure", async () => {
  const first = await failure(45);
  await failure(44);
  await failure(43);
  expect(await deliverPendingNotifications()).toEqual({ sent: 0, failed: 0 });
  await retainAuthAction([
    owner,
    JSON.stringify({
      source: "extension_content",
      extensionVersion: "1.4.21",
      occurredAt: new Date(now - 1000).toISOString(),
      context: {
        analyticsClientId: first.client,
        authRefreshOperationId: first.operation,
        operationId: randomUUID(),
        entryPoint: "generate",
        resultStatus: "blocked",
        statusCode: 401,
        generationAttemptId: "gen-returned",
      },
    }),
  ]);
  expect(await deliverPendingNotifications()).toEqual({ sent: 1, failed: 0 });
  expect(outbound.send.mock.calls[0][0].html).toContain(
    "Generate was blocked in 1 browser client.",
  );
});

it("keeps an actionable failure visibly suppressed at the existing email cap, then retries when allowance is available", async () => {
  await failure(8);
  await db.exec("UPDATE incident_daily_budgets SET emails=19");
  await failure(6);
  await failure(1);
  expect(await claim()).toHaveLength(0);
  expect(await group()).toMatchObject({
    status: "open",
    notification_status: "suppressed",
    notification_error: "Delivery day email budget exhausted",
  });
  await db.exec("UPDATE incident_daily_budgets SET emails=18");
  expect(await claim()).toHaveLength(1);
});

it.each(["client", "operation", "source", "version", "future", "malformed"])(
  "does not suppress actual persistent failures using invalid %s recovery evidence",
  async (kind) => {
    const first = await failure(8);
    await failure(6);
    await failure(1);
    await outcome(
      first,
      0,
      kind === "client"
        ? { analyticsClientId: "another-browser" }
        : kind === "operation"
          ? { operationId: randomUUID() }
          : {},
    );
    if (["source", "version", "future", "malformed"].includes(kind)) {
      const field =
        kind === "source"
          ? "source"
          : kind === "version"
            ? "extensionVersion"
            : "occurredAt";
      const value =
        kind === "source"
          ? "mobile_web"
          : kind === "version"
            ? "1.4.20"
            : kind === "future"
              ? new Date(now + 60000).toISOString()
              : "not a date";
      await db.query(
        "UPDATE api_logs SET full_request_body=jsonb_set(full_request_body,ARRAY[$1],to_jsonb($2::text)) WHERE endpoint='/event/auth_session_result'",
        [field, value],
      );
    }
    const rows = await claim();
    expect(rows).toHaveLength(1);
    expect(rows[0].notification_payload.authPolicy.reason).toBe("persistent");
  },
);
