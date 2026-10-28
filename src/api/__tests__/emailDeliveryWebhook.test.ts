import { beforeEach, describe, expect, it, vi } from "vitest";
const { verify, insert } = vi.hoisted(() => ({
  verify: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { webhooks: { verify } };
  }),
}));
vi.mock("micro", () => ({
  buffer: vi.fn(async () => Buffer.from("exact raw body")),
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { from: () => ({ insert }) },
}));
import handler from "../../../api/email/delivery";
function res() {
  const value: any = { status: vi.fn(), json: vi.fn() };
  value.status.mockReturnValue(value);
  return value;
}
describe("signed email delivery evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = "test-secret";
    insert.mockResolvedValue({ error: null });
    verify.mockReturnValue({
      type: "email.delivered",
      created_at: "2026-10-28T12:00:00Z",
      data: { email_id: "email_1", to: ["customer@example.com"] },
    });
  });
  it("verifies raw bytes before storing only the delivery event, not inbox content", async () => {
    const response = res();
    await handler(
      {
        method: "POST",
        headers: {
          "svix-id": "msg_1",
          "svix-signature": "signed",
          "svix-timestamp": "123",
        },
      } as any,
      response,
    );
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ payload: "exact raw body" }),
    );
    expect(insert).toHaveBeenCalledWith({
      id: "msg_1",
      resend_email_id: "email_1",
      event_type: "email.delivered",
      occurred_at: "2026-10-28T12:00:00Z",
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });
  it("rejects forged evidence and asks the provider to retry database failures", async () => {
    verify.mockImplementationOnce(() => {
      throw new Error("invalid signature");
    });
    const response = res();
    const request: any = {
      method: "POST",
      headers: {
        "svix-id": "msg_1",
        "svix-signature": "signed",
        "svix-timestamp": "123",
      },
    };
    await handler(request, response);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(insert).not.toHaveBeenCalled();
    insert.mockResolvedValueOnce({ error: { code: "XX000" } });
    await handler(request, response);
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
