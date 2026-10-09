import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), owner: vi.fn() }));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        gt: () => query,
        limit: () => query,
        maybeSingle: mocks.owner,
      };
      return query;
    },
  },
}));
import { ingestEnvelope } from "../../../utils/incidents/ingestion";
const owner = "123e4567-e89b-42d3-a456-426614174000";
const event = {
  id: "a423926a-35a6-4bf5-8027-8ab335c71110",
  occurredAt: new Date().toISOString(),
  event: "phone_upload_transfer_error",
  source: "phone_upload_page",
  phoneSessionKey: "a".repeat(64),
  context: { message: "Upload failed", sessionId: "private-session" },
};
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.INCIDENT_PROCESSING_PAUSED;
  mocks.rpc.mockResolvedValue({
    data: { status: "accepted", incidentId: "issue" },
  });
  mocks.owner.mockResolvedValue({
    data: { user_id: owner, identity_verified: true },
  });
});
it("attributes phone evidence only through the stored verified session owner", async () => {
  const result = await ingestEnvelope({
    events: [{ ...event, userId: "forged" }],
  });
  expect(result.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "incident_ingest",
    expect.objectContaining({
      p_user_id: owner,
      p_verified: true,
      p_event: expect.objectContaining({ phoneKey: "a".repeat(64) }),
    }),
  );
  expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(
    /private-session|forged/,
  );
});
it("rejects cross-account phone evidence without storing it", async () => {
  const result = await ingestEnvelope(
    { events: [event] },
    "a423926a-35a6-4bf5-8027-8ab335c71110",
  );
  expect(result.body.rejections).toEqual([
    { id: event.id, reason: "identity_mismatch" },
  ]);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("accepts phone evidence immediately when owner registration is missing, including legacy sessions", async () => {
  mocks.owner.mockResolvedValueOnce({ data: null });
  const early = await ingestEnvelope({ events: [event] });
  expect(early.body.acknowledgedIds).toEqual([event.id]);
  expect(early.body.rejections).toEqual([]);
  expect(mocks.rpc).toHaveBeenLastCalledWith(
    "incident_ingest",
    expect.objectContaining({
      p_user_id: null,
      p_verified: false,
      p_event: expect.objectContaining({ phoneKey: event.phoneSessionKey }),
    }),
  );
  const retried = await ingestEnvelope({ events: [event] });
  expect(retried.body.acknowledgedIds).toEqual([event.id]);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "incident_ingest",
    expect.objectContaining({ p_user_id: owner, p_verified: true }),
  );
});
it("keeps unknown phone ownership and forged backend sources unverified", async () => {
  mocks.owner.mockResolvedValue({ data: null });
  await ingestEnvelope({
    events: [{ ...event, source: "backend", userId: owner }],
  });
  expect(mocks.rpc).toHaveBeenCalledWith(
    "incident_ingest",
    expect.objectContaining({
      p_user_id: null,
      p_verified: false,
      p_event: expect.objectContaining({ source: "unknown_client" }),
    }),
  );
});
it("retains successful acknowledgements when a later write in the batch fails", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: { status: "accepted" } })
    .mockResolvedValueOnce({ error: new Error("offline") });
  const second = { ...event, id: "123e4567-e89b-42d3-a456-426614174000" };
  const result = await ingestEnvelope({ events: [event, second] });
  expect(result.status).toBe(503);
  expect(result.body.acknowledgedIds).toEqual([event.id]);
});
