-- Preserve bounded checkout attempts and outcomes in the existing 30-day metrics.
-- Photos, prompts, generated text and identifying request evidence still clear
-- at six hours. Thirty-day retention and service-role access do not change.
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
      THEN jsonb_strip_nulls(jsonb_build_object(
        'analyticsOnly',true,'client','mobile_web','requestId',left(full_request_body->>'requestId',80),
        'analyticsClientId',CASE WHEN full_request_body->>'analyticsClientId' ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN full_request_body->>'analyticsClientId' END,
        'imageCount',CASE WHEN jsonb_typeof(full_request_body->'imageCount') = 'number' THEN least(100,greatest(0,(full_request_body->>'imageCount')::numeric)) END,
        'openaiImageCount',CASE WHEN jsonb_typeof(full_request_body->'openaiImageCount') = 'number' THEN least(100,greatest(0,(full_request_body->>'openaiImageCount')::numeric)) END,
        'generationCommitted',CASE WHEN jsonb_typeof(full_request_body->'generationCommitted') = 'boolean' THEN full_request_body->'generationCommitted' END,
        'generationStartedAt',left(full_request_body->>'generationStartedAt',40)))
      WHEN created_at >= now() - interval '30 days'
        AND ((full_request_body->>'source' = 'mobile_web' AND endpoint IN (
          '/event/web_app_view','/event/auth_complete','/event/upload_complete',
          '/event/generation_success','/event/generation_error','/event/copy',
          '/event/web_generation_run','/event/web_paywall_view','/event/web_style_setup',
          '/event/vinted_click','/event/checkout_start','/event/checkout_return'))
          OR (endpoint IN ('/event/checkout_start','/event/checkout_opened','/event/checkout_failed',
            '/event/billing_portal_start','/event/billing_portal_opened') AND full_request_body->>'source' IN
            ('extension_content','extension_popup','extension_background','website','mobile_web'))
          OR (endpoint = '/event/subscription_started' AND full_request_body->>'source' = 'stripe_webhook')
          OR (full_request_body->>'source' = 'website' AND (endpoint = '/event/web_app_click'
            OR (endpoint IN ('/event/home_hero_exposure','/event/chrome_store_click') AND full_request_body->'context'->>'heroExperiment' = 'mobile-entry-v1'))))
      THEN jsonb_strip_nulls(jsonb_build_object(
        'analyticsOnly',true,'event',left(full_request_body->>'event',80),
        'automatedTraffic',CASE WHEN jsonb_typeof(full_request_body->'automatedTraffic') = 'boolean' THEN full_request_body->'automatedTraffic' END,
        'source',left(full_request_body->>'source',80),
        'transportEventId',left(full_request_body->>'transportEventId',80),
        'occurredAt',left(full_request_body->>'occurredAt',40),
        'plan',left(full_request_body->>'plan',40),
        'extensionVersion',left(full_request_body->>'extensionVersion',40),
        'context',jsonb_strip_nulls(jsonb_build_object(
          'operationId',left(full_request_body->'context'->>'operationId',80),
          'checkoutKind',left(full_request_body->'context'->>'checkoutKind',40),
          'checkoutType',left(full_request_body->'context'->>'checkoutType',40),
          'packId',left(full_request_body->'context'->>'packId',40),
          'limitCode',left(full_request_body->'context'->>'limitCode',80),
          'target',left(full_request_body->'context'->>'target',40),
          'analyticsClientId',left(full_request_body->'context'->>'analyticsClientId',80),
          'webSessionId',left(full_request_body->'context'->>'webSessionId',80),
          'source',left(full_request_body->'context'->>'source',80),
          'field',left(full_request_body->'context'->>'field',40),
          'heroExperiment',left(full_request_body->'context'->>'heroExperiment',40),
          'heroVariant',CASE WHEN full_request_body->'context'->>'heroVariant' IN ('a','b') THEN full_request_body->'context'->>'heroVariant' END,
          'method',left(full_request_body->'context'->>'method',40),
          'count',CASE WHEN jsonb_typeof(full_request_body->'context'->'count') = 'number' THEN least(100,greatest(0,(full_request_body->'context'->>'count')::numeric)) END,
          'status',left(full_request_body->'context'->>'status',40),
          'tier',left(full_request_body->'context'->>'tier',40),
          'reason',left(coalesce(full_request_body->'context'->>'reason',
            CASE WHEN endpoint = '/event/web_paywall_view' THEN full_request_body->'context'->>'errorCode' END),80),
          'entryPoint',CASE WHEN full_request_body->'context'->>'entryPoint' IN ('profile_menu','feature_lock','plans_link','generation_limit','unknown') THEN full_request_body->'context'->>'entryPoint' END,
          'phase',CASE WHEN full_request_body->'context'->>'phase' IN ('shown','complete') THEN full_request_body->'context'->>'phase' END,
          'titleLanguageCode',CASE WHEN full_request_body->'context'->>'titleLanguageCode' ~ '^[a-z]{2}(-[a-z]{2})?$' THEN full_request_body->'context'->>'titleLanguageCode' END,
          'descriptionLanguageCode',CASE WHEN full_request_body->'context'->>'descriptionLanguageCode' ~ '^[a-z]{2}(-[a-z]{2})?$' THEN full_request_body->'context'->>'descriptionLanguageCode' END,
          'descriptionLength',CASE WHEN full_request_body->'context'->>'descriptionLength' IN ('short','long') THEN full_request_body->'context'->>'descriptionLength' END,
          'useBulletPoints',CASE WHEN jsonb_typeof(full_request_body->'context'->'useBulletPoints') = 'boolean' THEN full_request_body->'context'->'useBulletPoints' END,
          'useHashtags',CASE WHEN jsonb_typeof(full_request_body->'context'->'useHashtags') = 'boolean' THEN full_request_body->'context'->'useHashtags' END,
          'useEmojis',CASE WHEN jsonb_typeof(full_request_body->'context'->'useEmojis') = 'boolean' THEN full_request_body->'context'->'useEmojis' END,
          'includeSellerNote',CASE WHEN jsonb_typeof(full_request_body->'context'->'includeSellerNote') = 'boolean' THEN full_request_body->'context'->'includeSellerNote' END,
          'errorCode',left(full_request_body->'context'->>'errorCode',80)))))
      ELSE NULL END
  WHERE id = ANY(p_ids) AND (endpoint IS NULL OR endpoint <> '/event/listing_report_submitted');
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END; $$;
REVOKE ALL ON FUNCTION public.compact_api_logs_for_web_metrics(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compact_api_logs_for_web_metrics(uuid[]) TO service_role;
