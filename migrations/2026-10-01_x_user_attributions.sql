-- Apply before deploying X attribution support. Existing rows remain intact.
BEGIN;

ALTER TABLE public.user_attributions
  DROP CONSTRAINT user_attributions_source_check;

ALTER TABLE public.user_attributions
  ADD CONSTRAINT user_attributions_source_check CHECK (
    source IN (
      'x', 'tiktok', 'instagram', 'youtube', 'facebook', 'linkedin',
      'reddit', 'google', 'direct', 'unknown'
    )
  );

COMMIT;
