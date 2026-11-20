-- First observed free-limit screen per authenticated account, across both clients.
-- Seven complete days per account. Amounts are gross settled EUR, before refunds.
WITH first_view AS (
  SELECT DISTINCT ON (user_id) user_id, created_at AS shown,
    split_part(endpoint, '/', 3) AS arm_event, split_part(endpoint, '/', 4) AS surface
  FROM api_logs
  WHERE endpoint IN (
    '/event/free_limit_view_tabs_v1/mobile_web','/event/free_limit_view_combined_v1/mobile_web',
    '/event/free_limit_view_tabs_v1/extension_content','/event/free_limit_view_combined_v1/extension_content'
  ) AND user_id IS NOT NULL
  ORDER BY user_id, created_at, id
), eligible AS (
  SELECT v.*, p.stripe_customer_id, p.email
  FROM first_view v JOIN profiles p ON p.id = v.user_id
  WHERE shown <= now() - interval '7 days'
), invoices AS (
  SELECT DISTINCT ON (e.user_id,b.stripe_invoice_id) e.user_id,
    coalesce(b.stripe_event_created_at,b.created_at) AS paid,
    nullif(b.raw_event->>'amount_paid','')::numeric AS cents,b.currency
  FROM eligible e JOIN billing_events b ON
    (b.user_id=e.user_id OR b.stripe_customer_id=e.stripe_customer_id OR lower(b.user_email)=lower(e.email))
  WHERE b.event_type IN ('invoice.paid','invoice.payment_succeeded') AND b.status='paid'
    AND b.amount_due>0 AND b.stripe_invoice_id IS NOT NULL AND coalesce(b.raw_event->>'livemode','true')='true'
  ORDER BY e.user_id,b.stripe_invoice_id,coalesce(b.stripe_event_created_at,b.created_at),b.created_at
), packs AS (
  SELECT e.user_id,l.created_at AS paid,b.cents,b.currency
  FROM eligible e JOIN credit_ledger l ON e.user_id=l.user_id
  LEFT JOIN LATERAL (
    SELECT (raw_event->>'amount_total')::numeric AS cents,currency
    FROM billing_events
    WHERE raw_event->>'objectId'=l.stripe_session_id AND raw_event->>'payment_status'='paid'
      AND event_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded')
    ORDER BY created_at LIMIT 1
  ) b ON true
  WHERE l.type='purchase' AND l.delta>0 AND left(l.stripe_session_id,8)='cs_live_'
), payments AS (
  SELECT * FROM invoices WHERE cents IS NULL OR cents>0
  UNION ALL SELECT * FROM packs WHERE cents IS NULL OR cents>0
), accounts AS (
  SELECT e.user_id,e.arm_event,e.surface,
    min(p.paid) FILTER (WHERE p.cents>0) >= e.shown
      AND count(*) FILTER (WHERE p.paid<e.shown AND p.cents IS NULL)=0 AS first_buyer,
    coalesce(sum(p.cents) FILTER (WHERE p.paid >= e.shown AND p.currency='eur'),0) AS receipts,
    count(*) FILTER (WHERE p.paid >= e.shown AND (p.cents IS NULL OR p.currency IS DISTINCT FROM 'eur')) AS unresolved
  FROM eligible e LEFT JOIN payments p ON e.user_id=p.user_id AND p.paid<e.shown+interval '7 days'
  GROUP BY e.user_id,e.arm_event,e.surface,e.shown
)
SELECT arm_event,coalesce(surface,'all') AS first_surface,count(*) AS eligible_accounts,
  count(*) FILTER(WHERE first_buyer) AS first_buyers,
  round(100.0*count(*) FILTER(WHERE first_buyer)/count(*),1) AS first_buyer_pct,
  CASE WHEN sum(unresolved)=0 THEN round(sum(receipts)/100/count(*),2) END AS gross_eur_per_eligible_account,
  sum(unresolved) AS receipts_to_reconcile
FROM accounts GROUP BY GROUPING SETS ((arm_event,surface),(arm_event)) ORDER BY 1,2;
