-- Accelerate the existing oldest-first body selector without changing its
-- eligibility, retention cutoffs, or protected endpoint exclusions.
-- Apply outside a transaction to avoid blocking ordinary writes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS api_logs_compaction_body_candidates
  ON public.api_logs (created_at, id)
  WHERE full_request_body IS NOT NULL;
