import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, update, send, retrieve, writes } = vi.hoisted(() => ({
  rpc: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
  retrieve: vi.fn(),
  writes: [] as any[],
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { rpc, from: () => ({ update }) },
}));
vi.mock("stripe", () => ({
  default: vi.fn(function () {
    return { subscriptions: { retrieve } };
  }),
}));
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send } };
  }),
}));
import {
  cancellationNotice,
  deliverBillingNotice,
} from "../../../utils/billingNotices";

describe("cancellation acknowledgment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    const builder: any = {
      eq: vi.fn(() => builder),
      then: (resolve: any, reject: any) =>
        Promise.resolve({ error: null }).then(resolve, reject),
    };
    update.mockImplementation((value) => {
      writes.push(value);
      return builder;
    });
    send.mockResolvedValue({ data: { id: "email_1" }, error: null });
  });
  const event: any = {
    id: "evt_1",
    type: "customer.subscription.updated",
    created: 1793192400,
    data: {
      previous_attributes: { cancel_at_period_end: false },
      object: {
        id: "sub_1",
        customer: "cus_1",
        cancel_at_period_end: true,
        canceled_at: 1793192400,
        items: { data: [{ current_period_end: 1793642400 }] },
        status: "active",
      },
    },
  };
  it("acknowledges only a real transition and keeps separate cancellation episodes", () => {
    const notice = cancellationNotice(event, "seller@example.com");
    expect(notice?.payload.html).toContain("Renewal has been stopped");
    expect(notice?.payload.html).toContain("2026");
    expect(notice?.key).toContain("sub_1/1793192400");
    expect(
      cancellationNotice(
        {
          ...event,
          data: {
            ...event.data,
            previous_attributes: { description: "changed" },
          },
        },
        "seller@example.com",
      ),
    ).toBeNull();
    expect(
      cancellationNotice(
        {
          ...event,
          data: {
            ...event.data,
            object: { ...event.data.object, cancel_at_period_end: false },
          },
        },
        "seller@example.com",
      ),
    ).toBeNull();
  });
  it.each([false, true])(
    "rechecks a queued cancellation before a retry (still canceled: %s)",
    async (stillCanceled) => {
      const notice = cancellationNotice(event, "seller@example.com")!;
      rpc.mockResolvedValue({
        data: [{ ...notice, lease: "lease" }],
        error: null,
      });
      retrieve.mockResolvedValue({
        ...event.data.object,
        cancel_at_period_end: stillCanceled,
      });
      const result = await deliverBillingNotice(notice.key);
      expect(result).toBe(stillCanceled ? "sent" : "superseded");
      expect(send).toHaveBeenCalledTimes(stillCanceled ? 1 : 0);
      expect(writes).toContainEqual(
        expect.objectContaining({
          status: stillCanceled ? "sent" : "superseded",
        }),
      );
    },
  );
  it("does not send a cancellation from an older episode", async () => {
    const notice = cancellationNotice(event, "seller@example.com")!;
    rpc.mockResolvedValue({
      data: [{ ...notice, lease: "lease" }],
      error: null,
    });
    retrieve.mockResolvedValue({
      ...event.data.object,
      canceled_at: 1793199999,
    });
    expect(await deliverBillingNotice(notice.key)).toBe("superseded");
    expect(send).not.toHaveBeenCalled();
  });
});
