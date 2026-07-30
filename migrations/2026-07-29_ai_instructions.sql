-- Store one admin-reviewed AI behavior instruction per account.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_instructions text
  CHECK (ai_instructions IS NULL OR char_length(ai_instructions) <= 1000);

COMMENT ON COLUMN profiles.ai_instructions IS
  'Optional admin-reviewed behavior instructions applied to future listing generations.';
