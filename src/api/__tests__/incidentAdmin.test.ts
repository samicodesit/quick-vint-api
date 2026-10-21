import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  record: vi.fn(),
  from: vi.fn(),
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));
vi.mock("../../../utils/incidents/service", () => ({
  recordServerIncident: mocks.record,
}));
import { handleIssues } from "../../../utils/incidents/admin";
function response() {
  const res: any = {
    code: 200,
    body: null,
    status(code: number) {
      res.code = code;
      return res;
    },
    json(body: any) {
      res.body = body;
      return res;
    },
  };
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.INCIDENT_PROCESSING_PAUSED;
});
it("adds bounded same-owner batch history without losing issue details if the history query fails", async () => {
  const id = "a423926a-35a6-4bf5-8027-8ab335c71110";
  const owner = "a423926a-35a6-4bf5-8027-8ab335c71111";
  const batch = "a423926a-35a6-4bf5-8027-8ab335c71112";
  let unavailable: boolean | "stall" = false;
  let historySignal: AbortSignal;
  const filters: any[] = [];
  mocks.from.mockImplementation((table: string) => {
    const q: any = {};
    for (const method of ["select", "eq", "gt", "gte", "in", "order"])
      q[method] = (...args: any[]) => {
        filters.push([table, method, ...args]);
        return q;
      };
    q.maybeSingle = async () => ({
      data: {
        id,
        event: "batch_paused",
        evidence_expires_at: "2099-01-01T00:00:00Z",
      },
    });
    q.abortSignal = (signal: AbortSignal) => {
      historySignal = signal;
      return q;
    };
    q.limit = async () => {
      if (table === "incident_flows")
        return {
          data: [
            { operation_id: batch, user_id: owner, identity_verified: true },
          ],
        };
      if (unavailable === "stall")
        await new Promise((_resolve, reject) =>
          historySignal.addEventListener(
            "abort",
            () => reject(new Error("request aborted")),
            { once: true },
          ),
        );
      if (unavailable) throw new Error("temporary history failure");
      return {
        data: [
          {
            id: "log-1",
            user_id: owner,
            created_at: "2026-10-21T10:01:00Z",
            full_request_body: {
              event: "batch_paused",
              context: {
                batchId: batch,
                analyticsClientId: "client-a",
                expectedPhotoCount: 10,
                confirmedPhotoCount: 8,
              },
            },
          },
        ],
      };
    };
    return q;
  });
  const res = response();
  await handleIssues(
    { method: "GET", query: { action: "issue-detail", id } } as any,
    res,
  );
  expect(res.body.batches[0]).toMatchObject({
    batchId: batch,
    recoveryStatus: "unproven",
    pauses: [{ expectedPhotoCount: 10, confirmedPhotoCount: 8 }],
  });
  expect(filters).toContainEqual(["api_logs", "in", "user_id", [owner]]);
  expect(filters).toContainEqual([
    "api_logs",
    "in",
    "full_request_body->context->>batchId",
    [batch],
  ]);
  unavailable = true;
  await handleIssues(
    { method: "GET", query: { action: "issue-detail", id } } as any,
    res,
  );
  expect(res.code).toBe(200);
  expect(res.body).toMatchObject({
    issue: { id },
    batchEvidenceError: true,
    batches: [{ incomplete: true, recoveryStatus: "unproven" }],
  });
  unavailable = "stall";
  await handleIssues(
    { method: "GET", query: { action: "issue-detail", id } } as any,
    res,
  );
  expect(historySignal!.aborted).toBe(true);
  expect(res.code).toBe(200);
  expect(res.body.batchEvidenceError).toBe(true);
});
it("retrieves an owner's referenced refresh beyond the newest 50 group operations", async () => {
  const id = "a423926a-35a6-4bf5-8027-8ab335c71110";
  const owner = "a423926a-35a6-4bf5-8027-8ab335c71111";
  const operation = "a423926a-35a6-4bf5-8027-8ab335c71112";
  const target = {
    id: `${owner}:${operation}`,
    incident_id: id,
    user_id: owner,
    operation_id: operation,
    identity_verified: true,
    progress: { release: "1.4.21", phase: "restore_session" },
  };
  const rows = [
    ...Array.from({ length: 55 }, (_, i) => ({
      ...target,
      operation_id: `newer-${i}`,
    })),
    { ...target, user_id: "another-owner" },
    { ...target, incident_id: "another-group" },
    target,
  ];
  mocks.from.mockImplementation((table: string) => {
    const filters: Array<[string, unknown]> = [];
    const query: any = {};
    for (const method of ["select", "gt", "order"]) query[method] = () => query;
    query.eq = (field: string, value: unknown) => {
      filters.push([field, value]);
      return query;
    };
    query.maybeSingle = async () => ({
      data: { id, evidence_expires_at: "2099-01-01T00:00:00Z" },
    });
    query.limit = async (limit: number) => ({
      data:
        table === "incident_flows"
          ? rows
              .filter((row) =>
                filters.every(
                  ([field, value]) => (row as any)[field] === value,
                ),
              )
              .slice(0, limit)
          : [],
    });
    return query;
  });
  const res = response();
  await handleIssues(
    { method: "GET", query: { action: "issue-detail", id } } as any,
    res,
  );
  expect(res.body.operations).toHaveLength(50);
  expect(res.body.operations).not.toContainEqual(target);
  expect(res.body.moreOperations).toBe(true);
  await handleIssues(
    {
      method: "GET",
      query: {
        action: "issue-detail",
        id,
        user_id: owner,
        operation_id: operation,
      },
    } as any,
    res,
  );
  expect(res.code).toBe(200);
  expect(res.body.operations).toEqual([target]);
  expect(res.body.moreOperations).toBe(false);
  await handleIssues(
    {
      method: "GET",
      query: {
        action: "issue-detail",
        id,
        user_id: id,
        operation_id: operation,
      },
    } as any,
    res,
  );
  expect(res.body.operations).toEqual([]);
});

it("rejects invalid or unscoped operation lookups before database access", async () => {
  const id = "a423926a-35a6-4bf5-8027-8ab335c71110";
  for (const filters of [
    { operation_id: id },
    { operation_id: "invalid", user_id: id },
    { operation_id: id, user_id: "invalid" },
    { operation_id: [id, id], user_id: id },
    { user_id: id },
  ]) {
    const res = response();
    await handleIssues(
      {
        method: "GET",
        query: { action: "issue-detail", id, ...filters },
      } as any,
      res,
    );
    expect(res.code).toBe(400);
  }
  expect(mocks.from).not.toHaveBeenCalled();
});
it("returns 50 summaries and a cursor containing the last returned row", async () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({
    id: `a423926a-35a6-4bf5-8027-${String(i).padStart(12, "0")}`,
    last_seen: "2026-10-03T10:00:00.000Z",
  }));
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "incident_list" ? rows : { groups: 500 },
  }));
  const res = response();
  await handleIssues(
    { method: "GET", query: { action: "issues", user_id: rows[0].id } } as any,
    res,
  );
  expect(res.code).toBe(200);
  expect(res.body.issues).toHaveLength(50);
  expect(
    JSON.parse(Buffer.from(res.body.nextCursor, "base64url").toString()),
  ).toEqual({ time: rows[49].last_seen, id: rows[49].id });
  expect(mocks.rpc).toHaveBeenCalledWith(
    "incident_list",
    expect.objectContaining({ p_user_id: rows[0].id, p_status: "open" }),
  );
});
it("rejects invalid cursors and identities before querying", async () => {
  for (const query of [
    { action: "issues", cursor: "invalid" },
    { action: "issues", user_id: "forged" },
  ]) {
    const res = response();
    await handleIssues({ method: "GET", query } as any, res);
    expect(res.code).toBe(400);
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("requires explicit POST actions for state changes and synthetic incidents", async () => {
  const res = response();
  await handleIssues(
    { method: "GET", query: { action: "issue-self-test" } } as any,
    res,
  );
  expect(res.code).toBe(405);
  expect(mocks.record).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ data: true });
  await handleIssues(
    {
      method: "POST",
      query: { action: "issue-state" },
      body: { id: "a423926a-35a6-4bf5-8027-8ab335c71110", status: "resolved" },
    } as any,
    res,
  );
  expect(mocks.rpc).toHaveBeenCalledWith("incident_set_state", {
    p_id: "a423926a-35a6-4bf5-8027-8ab335c71110",
    p_status: "resolved",
  });
});
it("reports pause and monitoring failures explicitly", async () => {
  process.env.INCIDENT_PROCESSING_PAUSED = "true";
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "incident_list"
      ? { data: [] }
      : { error: new Error("unavailable") },
  );
  const res = response();
  await handleIssues(
    { method: "GET", query: { action: "issues" } } as any,
    res,
  );
  expect(res.body).toMatchObject({
    processingPaused: true,
    health: { error: "Monitoring health unavailable" },
  });
});

it("keeps emailed report links usable after the diagnostic group expires", async () => {
  const id = "a423926a-35a6-4bf5-8027-8ab335c71110";
  const reportQuery: any = {};
  mocks.from.mockImplementation((table: string) => {
    const query: any = {};
    for (const method of ["select", "eq", "gt", "order"])
      query[method] = vi.fn(() => query);
    query.maybeSingle = vi.fn(async () => ({
      data: table === "api_logs" ? { id } : null,
    }));
    query.limit = vi.fn(async () => ({ data: [] }));
    if (table === "api_logs") Object.assign(reportQuery, query);
    return query;
  });
  const res = response();
  await handleIssues(
    { method: "GET", query: { action: "issue-detail", id } } as any,
    res,
  );
  expect(res.code).toBe(200);
  expect(res.body).toEqual({ customerReportId: id });
  expect(reportQuery.eq).toHaveBeenCalledWith(
    "endpoint",
    "/event/listing_report_submitted",
  );
});

it("lists retained customer reports with bounded cursor pagination and safe context", async () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({
    id: `a423926a-35a6-4bf5-8027-${String(i).padStart(12, "0")}`,
    created_at: "2026-09-01T10:00:00.123456+00:00",
    user_id: null,
    user_email: null,
    full_request_body: {
      extensionVersion: "1.3.25",
      context: {
        category: "tool_bug",
        message: "Issue token=secret",
        titleValue: "Private title",
      },
    },
  }));
  const query: any = {};
  for (const method of ["select", "eq", "order", "or"])
    query[method] = vi.fn(() => query);
  query.limit = vi.fn(async () => ({ data: rows }));
  mocks.from.mockReturnValue(query);
  const res = response();
  const cursor = Buffer.from(
    JSON.stringify({
      time: "2026-10-01T00:00:00.123456+00:00",
      id: rows[0].id,
    }),
  ).toString("base64url");
  await handleIssues(
    { method: "GET", query: { action: "customer-reports", cursor } } as any,
    res,
  );
  expect(res.code).toBe(200);
  expect(res.body.reports).toHaveLength(50);
  expect(query.eq).toHaveBeenCalledWith(
    "endpoint",
    "/event/listing_report_submitted",
  );
  expect(query.limit).toHaveBeenCalledWith(51);
  expect(query.or).toHaveBeenCalledWith(
    expect.stringContaining("created_at.lt.2026-10-01T00:00:00.123456+00:00"),
  );
  expect(
    JSON.parse(Buffer.from(res.body.nextCursor, "base64url").toString()),
  ).toEqual({ time: rows[49].created_at, id: rows[49].id });
  expect(res.body.reports[0]).toMatchObject({
    category: "tool_bug",
    message: "Issue token=[redacted]",
    extensionVersion: "1.3.25",
  });
  expect(JSON.stringify(res.body)).not.toMatch(
    /Private title|full_request_body|secret/,
  );
});

it("rejects a forged report cursor before database access and fails honestly on a read error", async () => {
  const res = response();
  const cursor = Buffer.from(
    JSON.stringify({ time: "2026-10-01),id.gt.0", id: "forged" }),
  ).toString("base64url");
  await handleIssues(
    { method: "GET", query: { action: "customer-reports", cursor } } as any,
    res,
  );
  expect(res.code).toBe(400);
  expect(mocks.from).not.toHaveBeenCalled();
  const query: any = {};
  for (const method of ["select", "eq", "order"])
    query[method] = vi.fn(() => query);
  query.limit = vi.fn(async () => ({ error: new Error("offline") }));
  mocks.from.mockReturnValue(query);
  await handleIssues(
    { method: "GET", query: { action: "customer-reports" } } as any,
    res,
  );
  expect(res.code).toBe(503);
});
