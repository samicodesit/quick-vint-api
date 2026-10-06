import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createContext, runInContext } from "node:vm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeIncidentEvent } from "../../../utils/incidents/contract";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;",
  );
  await db.exec(
    "CREATE TABLE api_logs (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid, user_email text, endpoint text, request_method text, response_status integer, user_agent text, origin text, ip_address text, full_request_body jsonb);",
  );
  await db.exec(
    readFileSync("migrations/2026-10-03_incident_tracking.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

function event(overrides = {}) {
  return {
    id: randomUUID(),
    event: "fields_apply_failed",
    occurredAt: new Date().toISOString(),
    source: "extension_content",
    release: "1.4.6",
    market: "nl",
    fingerprint: "apply-nl-146",
    definition: { kind: "incident", severity: "blocking" },
    context: {
      errorCode: "FIELD_MISSING",
      stage: "applying",
      message: "Title field missing",
    },
    ...overrides,
  };
}
async function ingest(input: any) {
  const result = await db.query<{ result: any }>(
    "SELECT incident_ingest($1::jsonb, $2::uuid, true) AS result",
    [JSON.stringify(input), "123e4567-e89b-42d3-a456-426614174000"],
  );
  return result.rows[0].result;
}

describe("atomic incident persistence", () => {
  it("preserves real browser refresh diagnostics through sanitization and anonymous persistence", async () => {
    const browser = createContext({ crypto: { randomUUID }, TextEncoder });
    for (const file of [
      "public/telemetry-registry.js",
      "public/telemetry-client.js",
    ])
      runInContext(readFileSync(file, "utf8"), browser);
    browser.AutoListerTelemetry.setAccount(null);
    const prepared = browser.AutoListerTelemetry.prepare(
      "token_refresh_failed",
      {
        operationId: "signed-out-refresh-evidence",
        stage: "authenticating",
        phase: "refresh_session",
        code: "provider_unavailable",
        status: 503,
        attempts: 3,
        elapsedMs: 6000,
        errorName: "AuthRetryableFetchError",
        message: "Gateway unavailable token=private-token",
        stack:
          "AuthRetryableFetchError: Gateway unavailable\n at refresh (https://private.example/path:1:2)",
      },
      "extension_background",
    );
    const normalized = normalizeIncidentEvent(prepared.event);
    expect(normalized.error).toBeUndefined();
    const write = () =>
      db.query<any>("SELECT incident_ingest($1::jsonb,NULL,false) AS result", [
        JSON.stringify(normalized.value),
      ]);
    const first = (await write()).rows[0].result;
    expect(first.status).toBe("accepted");
    expect((await write()).rows[0].result.status).toBe("duplicate");
    const { rows } = await db.query<any>(
      "SELECT stage,occurrences,examples FROM incident_groups WHERE id=$1",
      [first.incidentId],
    );
    expect(rows[0].stage).toBe("authenticating");
    expect(rows[0].occurrences).toBe(1);
    expect(rows[0].examples[0].identityVerified).toBe(false);
    expect(rows[0].examples[0].context).toMatchObject({
      operationId: "signed-out-refresh-evidence",
      phase: "refresh_session",
      errorCode: "provider_unavailable",
      statusCode: 503,
      attempts: 3,
      elapsedMs: 6000,
      errorName: "AuthRetryableFetchError",
    });
    expect(rows[0].examples[0].context.stack).toContain(
      "AuthRetryableFetchError",
    );
    expect(JSON.stringify(rows[0])).not.toMatch(
      /private-token|private\.example/,
    );
  });

  it("handles registration winning the race with an anonymous write and lost acknowledgement", async () => {
    const key = "c".repeat(64),
      owner = "123e4567-e89b-42d3-a456-426614174000";
    await db.query("SELECT incident_register_phone($1,$2::uuid)", [key, owner]);
    const input = event({
      fingerprint: "phone-registration-race",
      source: "phone_upload_page",
      phoneKey: key,
      operationId: `phone:${key}`,
    });
    await db.query("SELECT incident_ingest($1::jsonb,NULL,false)", [
      JSON.stringify(input),
    ]);
    const retry = await ingest(input);
    expect(retry.status).toBe("duplicate");
    expect(
      (
        await db.query<any>(
          "SELECT owner_key FROM incident_receipts WHERE id=$1",
          [input.id],
        )
      ).rows[0].owner_key,
    ).toBe(owner);
    expect(
      (
        await db.query<any>(
          "SELECT occurrences FROM incident_groups WHERE id=$1",
          [retry.incidentId],
        )
      ).rows[0].occurrences,
    ).toBe(1);
  });
  it("accepts unidentified phone failures, links them on recovery and deduplicates retries after identity changes", async () => {
    const key = "b".repeat(64),
      owner = "123e4567-e89b-42d3-a456-426614174000";
    const input = event({
      fingerprint: "phone-recovery",
      source: "phone_upload_page",
      phoneKey: key,
      operationId: `phone:${key}`,
    });
    const first = await db.query<any>(
      "SELECT incident_ingest($1::jsonb,NULL,false) AS result",
      [JSON.stringify(input)],
    );
    const id = first.rows[0].result.incidentId;
    expect(first.rows[0].result.status).toBe("accepted");
    expect(
      (
        await db.query<any>(
          "SELECT notification_status FROM incident_groups WHERE id=$1",
          [id],
        )
      ).rows[0].notification_status,
    ).toBe("pending");
    await db.query("SELECT incident_register_phone($1,$2::uuid)", [key, owner]);
    expect(
      (
        await db.query<any>(
          "SELECT user_id,identity_verified FROM incident_flows WHERE incident_id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ user_id: owner, identity_verified: true });
    const retry = await ingest(input);
    expect(retry.status).toBe("duplicate");
    expect(retry.incidentId).toBe(id);
    expect(
      (
        await db.query<any>(
          "SELECT occurrences FROM incident_groups WHERE id=$1",
          [id],
        )
      ).rows[0].occurrences,
    ).toBe(1);
    const listed = await db.query<any>(
      "SELECT * FROM incident_list($1::uuid)",
      [owner],
    );
    expect(listed.rows.some((row) => row.id === id)).toBe(true);
    const conflict = await db.query<any>(
      "SELECT incident_register_phone($1,$2::uuid) AS accepted",
      [key, "a423926a-35a6-4bf5-8027-8ab335c71110"],
    );
    expect(conflict.rows[0].accepted).toBe(false);
  });
  it("accepts a repeated event once and returns the same report reference", async () => {
    const input = event();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => ingest(input)),
    );
    expect(results.filter((row) => row.status === "accepted")).toHaveLength(1);
    expect(results.filter((row) => row.status === "duplicate")).toHaveLength(7);
    expect(new Set(results.map((row) => row.incidentId)).size).toBe(1);
    const { rows } = await db.query<any>(
      "SELECT occurrences, notification_status FROM incident_groups WHERE id=$1",
      [results[0].incidentId],
    );
    expect(rows[0]).toEqual({ occurrences: 1, notification_status: "pending" });
  });

  it("keeps first evidence and only the two latest repeat examples", async () => {
    for (let i = 0; i < 5; i++)
      await ingest(
        event({
          fingerprint: "examples",
          context: { message: `example ${i}` },
        }),
      );
    const { rows } = await db.query<any>(
      "SELECT examples FROM incident_groups WHERE fingerprint='examples'",
    );
    expect(
      rows[0].examples.map((example: any) => example.context.message),
    ).toEqual(["example 0", "example 3", "example 4"]);
  });

  it("deduplicates retained business records in the same transaction", async () => {
    const input = event({
      event: "auth_success",
      definition: { kind: "business" },
      businessLog: {
        endpoint: "/event/auth_success",
        request_method: "POST",
        response_status: 204,
        full_request_body: { event: "auth_success" },
      },
    });
    await ingest(input);
    await ingest(input);
    const { rows } = await db.query<any>(
      "SELECT count(*)::int AS count FROM api_logs WHERE endpoint='/event/auth_success'",
    );
    expect(rows[0].count).toBe(1);
  });

  it("requires three distinct transient attempts within ten minutes", async () => {
    for (let i = 0; i < 3; i++)
      await ingest(
        event({
          fingerprint: "transient",
          operationId: "same-attempt",
          definition: { kind: "incident", severity: "transient" },
        }),
      );
    let result = await db.query<any>(
      "SELECT notification_status FROM incident_groups WHERE fingerprint='transient'",
    );
    expect(result.rows[0].notification_status).toBe("quiet");
    for (const operationId of ["attempt-2", "attempt-3"])
      await ingest(
        event({
          fingerprint: "transient",
          operationId,
          definition: { kind: "incident", severity: "transient" },
        }),
      );
    result = await db.query<any>(
      "SELECT notification_status FROM incident_groups WHERE fingerprint='transient'",
    );
    expect(result.rows[0].notification_status).toBe("pending");
  });

  it("does not let a later success resolve an earlier incident", async () => {
    const failed = await ingest(
      event({ fingerprint: "later-success", operationId: "flow-1" }),
    );
    await ingest(
      event({
        event: "generate_success",
        operationId: "flow-1",
        definition: {
          kind: "checkpoint",
          stage: "generation_received",
          running: true,
        },
      }),
    );
    const { rows } = await db.query<any>(
      "SELECT status FROM incident_groups WHERE id=$1",
      [failed.incidentId],
    );
    expect(rows[0].status).toBe("open");
  });

  it("atomically caps Sentry reservations", async () => {
    const results = await Promise.all(
      Array.from({ length: 110 }, () =>
        db.query<any>("SELECT incident_reserve_sentry() AS allowed"),
      ),
    );
    expect(results.filter((result) => result.rows[0].allowed)).toHaveLength(
      100,
    );
  });

  it("leases each pending notification once with an immutable payload", async () => {
    const issue = await ingest(event({ fingerprint: "lease-test" }));
    const before = (
      await db.query<any>(
        "SELECT notification_payload FROM incident_groups WHERE id=$1",
        [issue.incidentId],
      )
    ).rows[0].notification_payload;
    await ingest(
      event({
        fingerprint: "lease-test",
        context: { message: "repeat must not mutate the email" },
      }),
    );
    const claimed = (
      await db.query<any>("SELECT * FROM incident_claim_notifications(20)")
    ).rows;
    expect(claimed.some((row) => row.id === issue.incidentId)).toBe(true);
    expect(
      (await db.query<any>("SELECT * FROM incident_claim_notifications(20)"))
        .rows,
    ).toHaveLength(0);
    expect(
      claimed.find((row) => row.id === issue.incidentId).notification_payload,
    ).toEqual(before);
  });

  it("a resolved recurrence reopens without bypassing the email cooldown", async () => {
    const issue = await ingest(event({ fingerprint: "reopen-test" }));
    await db.query(
      "UPDATE incident_groups SET status='resolved',resolved_at=now()-interval '1 second',notification_status='sent',notified_at=now() WHERE id=$1",
      [issue.incidentId],
    );
    await ingest(event({ fingerprint: "reopen-test" }));
    const { rows } = await db.query<any>(
      "SELECT status,notification_status FROM incident_groups WHERE id=$1",
      [issue.incidentId],
    );
    expect(rows[0]).toEqual({ status: "open", notification_status: "pending" });
    expect(
      (
        await db.query<any>("SELECT * FROM incident_claim_notifications(20)")
      ).rows.some((row) => row.id === issue.incidentId),
    ).toBe(false);
    await db.query(
      "UPDATE incident_groups SET notification_next_at=now()-interval '1 second' WHERE id=$1",
      [issue.incidentId],
    );
    expect(
      (
        await db.query<any>("SELECT * FROM incident_claim_notifications(20)")
      ).rows.some((row) => row.id === issue.incidentId),
    ).toBe(true);
  });

  it("charges the delivery day when a pending email crosses midnight", async () => {
    const issue = await ingest(event({ fingerprint: "midnight" }));
    await db.query(
      "UPDATE incident_groups SET notification_budget_day=current_date-1 WHERE id=$1",
      [issue.incidentId],
    );
    await db.exec(
      "UPDATE incident_daily_budgets SET emails=20 WHERE day=current_date",
    );
    const claimed = (
      await db.query<any>("SELECT * FROM incident_claim_notifications(20)")
    ).rows;
    expect(claimed.some((row) => row.id === issue.incidentId)).toBe(false);
    expect(
      (
        await db.query<any>(
          "SELECT notification_status FROM incident_groups WHERE id=$1",
          [issue.incidentId],
        )
      ).rows[0].notification_status,
    ).toBe("suppressed");
    await db.exec(
      "UPDATE incident_daily_budgets SET emails=0 WHERE day=current_date",
    );
  });

  it("freezes the exact notification email only once", async () => {
    const issue = await ingest(event({ fingerprint: "freeze-email" }));
    const group = (
      await db.query<any>("SELECT * FROM incident_claim_notifications(20)")
    ).rows.find((row) => row.id === issue.incidentId);
    const first = (
      await db.query<any>(
        "SELECT incident_freeze_notification($1,$2,$3::jsonb) AS payload",
        [
          group.id,
          group.notification_key,
          JSON.stringify({ subject: "original", html: "<p>Safe</p>" }),
        ],
      )
    ).rows[0].payload;
    const again = (
      await db.query<any>(
        "SELECT incident_freeze_notification($1,$2,$3::jsonb) AS payload",
        [
          group.id,
          group.notification_key,
          JSON.stringify({ subject: "changed" }),
        ],
      )
    ).rows[0].payload;
    expect(again).toEqual(first);
    expect(first.email.subject).toBe("original");
  });

  it("flags machine work, but never user waiting, as possibly stalled", async () => {
    for (const [operationId, running] of [
      ["machine-stall", true],
      ["user-wait", false],
    ] as const) {
      await ingest(
        event({
          operationId,
          event: "checkpoint",
          definition: {
            kind: "checkpoint",
            stage: running ? "generation_requested" : "waiting_for_photos",
            running,
          },
        }),
      );
    }
    await db.exec(
      "UPDATE incident_flows SET last_progress_at=now()-interval '6 minutes' WHERE operation_id IN ('machine-stall','user-wait')",
    );
    await db.query("SELECT incident_sweep(100)");
    const rows = (
      await db.query<any>(
        "SELECT operation_id,incident_id,running FROM incident_flows WHERE operation_id IN ('machine-stall','user-wait')",
      )
    ).rows;
    expect(
      rows.find((row) => row.operation_id === "machine-stall").incident_id,
    ).toBeTruthy();
    expect(
      rows.find((row) => row.operation_id === "user-wait").incident_id,
    ).toBeNull();
    expect(rows.every((row) => row.running === false)).toBe(true);
  });

  it("keeps background refresh expiry quiet after sign-out while detecting actual sign-in stalls", async () => {
    const make = (name: string, operationId: string) => {
      const normalized = normalizeIncidentEvent({
        id: randomUUID(),
        event: name,
        occurredAt: new Date().toISOString(),
        source: "extension_background",
        extensionVersion: "1.4.8",
        context: { operationId },
      });
      expect(normalized.error).toBeUndefined();
      return normalized.value!;
    };
    await ingest(make("token_refresh_start", "expired-background-refresh"));
    // The SDK clears the account before the expected expiry event is collected.
    await db.query("SELECT incident_ingest($1::jsonb,NULL,false)", [
      JSON.stringify(
        make("token_refresh_expired", "expired-background-refresh"),
      ),
    ]);
    await ingest(make("auth_start", "interactive-auth-stall"));
    await db.exec(
      "UPDATE incident_flows SET last_progress_at=now()-interval '6 minutes' WHERE operation_id IN ('expired-background-refresh','interactive-auth-stall')",
    );
    await db.query("SELECT incident_sweep(100)");
    const { rows } = await db.query<any>(
      "SELECT operation_id,incident_id,running FROM incident_flows WHERE operation_id IN ('expired-background-refresh','interactive-auth-stall')",
    );
    expect(
      rows
        .filter((row) => row.operation_id === "expired-background-refresh")
        .every((row) => row.incident_id === null && !row.running),
    ).toBe(true);
    expect(
      rows.find((row) => row.operation_id === "interactive-auth-stall")
        .incident_id,
    ).toBeTruthy();
  });

  it("does not reopen a resolved issue for an old offline event", async () => {
    const issue = await ingest(event({ fingerprint: "delayed-old" }));
    await db.query("SELECT incident_set_state($1,'resolved')", [
      issue.incidentId,
    ]);
    await ingest(
      event({
        fingerprint: "delayed-old",
        occurredAt: new Date(Date.now() - 3600000).toISOString(),
      }),
    );
    const row = (
      await db.query<any>(
        "SELECT status,notification_status,evidence_expires_at<=now()+interval '1 hour' AS short FROM incident_groups WHERE id=$1",
        [issue.incidentId],
      )
    ).rows[0];
    expect(row).toEqual({
      status: "resolved",
      notification_status: "cancelled",
      short: true,
    });
  });

  it("expires a delayed group 24 hours after its occurrence, not ingestion", async () => {
    const issue = await ingest(
      event({
        fingerprint: "old-expiry",
        occurredAt: new Date(Date.now() - 3600000).toISOString(),
      }),
    );
    const row = (
      await db.query<any>(
        "SELECT expires_at<=now()+interval '23 hours' AS bounded FROM incident_groups WHERE id=$1",
        [issue.incidentId],
      )
    ).rows[0];
    expect(row.bounded).toBe(true);
  });

  it("alerts automatic pre-login failures while keeping anonymous support reports quiet", async () => {
    const automatic = event({
      fingerprint: "pre-login",
      event: "own_context_exception",
    });
    const report = event({
      fingerprint: "anonymous-report",
      event: "listing_report_submitted",
      definition: { kind: "report", severity: "blocking" },
    });
    for (const input of [automatic, report])
      await db.query("SELECT incident_ingest($1::jsonb,NULL,false)", [
        JSON.stringify(input),
      ]);
    const rows = (
      await db.query<any>(
        "SELECT fingerprint,notification_status FROM incident_groups WHERE fingerprint IN ('pre-login','anonymous-report') ORDER BY fingerprint",
      )
    ).rows;
    expect(rows).toEqual([
      { fingerprint: "anonymous-report", notification_status: "quiet" },
      { fingerprint: "pre-login", notification_status: "pending" },
    ]);
  });

  it("deletes expired records with bounded cleanup", async () => {
    await db.exec(
      "UPDATE incident_receipts SET expires_at=now()-interval '1 minute'",
    );
    await db.query("SELECT incident_cleanup(2)");
    const { rows } = await db.query<any>(
      "SELECT count(*)::int AS count FROM incident_receipts",
    );
    expect(rows[0].count).toBeGreaterThan(0);
    await db.query("SELECT incident_cleanup(500)");
    expect(
      (
        await db.query<any>(
          "SELECT count(*)::int AS count FROM incident_receipts",
        )
      ).rows[0].count,
    ).toBe(0);
  });
});
