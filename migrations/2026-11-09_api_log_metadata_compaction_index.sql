-- Speed up existing six-hour cleanup selectors without changing eligibility.
-- Keep the predicate independent of parameterized endpoint filters.
CREATE INDEX CONCURRENTLY IF NOT EXISTS api_logs_compaction_metadata_candidates
  ON public.api_logs (created_at, id)
  WHERE user_agent IS NOT NULL OR origin IS NOT NULL
     OR ip_address IS NOT NULL OR user_email IS NOT NULL;
