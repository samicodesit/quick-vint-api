const emailKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
export function summarizeConversions({
  from,
  until,
  profiles = [],
  confirmedIds = [],
  generations = [],
  events = [],
}) {
  const start = Date.parse(from),
    end = Date.parse(until);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    throw new Error("Invalid conversion window");
  const inside = (time) => Date.parse(time) >= start && Date.parse(time) < end;
  const cohort = profiles.filter((p) => inside(p.created_at));
  const confirmed = new Set(confirmedIds),
    activated = new Set(generations.map((g) => g.user_id));
  const seen = new Set(),
    payments = [];
  for (const e of events) {
    const raw = e.raw_event || {};
    if (raw.livemode !== true) continue;
    const session =
      e.event_type === "checkout.session.completed" &&
      raw.payment_status === "paid";
    const invoice = e.event_type === "invoice.payment_succeeded";
    if (!session && !invoice) continue;
    // Subscription checkout and its first invoice describe the same payment.
    // Use invoices for subscriptions and checkout sessions for credit packs.
    if (session && e.stripe_subscription_id) continue;
    const amount = invoice ? raw.amount_paid : raw.amount_total;
    if (!Number.isSafeInteger(amount) || amount <= 0) continue;
    const key =
      (invoice ? "invoice:" : "session:") +
      (raw.objectId || e.stripe_invoice_id || e.stripe_event_id || e.id);
    if (seen.has(key)) continue;
    seen.add(key);
    const profile = profiles.find((p) => p.id === e.user_id);
    const buyer =
      emailKey(e.user_email || profile?.email) || e.stripe_customer_id;
    if (!buyer) throw new Error("Paid event has no attributable customer");
    payments.push({
      buyer,
      time: e.stripe_event_created_at || e.created_at,
      credit: session,
      amount,
      currency: String(raw.currency || e.currency || "unknown").toLowerCase(),
      starts: invoice && e.billing_reason === "subscription_create",
    });
  }
  const first = new Map();
  for (const p of payments)
    if (
      !first.has(p.buyer) ||
      Date.parse(p.time) < Date.parse(first.get(p.buyer))
    )
      first.set(p.buyer, p.time);
  const paid = payments.filter((p) => inside(p.time)),
    buyers = new Set(paid.map((p) => p.buyer));
  const credit = paid.filter((p) => p.credit),
    creditRevenueMinor = {};
  for (const p of credit)
    creditRevenueMinor[p.currency] =
      (creditRevenueMinor[p.currency] || 0) + p.amount;
  return {
    from,
    until,
    newAccounts: cohort.length,
    confirmedNewAccounts: cohort.filter((p) => confirmed.has(p.id)).length,
    activatedNewAccounts: cohort.filter((p) => activated.has(p.id)).length,
    payingCustomers: buyers.size,
    signupCohortBuyers: cohort.filter((p) => buyers.has(emailKey(p.email)))
      .length,
    firstRecordedBuyers: [...buyers].filter((b) => inside(first.get(b))).length,
    subscriptionStarts: paid.filter((p) => p.starts).length,
    creditPackPurchases: credit.length,
    creditRevenueMinor,
    measurement:
      "First recorded means earliest successful payment in retained billing history. It does not prove first ever. Revenue is gross credit-pack receipts in minor currency units, excluding subscription revenue and refunds.",
  };
}
