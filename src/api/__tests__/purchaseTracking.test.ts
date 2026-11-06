import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  retrieve: vi.fn(),
  invoice: vi.fn(),
  list: vi.fn(),
  from: vi.fn(),
  history: [] as any[],
  historyError: null as any,
  profile: { id: "profile_fixture" } as any,
}));
vi.mock("stripe", () => ({
  default: function () {
    return {
      checkout: { sessions: { retrieve: m.retrieve } },
      invoices: { retrieve: m.invoice, list: m.list },
    };
  },
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { from: m.from },
}));
vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: vi.fn(),
}));
import handler from "../../../api/stripe/verify-session";
const session = {
  id: "cs_live_test_fixture",
  livemode: true,
  created: 1000,
  status: "complete",
  payment_status: "paid",
  mode: "subscription",
  customer: "cus_fixture",
  subscription: "sub_fixture",
  invoice: "in_fixture",
  amount_total: 399,
  currency: "eur",
  metadata: { tier: "starter" },
};
const invoice = {
  id: "in_fixture",
  livemode: true,
  created: 1000,
  status: "paid",
  amount_paid: 399,
  currency: "eur",
  billing_reason: "subscription_create",
  customer: "cus_fixture",
  parent: { subscription_details: { subscription: "sub_fixture" } },
};
beforeEach(() => {
  vi.clearAllMocks();
  m.history = [];
  m.historyError = null;
  m.profile = { id: "profile_fixture" };
  m.retrieve.mockResolvedValue({ ...session });
  m.invoice.mockResolvedValue({ ...invoice });
  m.list.mockImplementation(() => ({
    async *[Symbol.asyncIterator]() {
      yield invoice;
    },
  }));
  m.from.mockImplementation((table) => {
    const q: any = {};
    for (const k of ["select", "eq", "neq", "gt", "lt", "lte", "not", "limit"])
      q[k] = vi.fn(() => q);
    q.maybeSingle = vi.fn(async () => ({
      data: m.profile,
      error: null,
    }));
    q.then = (resolve: any) =>
      resolve({
        data: table === "billing_events" ? m.history : [m.profile],
        error: table === "billing_events" ? m.historyError : null,
      });
    return q;
  });
});
async function run() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
  await handler(
    { method: "GET", query: { session_id: session.id } } as any,
    res,
  );
  return res.json.mock.calls[0][0];
}
it("returns a server-verified first subscription purchase with invoice deduplication", async () => {
  expect((await run()).purchase_conversion).toEqual({
    transaction_id: "in_fixture",
    value: 3.99,
    currency: "EUR",
    new_customer: true,
  });
});
it.each([
  { payment_status: "unpaid" },
  { livemode: false },
  { mode: "payment" },
  { amount_total: 0 },
])("does not count an ineligible session %j", async (change) => {
  m.retrieve.mockResolvedValue({ ...session, ...change });
  expect((await run()).purchase_conversion ?? null).toBeNull();
});
it("does not count a renewal", async () => {
  m.invoice.mockResolvedValue({
    ...invoice,
    billing_reason: "subscription_cycle",
  });
  expect((await run()).purchase_conversion ?? null).toBeNull();
});
it("does not count an earlier paying subscription customer", async () => {
  m.list.mockImplementation(() => ({
    async *[Symbol.asyncIterator]() {
      yield { ...invoice, id: "in_older", created: 500 };
      yield invoice;
    },
  }));
  expect((await run()).purchase_conversion ?? null).toBeNull();
});
it("keeps fulfillment working when tracking checks fail", async () => {
  m.invoice.mockRejectedValue(new Error("tracking unavailable"));
  const data = await run();
  expect(data.fulfilled).toBe(true);
  expect(data.purchase_conversion ?? null).toBeNull();
});
it("does not emit tracking for an unpaid invoice", async () => {
  m.invoice.mockResolvedValue({ ...invoice, amount_paid: 0 });
  expect((await run()).purchase_conversion ?? null).toBeNull();
});

it("excludes paid history on a different Stripe customer for the same profile", async () => {
  m.history = [{ stripe_invoice_id: "in_previous_customer" }];
  expect((await run()).purchase_conversion).toBeNull();
});
it("fails closed when billing history is unavailable without breaking fulfillment", async () => {
  m.historyError = new Error("history unavailable");
  const result = await run();
  expect(result.fulfilled).toBe(true);
  expect(result.purchase_conversion).toBeNull();
});
it("waits for fulfillment before counting payment", async () => {
  m.profile = null;
  const result = await run();
  expect(result.fulfilled).toBe(false);
  expect(result.purchase_conversion).toBeNull();
  expect(m.invoice).not.toHaveBeenCalled();
});
it.each([
  { customer: "cus_different" },
  { parent: { subscription_details: { subscription: "sub_different" } } },
  { currency: "usd" },
])("rejects invoice mismatch or unsupported currency %j", async (change) => {
  m.invoice.mockResolvedValue({ ...invoice, ...change });
  expect((await run()).purchase_conversion).toBeNull();
});
