import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), record: vi.fn() }));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { rpc: mocks.rpc },
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
