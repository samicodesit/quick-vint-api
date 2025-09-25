-- Add custom limits for specific users
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_daily_limit INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_limit_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_limit_expires_at TIMESTAMP WITH TIME ZONE;

-- Give Bachir a custom limit
UPDATE profiles 
SET 
  custom_daily_limit = 30,  -- Between Starter (15) and Pro (40)
  custom_limit_reason = 'Grandfathered user from unlimited plan - temporary accommodation',
  custom_limit_expires_at = '2025-10-16 23:59:59+00'  -- His subscription renewal date
WHERE email = 'bachir.bilal@email.com';  -- Use his actual email