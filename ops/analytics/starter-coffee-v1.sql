-- Read-only report on the first enrolled web paywall impression per account.
-- Use complete seven-day windows. Revenue is gross, in EUR, before refunds.
-- Payments are account outcomes after exposure, including any checkout surface.
WITH first_view AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    created_at AS shown,
    full_request_body->'context'->>'target' AS arm
  FROM api_logs
  WHERE endpoint = '/event/web_paywall_view'
    AND full_request_body->>'source' = 'mobile_web'
    AND full_request_body->'context'->>'target' IN (
      'starter_coffee_control_v1', 'starter_coffee_comparison_v1'
    )
    AND user_id IS NOT NULL
  ORDER BY user_id, created_at, id
), eligible AS (
  SELECT v.*, p.stripe_customer_id, p.email
  FROM first_view v
  LEFT JOIN profiles p ON p.id = v.user_id
  WHERE shown <= now() - interval '7 days'
), payments AS (
  SELECT DISTINCT ON (e.user_id, b.stripe_invoice_id)
    e.user_id,
    'subscription' AS kind,
    (b.raw_event->>'amount_paid')::numeric AS cents,
    b.currency
  FROM eligible e
  JOIN billing_events b ON (
    b.user_id = e.user_id
    OR (b.user_id IS NULL AND (
      b.stripe_customer_id = e.stripe_customer_id
      OR lower(b.user_email) = lower(e.email)
    ))
  )
  WHERE b.event_type IN ('invoice.paid', 'invoice.payment_succeeded')
    AND b.status = 'paid'
    AND b.billing_reason = 'subscription_create'
    AND b.stripe_invoice_id IS NOT NULL
    AND b.raw_event->>'livemode' = 'true'
    AND (b.raw_event->>'amount_paid')::numeric > 0
    AND coalesce(b.stripe_event_created_at, b.created_at) >= e.shown
    AND coalesce(b.stripe_event_created_at, b.created_at) < e.shown + interval '7 days'
), packs AS (
  SELECT DISTINCT ON (e.user_id, l.stripe_session_id)
    e.user_id, 'credits' AS kind, b.cents, b.currency
  FROM eligible e
  JOIN credit_ledger l ON l.user_id = e.user_id
  LEFT JOIN LATERAL (
    SELECT (raw_event->>'amount_total')::numeric AS cents, currency
    FROM billing_events
    WHERE raw_event->>'objectId' = l.stripe_session_id
      AND raw_event->>'payment_status' = 'paid'
      AND event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
    ORDER BY created_at
    LIMIT 1
  ) b ON true
  WHERE l.type = 'purchase' AND l.delta > 0
    AND left(l.stripe_session_id, 8) = 'cs_live_'
    AND l.created_at >= e.shown AND l.created_at < e.shown + interval '7 days'
    AND (b.cents IS NULL OR b.cents > 0)
), paid AS (
  SELECT user_id,
    bool_or(cents > 0) AS buyer,
    bool_or(kind = 'subscription' AND cents > 0) AS subscriber,
    bool_or(kind = 'credits' AND cents > 0) AS credit_buyer,
    coalesce(sum(cents) FILTER (WHERE currency = 'eur'), 0) AS receipts,
    count(*) FILTER (WHERE cents IS NULL OR currency IS DISTINCT FROM 'eur') AS unresolved
  FROM (SELECT * FROM payments UNION ALL SELECT * FROM packs) purchases
  GROUP BY user_id
), checkouts AS (
  SELECT DISTINCT e.user_id
  FROM eligible e
  JOIN api_logs l ON l.user_id = e.user_id
    AND l.created_at >= e.shown
    AND l.created_at < e.shown + interval '7 days'
  WHERE l.endpoint = '/event/checkout_opened'
    AND l.full_request_body->>'source' = 'mobile_web'
    AND l.full_request_body->'context'->>'target' = e.arm
)
SELECT e.arm,
  count(*) AS exposed_accounts,
  count(c.user_id) AS checkout_accounts,
  count(*) FILTER (WHERE p.buyer) AS paid_accounts,
  count(*) FILTER (WHERE p.subscriber) AS subscription_buyers,
  count(*) FILTER (WHERE p.credit_buyer) AS credit_buyers,
  round(100.0 * count(*) FILTER (WHERE p.buyer) / count(*), 2) AS paid_account_pct,
  CASE WHEN coalesce(sum(p.unresolved), 0) = 0
    THEN round(coalesce(sum(p.receipts), 0) / 100 / count(*), 2)
  END AS gross_eur_per_account,
  coalesce(sum(p.unresolved), 0) AS payments_to_reconcile
FROM eligible e
LEFT JOIN paid p ON p.user_id = e.user_id
LEFT JOIN checkouts c ON c.user_id = e.user_id
GROUP BY e.arm ORDER BY e.arm;
