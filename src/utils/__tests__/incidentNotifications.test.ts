import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  send: vi.fn(),
  update: vi.fn(),
  frozen: null as any,
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    rpc: (...args: any[]) => ({ abortSignal: () => mocks.rpc(...args) }),
    from: () => ({
      update: (value: any) => {
        mocks.update(value);
        const chain: any = {
          eq: () => chain,
          abortSignal: async () => ({ error: null }),
        };
        return chain;
      },
    }),
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
  vi.clearAllMocks();
  mocks.frozen = null;
  delete process.env.INCIDENT_PROCESSING_PAUSED;
  mocks.rpc.mockImplementation(async (name: string, args: any) => {
    if (name === "incident_claim_notifications") return { data: [incident] };
    if (name === "incident_freeze_notification") {
      mocks.frozen ||= { ...payload, email: args.p_email };
      return { data: mocks.frozen };
    }
    throw new Error("Unexpected RPC");
  });
  mocks.send.mockResolvedValue({ data: { id: "resend-1" } });
});

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
