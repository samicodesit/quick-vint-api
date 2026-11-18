-- Keep the deployed quota, model and lease checks in listing_photo_mutate.
-- A completed source checkpoint renews its current worker lease. Older
-- callers keep the original metrics response and lease duration.
BEGIN;
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.listing_photo_mutate(uuid,text,jsonb)'::regprocedure);
  original text := $old$  UPDATE listing_photo_jobs SET cost_usd=(SELECT coalesce(sum(cost_usd),0) FROM listing_photo_attempts WHERE job_id=j.id),updated_at=now() WHERE id=j.id;
  RETURN to_jsonb(j);$old$;
  replacement text := $new$  IF NOT FOUND AND p_input->'ackOnly' = 'true'::jsonb THEN RETURN NULL; END IF;
  UPDATE listing_photo_jobs SET cost_usd=(SELECT coalesce(sum(cost_usd),0) FROM listing_photo_attempts WHERE job_id=j.id),
   lease_until=CASE WHEN p_input->'ackOnly' = 'true'::jsonb AND coalesce(p_input->>'status','complete')='complete'
     THEN now()+interval '100 seconds' ELSE lease_until END,updated_at=now() WHERE id=j.id;
  IF p_input->'ackOnly' = 'true'::jsonb THEN RETURN 'true'::jsonb; END IF;
  RETURN to_jsonb(j);$new$;
BEGIN
  IF strpos(definition, replacement) > 0 THEN RETURN; END IF;
  IF array_length(string_to_array(definition, original), 1) <> 2 THEN
    RAISE EXCEPTION 'Unexpected listing_photo_mutate metrics definition';
  END IF;
  EXECUTE replace(definition, original, replacement);
END
$migration$;
COMMIT;
