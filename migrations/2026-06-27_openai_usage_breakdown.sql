ALTER TABLE api_logs
  ADD COLUMN IF NOT EXISTS openai_prompt_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS openai_completion_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS openai_cached_tokens INTEGER;
