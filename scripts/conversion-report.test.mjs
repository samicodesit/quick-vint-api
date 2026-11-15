import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeConversions } from "./conversion-report-lib.mjs";
const from = "2026-11-12T16:00:00Z",
  until = "2026-11-15T16:00:00Z";
const pack = (id, email, time, amount = 999) => ({
  stripe_event_id: id,
  created_at: time,
  user_email: email,
  event_type: "checkout.session.completed",
  raw_event: {
    objectId: id,
    livemode: true,
    payment_status: "paid",
    amount_total: amount,
    currency: "eur",
  },
});
test("counts a new credit buyer separately from subscriptions and duplicate deliveries", () => {
  const event = pack("s", "buyer@example.test", "2026-11-13T10:00:00Z");
  const r = summarizeConversions({
    from,
    until,
    profiles: [{ id: "u", email: "buyer@example.test", created_at: from }],
    confirmedIds: ["u"],
    events: [event, event],
    generations: [{ user_id: "u" }],
  });
  assert.equal(r.newAccounts, 1);
  assert.equal(r.confirmedNewAccounts, 1);
  assert.equal(r.activatedNewAccounts, 1);
  assert.equal(r.signupCohortBuyers, 1);
  assert.equal(r.creditPackPurchases, 1);
  assert.equal(r.subscriptionStarts, 0);
  assert.deepEqual(r.creditRevenueMinor, { eur: 999 });
});
test("separates repeat buyers and ignores test, zero and unfinished checkout", () => {
  const earlier = pack("prior", "a@example.test", "2026-11-01T00:00:00Z");
  const later = pack("later", "a@example.test", from);
  const testEvent = pack("test", "b@example.test", from);
  testEvent.raw_event.livemode = false;
  const unpaid = pack("unpaid", "c@example.test", from);
  unpaid.raw_event.payment_status = "unpaid";
  const r = summarizeConversions({
    from,
    until,
    profiles: [],
    events: [
      earlier,
      later,
      testEvent,
      unpaid,
      pack("zero", "z@example.test", from, 0),
    ],
  });
  assert.equal(r.firstRecordedBuyers, 0);
  assert.equal(r.payingCustomers, 1);
  assert.equal(r.creditPackPurchases, 1);
});
test("does not call renewal invoices new subscription starts or credit packs", () => {
  const e = {
    ...pack("invoice", "a@example.test", from),
    event_type: "invoice.payment_succeeded",
    stripe_subscription_id: "sub",
    billing_reason: "subscription_cycle",
    raw_event: {
      livemode: true,
      amount_paid: 999,
      currency: "eur",
      objectId: "in",
    },
  };
  const r = summarizeConversions({ from, until, events: [e], profiles: [] });
  assert.equal(r.subscriptionStarts, 0);
  assert.equal(r.creditPackPurchases, 0);
  assert.equal(r.payingCustomers, 1);
});
