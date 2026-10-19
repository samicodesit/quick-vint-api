import { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../../utils/supabaseClient", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://local.invalid", "public-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (...args) => transport.fetch(...args) },
    }),
  };
});
import { loadAuthNotificationEvidence } from "../../../utils/incidents/authNotificationEvidence";

const db = new PGlite();
let queryTransport: (input: string) => Promise<Response>;
const owner = "123e4567-e89b-42d3-a456-426614174000";
const operation = "6fbbf6f7-d8e9-40e6-89e2-49da299547c2";
const client = "customer-client";
const payload = {
  event: "token_refresh_failed",
  source: "extension_background",
  example: {
    userId: owner,
    identityVerified: true,
    operationId: operation,
    occurredAt: "2026-10-19T17:30:24.997Z",
    context: {
      operationId: operation,
      analyticsClientId: client,
      entryPoint: "scheduled_refresh",
    },
  },
};
const body = {
  source: "extension_background",
  extensionVersion: "1.4.21",
  occurredAt: "2026-10-19T17:35:05.250Z",
  context: {
    operationId: operation,
    analyticsClientId: client,
    authRefreshOperationId: "7a425206-6e5f-4214-a3fb-f99796f10c4e",
    resultStatus: "silent_renewed",
    reason: "token_refresh_success",
    signInRequired: false,
  },
};

beforeAll(async () => {
  await db.exec(
    `CREATE TABLE api_logs(user_id uuid, endpoint text, created_at timestamptz, full_request_body jsonb)`,
  );
  // Only the PostgREST HTTP boundary is controlled. The SDK builds its real
  // request, and PostgreSQL executes its filters before ORDER/LIMIT.
  queryTransport = async (input: string) => {
    const url = new URL(input);
    const columns: Record<string, string> = {
      user_id: "user_id",
      endpoint: "endpoint",
      created_at: "created_at",
      "full_request_body->context->>analyticsClientId":
        "full_request_body#>>'{context,analyticsClientId}'",
      "full_request_body->context->>operationId":
        "full_request_body#>>'{context,operationId}'",
      "full_request_body->context->>authRefreshOperationId":
        "full_request_body#>>'{context,authRefreshOperationId}'",
    };
    const where: string[] = [];
    const values: string[] = [];
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "limit"].includes(key)) continue;
      if (!columns[key] || !/^(eq|gte)\./.test(value))
        throw new Error("Unexpected filter");
      values.push(value.slice(value.indexOf(".") + 1));
      where.push(
        `${columns[key]} ${value.startsWith("eq.") ? "=" : ">="} $${values.length}`,
      );
    }
    expect(url.searchParams.get("order")).toBe("created_at.desc");
    const limit = Number(url.searchParams.get("limit"));
    expect(limit).toBe(5);
    const result = await db.query(
      `SELECT * FROM api_logs WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ${limit}`,
      values,
    );
    return new Response(JSON.stringify(result.rows), {
      headers: { "content-type": "application/json" },
    });
  };
  await db.query("INSERT INTO api_logs VALUES ($1,$2,$3,$4)", [
    owner,
    "/event/auth_session_result",
    "2026-10-19T17:35:06Z",
    JSON.stringify(body),
  ]);
  // Each incorrect scope has more than the read limit. Missing a DB filter
  // hides the older valid receipt even though the in-memory guard is intact.
  for (const mismatch of ["owner", "client", "operation", "endpoint"]) {
    for (let i = 0; i < 6; i++) {
      const decoy = structuredClone(body);
      if (mismatch === "client")
        decoy.context.analyticsClientId = "another-client";
      if (mismatch === "operation")
        decoy.context.operationId = "0657a5a7-f44c-4aa2-80e6-b879060ee96c";
      await db.query("INSERT INTO api_logs VALUES ($1,$2,$3,$4)", [
        mismatch === "owner" ? "123e4567-e89b-42d3-a456-426614174001" : owner,
        mismatch === "endpoint"
          ? "/event/unrelated"
          : "/event/auth_session_result",
        "2026-10-19T17:36:00Z",
        JSON.stringify(decoy),
      ]);
    }
  }
});
afterAll(async () => {
  await db.close();
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T17:38:08Z"));
  transport.fetch.mockImplementation(queryTransport);
});
afterEach(() => vi.useRealTimers());

it("finds the exact retained receipt through real SDK JSON filters and PostgreSQL despite newer unrelated rows", async () => {
  expect(await loadAuthNotificationEvidence(payload)).toMatchObject({
    status: "silent_renewed",
    renewedAt: body.occurredAt,
    signInRequired: false,
  });
});

it.each([1, 2, 3])(
  "bounds a stalled transport and preserves the original alert (run %s)",
  async () => {
    transport.fetch.mockImplementation(
      (_input: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const abort = () =>
            reject(
              new DOMException(
                "Controlled transport unavailable",
                "AbortError",
              ),
            );
          if (init.signal?.aborted) abort();
          else init.signal?.addEventListener("abort", abort, { once: true });
        }),
    );
    const started = performance.now();
    expect(await loadAuthNotificationEvidence(payload)).toMatchObject({
      status: "unavailable",
    });
    expect(performance.now() - started).toBeLessThan(2300);
  },
);
