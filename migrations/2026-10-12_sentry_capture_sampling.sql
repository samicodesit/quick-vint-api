BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';

ALTER TABLE public.incident_daily_budgets
  ADD COLUMN IF NOT EXISTS sentry_transient integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sentry_samples jsonb NOT NULL DEFAULT '{}';

-- Existing no-argument callers remain compatible. New callers derive priority
-- from durable incident classification, never a client-provided severity.
CREATE OR REPLACE FUNCTION public.incident_reserve_sentry(p_incident_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  is_transient boolean := false;
  allowed boolean;
  budget_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT severity='transient' INTO is_transient
    FROM incident_groups WHERE id=p_incident_id;
  is_transient := coalesce(is_transient,false);
  INSERT INTO incident_daily_budgets(day) VALUES(budget_day) ON CONFLICT DO NOTHING;
  UPDATE incident_daily_budgets
    SET sentry=sentry+1,
        sentry_transient=sentry_transient+CASE WHEN is_transient THEN 1 ELSE 0 END,
        sentry_samples=CASE WHEN is_transient THEN
          jsonb_set(sentry_samples,ARRAY[p_incident_id::text],
            to_jsonb(coalesce((sentry_samples->>p_incident_id::text)::integer,0)+1))
          ELSE sentry_samples END
    WHERE day=budget_day AND sentry<100
      AND (NOT is_transient OR (sentry_transient<20
        AND coalesce((sentry_samples->>p_incident_id::text)::integer,0)<3))
    RETURNING true INTO allowed;
  RETURN coalesce(allowed,false);
END $$;

REVOKE ALL ON FUNCTION public.incident_reserve_sentry(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.incident_reserve_sentry(uuid) TO service_role;
COMMIT;
