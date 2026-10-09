BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';

-- Explicit feedback is a support record, not disposable diagnostic evidence.
-- Reuse api_logs and its existing retention policy. No photos, generated text,
-- stacks or breadcrumbs are copied. The incident transaction owns this write,
-- so a storage failure prevents acknowledgement and a retry cannot duplicate it.
CREATE FUNCTION persist_customer_report(g incident_groups) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO api_logs(id,user_id,user_email,endpoint,request_method,response_status,full_request_body)
  SELECT g.id,
    CASE WHEN (example->>'identityVerified')::boolean THEN (example->>'userId')::uuid END,
    CASE WHEN (example->>'identityVerified')::boolean THEN p.email END,
    '/event/listing_report_submitted','REPORT',204,
    jsonb_build_object('event',g.event,'source',g.source,'extensionVersion',g.release,
      'occurredAt',example->'occurredAt','incidentId',g.id,
      'identityVerified',example->'identityVerified',
      'context',jsonb_strip_nulls(jsonb_build_object(
        'category',example->'context'->'category','message',example->'context'->'message',
        'visiblePhotoCount',example->'context'->'visiblePhotoCount',
        'descriptionLength',example->'context'->'descriptionLength',
        'operationId',example->'operationId',
        'lastConfirmedStage',example->'context'->'lastConfirmedStage')))
  FROM (SELECT g.examples->0 AS example) e
  LEFT JOIN profiles p ON p.id=(example->>'userId')::uuid
  WHERE g.event='listing_report_submitted' AND example IS NOT NULL
  ON CONFLICT (id) DO NOTHING;
$$;

CREATE FUNCTION keep_customer_report() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM persist_customer_report(NEW);
  RETURN NEW;
END $$;

CREATE TRIGGER keep_customer_report AFTER INSERT ON incident_groups
FOR EACH ROW WHEN (NEW.event='listing_report_submitted')
EXECUTE FUNCTION keep_customer_report();

-- Rescue any reports whose temporary evidence still exists at rollout.
SELECT persist_customer_report(g) FROM incident_groups g
WHERE g.event='listing_report_submitted';

-- The report inbox uses the existing api_logs endpoint and created_at indexes.
-- This migration does not build an index or lock the large product log table.

REVOKE ALL ON FUNCTION persist_customer_report(incident_groups),keep_customer_report() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION persist_customer_report(incident_groups),keep_customer_report() TO service_role;

COMMIT;
