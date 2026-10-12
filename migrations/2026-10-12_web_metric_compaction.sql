-- Keep small web metrics for 30 days in the existing log table. Heavy evidence
-- still expires on the normal six-hour schedule. No new table or public RPC.
CREATE OR REPLACE FUNCTION public.compact_api_logs_for_web_metrics(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE changed integer;
BEGIN
  IF cardinality(p_ids) > 200 THEN RAISE EXCEPTION 'compaction batch too large'; END IF;
  UPDATE public.api_logs SET
    image_urls = NULL, raw_prompt = NULL, generated_title = NULL,
    generated_description = NULL, user_agent = NULL, origin = NULL,
    ip_address = NULL, user_email = NULL,
    full_request_body = CASE
      WHEN created_at >= now() - interval '30 days'
        AND endpoint IN ('/api/generate','/api/generation-result') AND full_request_body->>'client' = 'mobile_web'
      THEN jsonb_strip_nulls(jsonb_build_object('analyticsOnly',true,'client','mobile_web','requestId',left(full_request_body->>'requestId',80),'generationCommitted',full_request_body->'generationCommitted','generationStartedAt',left(full_request_body->>'generationStartedAt',40)))
      WHEN created_at >= now() - interval '30 days'
        AND ((full_request_body->>'source' = 'mobile_web' AND endpoint IN (
          '/event/web_app_view','/event/auth_complete','/event/upload_complete',
          '/event/generation_success','/event/generation_error','/event/copy',
          '/event/vinted_click','/event/checkout_start','/event/checkout_return'))
          OR (endpoint = '/event/web_app_click' AND full_request_body->>'source' = 'website'))
      THEN jsonb_strip_nulls(jsonb_build_object(
        'analyticsOnly',true,'event',left(full_request_body->>'event',80),
        'source',left(full_request_body->>'source',80),
        'transportEventId',left(full_request_body->>'transportEventId',80),
        'occurredAt',left(full_request_body->>'occurredAt',40),
        'context',jsonb_strip_nulls(jsonb_build_object(
          'analyticsClientId',left(full_request_body->'context'->>'analyticsClientId',80),
          'webSessionId',left(full_request_body->'context'->>'webSessionId',80),
          'source',left(full_request_body->'context'->>'source',80),
          'field',left(full_request_body->'context'->>'field',40)))))
      ELSE NULL END
  WHERE id = ANY(p_ids) AND (endpoint IS NULL OR endpoint <> '/event/listing_report_submitted');
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END; $$;
REVOKE ALL ON FUNCTION public.compact_api_logs_for_web_metrics(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compact_api_logs_for_web_metrics(uuid[]) TO service_role;
