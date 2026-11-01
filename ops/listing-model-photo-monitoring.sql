-- Read-only diagnostics. Client attachment reports are observations.
-- Provider completion is a timing proxy, not the moment photos became visible.
-- updated_at also changes on later attachment receipts and must not measure generation.
WITH listing_jobs AS (
 SELECT j.*, (SELECT max(a.completed_at) FROM public.listing_photo_attempts a
  WHERE a.job_id=j.id AND a.stage<>'source') AS provider_finished_at
 FROM public.listing_photo_jobs j
 WHERE j.kind='listing' AND j.created_at>now()-interval '7 days'
)
SELECT date_trunc('day', created_at) AS day,
 count(*) AS jobs,
 count(*) FILTER (WHERE state='ready') AS completed_pairs,
 count(*) FILTER (WHERE state='skipped') AS unsuitable_items,
 count(*) FILTER (WHERE state='failed') AS failed_jobs,
 count(*) FILTER (WHERE retry_count>0) AS retried_jobs,
 count(*) FILTER (WHERE payload->>'attachment'='attached') AS reported_attached,
 count(*) FILTER (WHERE payload->>'attachment'='order_failed') AS manual_order_required,
 sum(coalesce((payload->>'attachmentFailures')::integer,0)) AS attachment_failures,
 percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM provider_finished_at-created_at)) FILTER (WHERE state='ready' AND retry_count=0) AS median_to_last_provider_result_seconds,
 sum(cost_usd) AS actual_api_usd,
 sum(cost_usd)/nullif(count(*) FILTER (WHERE state='ready'),0) AS usd_per_completed_pair
FROM listing_jobs
GROUP BY 1 ORDER BY 1 DESC;

SELECT stage, metrics->>'model' AS model, count(*) AS calls,
 count(*) FILTER (WHERE cost_usd IS NULL) AS unknown_outcomes,
 percentile_cont(0.5) WITHIN GROUP (ORDER BY (metrics->>'durationMs')::numeric) AS median_provider_ms,
 sum(cost_usd) AS actual_api_usd
FROM public.listing_photo_attempts
WHERE created_at>now()-interval '7 days' AND stage<>'source'
GROUP BY 1,2 ORDER BY 1,2;
