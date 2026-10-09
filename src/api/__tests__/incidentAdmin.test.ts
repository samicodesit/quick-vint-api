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
