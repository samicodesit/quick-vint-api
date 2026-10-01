-- Preserve unfamiliar campaign sources without storing full URLs or free text.
BEGIN;
ALTER TABLE public.user_attributions
  DROP CONSTRAINT user_attributions_source_check;
ALTER TABLE public.user_attributions
  ADD CONSTRAINT user_attributions_source_check
  CHECK (source ~ '^[a-z0-9][a-z0-9._-]{0,79}$');
COMMIT;
