-- Read-only. Client observations are not proof of generation or publication.
SELECT date_trunc('day', created_at) AS day,
 full_request_body->>'event' AS event,
 full_request_body->>'source' AS client,
 full_request_body->'context'->>'entryPoint' AS entry_point,
 full_request_body->'context'->>'mode' AS mode,
 count(*) AS events,
 count(DISTINCT user_id) AS authenticated_accounts,
 count(*) FILTER (WHERE user_id IS NULL) AS anonymous_events,
 count(DISTINCT full_request_body->'context'->>'operationId') AS observed_operations
FROM public.api_logs
WHERE created_at > now()-interval '30 days'
 AND (endpoint LIKE '/event/model\_%' ESCAPE '\' OR endpoint LIKE '/event/listing\_tour\_%' ESCAPE '\')
GROUP BY 1,2,3,4,5 ORDER BY 1 DESC,2,3,4,5;

-- Ordered, authenticated exposure cohort. Latest seven days can be incomplete.
-- Server creation and successful photo jobs remain observable after closing UI.
WITH exposures AS (
 SELECT user_id, min(created_at) exposed_at FROM public.api_logs
 WHERE endpoint='/event/model_invitation_shown' AND user_id IS NOT NULL
 AND created_at>now()-interval '30 days' GROUP BY user_id
), funnel AS (
 SELECT e.*, o.opened_at, m.created_at model_created_at, m.state model_state,
  s.enabled, j.first_ready_at
 FROM exposures e
 LEFT JOIN LATERAL (
  SELECT min(created_at) opened_at FROM public.api_logs
  WHERE user_id=e.user_id AND endpoint='/event/model_view_opened' AND created_at>=e.exposed_at
 ) o ON true
 LEFT JOIN public.user_models m ON m.user_id=e.user_id AND m.created_at>=o.opened_at
 LEFT JOIN public.user_model_settings s ON s.user_id=e.user_id
 LEFT JOIN LATERAL (
  SELECT min(created_at) first_ready_at FROM public.listing_photo_jobs
  WHERE user_id=e.user_id AND kind='listing' AND state='ready' AND created_at>=m.created_at
 ) j ON true
)
SELECT count(*) exposed_accounts, count(opened_at) opened_accounts,
 count(*) FILTER (WHERE model_state='ready') created_models,
 count(*) FILTER (WHERE model_state='ready' AND enabled) currently_enabled_created_models,
 count(first_ready_at) accounts_with_completed_photo_pair
FROM funnel;

-- Authoritative creation totals, separate from client completion observations.
SELECT state, count(*) models FROM public.user_models GROUP BY state;
SELECT enabled, count(*) accounts FROM public.user_model_settings GROUP BY enabled;
