import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  send: vi.fn(),
  update: vi.fn(),
  frozen: null as any,
  claimed: null as any,
  logs: [] as any[],
  lookupError: false,
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    rpc: (...args: any[]) => ({ abortSignal: () => mocks.rpc(...args) }),
    from: (table: string) =>
      table === "api_logs"
        ? (() => {
            const filters: Array<[string, any]> = [];
            let since = "";
            let limit = 5;
            const query: any = {
              select: () => query,
              eq: (field: string, value: any) => {
                filters.push([field, value]);
                return query;
              },
              gte: (_field: string, value: string) => {
                since = value;
                return query;
              },
              order: () => query,
              limit: (value: number) => {
                limit = value;
                return query;
              },
              abortSignal: async () =>
                mocks.lookupError
                  ? { error: new Error("lookup down") }
                  : {
                      data: mocks.logs
                        .filter(
                          (row) =>
                            row.created_at >= since &&
                            filters.every(([field, value]) => {
                              const path = field
                                .replace(/->>?/g, ".")
                                .split(".");
                              return (
                                path.reduce(
                                  (current: any, key: string) => current?.[key],
                                  row,
                                ) === value
                              );
                            }),
                        )
                        .sort((a, b) =>
                          b.created_at.localeCompare(a.created_at),
                        )
                        .slice(0, limit),
                    },
            };
            return query;
          })()
        : {
            update: (value: any) => {
              mocks.update(value);
              const chain: any = {
                eq: () => chain,
                abortSignal: async () => ({ error: null }),
              };
              return chain;
            },
          },
  },
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));
import {
  deliverPendingNotifications,
  renderIncidentEmail,
} from "../../../utils/incidents/notifications";

const payload = {
  incidentId: "a423926a-35a6-4bf5-8027-8ab335c71110",
  event: "fields_apply_failed",
  stage: "fields_applied",
  severity: "blocking",
  release: "1.4.6",
  market: "nl",
  example: { context: { message: "Title field rejected" } },
};
const incident = {
  id: payload.incidentId,
  notification_key: "key-1",
  notification_attempts: 1,
  notification_payload: payload,
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T17:38:08Z"));
  vi.clearAllMocks();
  mocks.frozen = null;
  mocks.claimed = incident;
  mocks.logs = [];
  mocks.lookupError = false;
  delete process.env.INCIDENT_PROCESSING_PAUSED;
  mocks.rpc.mockImplementation(async (name: string, args: any) => {
    if (name === "incident_claim_notifications")
      return { data: [mocks.claimed] };
    if (name === "incident_freeze_notification") {
      mocks.frozen ||= {
        ...mocks.claimed.notification_payload,
        email: args.p_email,
      };
      return { data: mocks.frozen };
    }
    throw new Error("Unexpected RPC");
  });
  mocks.send.mockResolvedValue({ data: { id: "resend-1" } });
});
afterEach(() => vi.useRealTimers());

it("retries ambiguous delivery with the same immutable email and idempotency key", async () => {
  mocks.send.mockResolvedValueOnce({
    error: { message: "Temporary delivery failure" },
  });
  expect(await deliverPendingNotifications()).toEqual({ sent: 0, failed: 1 });
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({
      notification_status: "failed",
      notification_error: "Temporary delivery failure",
    }),
  );
  expect(await deliverPendingNotifications()).toEqual({ sent: 1, failed: 0 });
  const [first, second] = mocks.send.mock.calls;
  expect(first[0]).toEqual(second[0]);
  expect(first[1].idempotencyKey).toBe(second[1].idempotencyKey);
  expect(first[1].signal).toBeInstanceOf(AbortSignal);
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({
      notification_status: "sent",
      resend_id: "resend-1",
    }),
  );
});

it("does not send unless the exact email snapshot is durable", async () => {
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "incident_claim_notifications"
      ? { data: [incident] }
      : { error: new Error("database down") },
  );
  expect(await deliverPendingNotifications()).toEqual({ sent: 0, failed: 1 });
  expect(mocks.send).not.toHaveBeenCalled();
});

it("renders escaped, branded evidence with a real incident anchor and no raw credentials", () => {
  const email = renderIncidentEmail({
    ...payload,
    event: '<img src=x onerror="bad">',
    example: {
      context: {
        message: "token=private https://example.com/private <script>",
      },
    },
  });
  expect(email.to).toBe("samicodesit@gmail.com");
  expect(email.html).toContain(
    `href="https://autolister.app/admin/reports?incident=${payload.incidentId}"`,
  );
  expect(email.html).toContain("Open this issue in AutoLister");
  expect(email.html).not.toContain("<script>");
  expect(email.html).not.toContain("token=private");
  expect(email.html).not.toContain("<img src=x");
});

it("pauses all automatic delivery without touching the queue", async () => {
  process.env.INCIDENT_PROCESSING_PAUSED = "true";
  expect(await deliverPendingNotifications()).toMatchObject({ paused: true });
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

const owner = "123e4567-e89b-42d3-a456-426614174000";
const failedOperation = "6fbbf6f7-d8e9-40e6-89e2-49da299547c2";
function backgroundIncident() {
  mocks.claimed = {
    ...incident,
    notification_payload: {
      ...payload,
      event: "token_refresh_failed",
      source: "extension_background",
      stage: "authenticating",
      severity: "transient",
      release: "1.4.21",
      example: {
        userId: owner,
        identityVerified: true,
        operationId: failedOperation,
        occurredAt: "2026-10-19T17:30:24.997Z",
        context: {
          operationId: failedOperation,
          analyticsClientId: "customer-client",
          entryPoint: "startup_restore",
          browserFamily: "chrome",
          message: "Failed to fetch",
        },
      },
    },
  };
  return mocks.claimed.notification_payload;
}
function renewal() {
  return {
    id: "824fca96-ab9e-4669-a791-086199005f99",
    user_id: owner,
    endpoint: "/event/auth_session_result",
    created_at: "2026-10-19T17:35:06.881Z",
    full_request_body: {
      source: "extension_background",
      extensionVersion: "1.4.21",
      occurredAt: "2026-10-19T17:35:05.250Z",
      context: {
        operationId: failedOperation,
        analyticsClientId: "customer-client",
        authRefreshOperationId: "7a425206-6e5f-4214-a3fb-f99796f10c4e",
        resultStatus: "silent_renewed",
        reason: "token_refresh_success",
        signInRequired: false,
      },
    },
  };
}

it("labels the actual matched background renewal as recovered without resolving its grouped issue", async () => {
  backgroundIncident();
  mocks.logs = [renewal()];
  expect(await deliverPendingNotifications()).toEqual({ sent: 1, failed: 0 });
  const email = mocks.send.mock.calls[0][0];
  expect(email.subject).toContain("background renewal recovered");
  expect(email.html).toContain("Recovered automatically");
  expect(email.html).toContain("19:35:05");
  expect(email.html).toContain("No sign-in requirement was recorded");
  expect(email.html).toContain("Other failures in this grouped issue");
  expect(
    mocks.update.mock.calls.some(([value]) => value.status === "resolved"),
  ).toBe(false);
});

it.each(["owner", "client", "operation", "earlier", "source", "version"])(
  "does not claim recovery from a mismatched %s",
  async (mismatch) => {
    backgroundIncident();
    const row = renewal();
    if (mismatch === "owner")
      row.user_id = "123e4567-e89b-42d3-a456-426614174001";
    if (mismatch === "client")
      row.full_request_body.context.analyticsClientId = "another-client";
    if (mismatch === "operation")
      row.full_request_body.context.operationId =
        "0657a5a7-f44c-4aa2-80e6-b879060ee96c";
    if (mismatch === "earlier")
      row.full_request_body.occurredAt = "2026-10-19T17:29:00Z";
    if (mismatch === "source") row.full_request_body.source = "mobile_web";
    if (mismatch === "version")
      row.full_request_body.extensionVersion = "1.4.20";
    mocks.logs = [row];
    expect(await deliverPendingNotifications()).toEqual({ sent: 1, failed: 0 });
    const email = mocks.send.mock.calls[0][0];
    expect(email.subject).toContain("background renewal failed");
    expect(email.html).not.toContain("Recovered automatically");
    expect(email.html).toContain("Failed to fetch");
  },
);

it("distinguishes a fresh sign-in from a silent renewal", async () => {
  backgroundIncident();
  const row = renewal();
  row.full_request_body.context.resultStatus = "signed_in";
  row.full_request_body.context.reason = "auth_success";
  row.full_request_body.context.signInRequired = true;
  mocks.logs = [row];
  await deliverPendingNotifications();
  const email = mocks.send.mock.calls[0][0];
  expect(email.subject).toContain("recovered after sign-in");
  expect(email.html).toContain("signed in again");
  expect(email.html).not.toContain("No sign-in requirement was recorded");
});

it("keeps an actual blocked Generate visible even when its session renewed", async () => {
  backgroundIncident();
  const blocked = renewal();
  blocked.endpoint = "/event/auth_action_result";
  blocked.full_request_body.source = "extension_content";
  blocked.full_request_body.occurredAt = "2026-10-19T17:31:00Z";
  blocked.full_request_body.context.operationId =
    "27739cb1-c274-4a04-8b33-527dd5da55cc";
  blocked.full_request_body.context.authRefreshOperationId = failedOperation;
  blocked.full_request_body.context.resultStatus = "blocked";
  Object.assign(blocked.full_request_body.context, {
    entryPoint: "generate",
    statusCode: 401,
    reason: "unauthorized",
    generationAttemptId: "gen-1",
  });
  mocks.logs = [renewal(), blocked];
  await deliverPendingNotifications();
  const email = mocks.send.mock.calls[0][0];
  expect(email.html).toContain("Generate was blocked");
  expect(email.html).toContain(
    "A successful Generate retry is not established",
  );
  expect(email.html).not.toContain("Generate recovered");
});

it("still sends the real failure when recovery lookup is unavailable", async () => {
  backgroundIncident();
  mocks.lookupError = true;
  expect(await deliverPendingNotifications()).toEqual({ sent: 1, failed: 0 });
  const email = mocks.send.mock.calls[0][0];
  expect(email.subject).toContain("background renewal failed");
  expect(email.html).toContain("Recovery status unavailable");
  expect(email.html).toContain("Failed to fetch");
});

it("freezes recovered status before an ambiguous send and preserves it on retry", async () => {
  backgroundIncident();
  mocks.logs = [renewal()];
  mocks.send.mockResolvedValueOnce({ error: { message: "Response lost" } });
  expect(await deliverPendingNotifications()).toEqual({ sent: 0, failed: 1 });
  mocks.logs = [];
  mocks.lookupError = true;
  expect(await deliverPendingNotifications()).toEqual({ sent: 1, failed: 0 });
  const [first, second] = mocks.send.mock.calls;
  expect(first[0].subject).toContain("background renewal recovered");
  expect(first[0]).toEqual(second[0]);
  expect(first[1].idempotencyKey).toBe(second[1].idempotencyKey);
});

it("keeps a missing-session Generate block visible without inventing renewal", async () => {
  backgroundIncident();
  const row = renewal();
  row.endpoint = "/event/auth_action_result";
  row.full_request_body.source = "extension_content";
  Object.assign(row.full_request_body.context, {
    operationId: "27739cb1-c274-4a04-8b33-527dd5da55cc",
    authRefreshOperationId: failedOperation,
    entryPoint: "generate",
    resultStatus: "blocked",
    statusCode: 0,
    reason: "session_missing",
    generationAttemptId: "gen-missing-session",
  });
  mocks.logs = [row];
  await deliverPendingNotifications();
  const email = mocks.send.mock.calls[0][0];
  expect(email.subject).toContain("background renewal failed");
  expect(email.html).toContain("Generate was blocked");
  expect(email.html).not.toContain("confirms session renewal");
});

it.each(["foreground", "parent"])(
  "preserves genuine foreground failure alerts (%s)",
  async (kind) => {
    const original = backgroundIncident();
    if (kind === "foreground") original.example.context.entryPoint = "generate";
    else original.example.context.parentOperationId = failedOperation;
    mocks.logs = [renewal()];
    await deliverPendingNotifications();
    const email = mocks.send.mock.calls[0][0];
    expect(email.subject).toBe("AutoLister issue: token_refresh_failed");
    expect(email.html).not.toContain("Recovered automatically");
  },
);

it.each(["future", "receipt", "flag", "reason", "reference"])(
  "rejects invalid recovery evidence (%s)",
  async (kind) => {
    backgroundIncident();
    const row = renewal();
    if (kind === "future")
      row.full_request_body.occurredAt = "2026-10-20T17:35:05Z";
    if (kind === "receipt") row.created_at = "invalid";
    if (kind === "flag")
      delete (row.full_request_body.context as any).signInRequired;
    if (kind === "reason") row.full_request_body.context.reason = "auth_failed";
    if (kind === "reference")
      row.full_request_body.context.authRefreshOperationId = "invalid";
    mocks.logs = [row];
    await deliverPendingNotifications();
    expect(mocks.send.mock.calls[0][0].subject).toContain(
      "background renewal failed",
    );
  },
);
