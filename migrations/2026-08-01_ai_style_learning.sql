ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_style_learning_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_style_suggestion text,
  ADD COLUMN IF NOT EXISTS ai_style_suggestion_reason text;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_ai_style_suggestion_length
  CHECK (ai_style_suggestion IS NULL OR char_length(ai_style_suggestion) <= 1000);
