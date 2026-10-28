import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, deliver } = vi.hoisted(() => ({ rpc: vi.fn(), deliver: vi.fn() }));
vi.mock("../../../utils/supabaseClient", () => ({ supabase: { rpc } }));
vi.mock("../../../utils/billingNotices", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  deliverBillingNotice: deliver,
}));
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return {};
  }),
}));
vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: vi.fn(),
}));
import handler from "../../../api/customer/withdraw";

function response() {
  const res: any = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
const body = {
  requestId: "11111111-1111-4111-8111-111111111111",
  name: "Customer Name",
  email: "customer@example.com",
  contract: "My AutoLister subscription",
  confirmed: true,
};
describe("withdrawal statement receipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    rpc.mockResolvedValue({
      data: { received_at: "2026-10-28T12:00:00Z" },
      error: null,
    });
    deliver.mockResolvedValue("sent");
  });
  it("persists the statement and receipt atomically before acknowledging", async () => {
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { origin: "https://autolister.app" },
        body,
      } as any,
      res,
    );
    expect(rpc).toHaveBeenCalledWith(
      "receive_withdrawal",
      expect.objectContaining({
        p_id: body.requestId,
        p_name: body.name,
        p_contract: body.contract,
        p_email: body.email,
      }),
    );
    expect(deliver).toHaveBeenCalledWith(`withdrawal/${body.requestId}`);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ receivedAt: "2026-10-28T12:00:00Z" }),
    );
  });
  it("preserves the original receipt when immediate email delivery fails", async () => {
    deliver.mockRejectedValueOnce(new Error("provider unavailable"));
    const res = response();
    await handler({ method: "POST", headers: {}, body } as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        receivedAt: "2026-10-28T12:00:00Z",
        emailStatus: "queued",
      }),
    );
  });
  it("does not claim receipt when persistence fails", async () => {
    rpc.mockResolvedValue({ error: { message: "database unavailable" } });
    const res = response();
    await handler({ method: "POST", headers: {}, body } as any, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(deliver).not.toHaveBeenCalled();
  });
  it("requires an explicit confirmation and rejects foreign origins", async () => {
    const res = response();
    await handler(
      {
        method: "POST",
        headers: {},
        body: { ...body, confirmed: false },
      } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(rpc).not.toHaveBeenCalled();
    await handler(
      {
        method: "POST",
        headers: { origin: "https://evil.example" },
        body,
      } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
