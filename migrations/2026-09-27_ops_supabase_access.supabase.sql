-- Supabase-only follow-up. Apply after every 2026-09-26_ops_*.sql migration.
-- The API's server-only service role requires table grants in addition to
-- BYPASSRLS. Supabase installs pgcrypto in `extensions`, while local PostgreSQL
-- test clusters usually install it in `public`.
DO $$
DECLARE
  v_pgcrypto_schema text;
  v_row record;
BEGIN
  SELECT n.nspname INTO v_pgcrypto_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';
  IF v_pgcrypto_schema IS NULL THEN
    RAISE EXCEPTION 'pgcrypto is required for OS command hashing';
  END IF;

  EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role', v_pgcrypto_schema);
  FOR v_row IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND left(tablename, 4) = 'ops_'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
      v_row.tablename
    );
  END LOOP;
  FOR v_row IN
    SELECT sequencename FROM pg_sequences
    WHERE schemaname = 'public' AND left(sequencename, 4) = 'ops_'
  LOOP
    EXECUTE format(
      'GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.%I TO service_role',
      v_row.sequencename
    );
  END LOOP;
  FOR v_row IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND left(p.proname, 4) = 'ops_' AND p.prokind = 'f'
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, %I, pg_temp',
      v_row.proname, v_row.arguments, v_pgcrypto_schema
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
      v_row.proname, v_row.arguments
    );
  END LOOP;
END $$;
