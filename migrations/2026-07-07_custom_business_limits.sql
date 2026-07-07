-- Add monthly custom limits for custom Business setups.
-- Existing custom_daily_limit/custom_limit_expires_at columns are reused so
-- daily and monthly custom allowances expire together at the paid period end.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS custom_monthly_limit integer;

COMMENT ON COLUMN profiles.custom_monthly_limit IS
  'Optional active monthly generation limit override, paired with custom_limit_expires_at.';

