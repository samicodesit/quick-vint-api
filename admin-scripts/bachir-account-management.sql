-- Quick Admin Actions for Bachir's Account
-- Run these in your Supabase SQL Editor

-- 1. First, find Bachir's user ID
SELECT id, email, subscription_tier, subscription_status, api_calls_this_month 
FROM profiles 
WHERE email ILIKE '%bachir%' OR email ILIKE '%bilal%';

-- 2a. OPTION 1: Give him Pro access (40/day) until his renewal (RECOMMENDED)
UPDATE profiles 
SET subscription_tier = 'pro' 
WHERE email = 'bachir.bilal@gmail.com';  -- Replace with his actual email

-- 2b. OPTION 2: Give him custom limit (30/day) with expiration
UPDATE profiles 
SET 
  custom_daily_limit = 30,
  custom_limit_reason = 'Grandfathered from unlimited plan - temporary accommodation until renewal',
  custom_limit_expires_at = '2025-10-16 23:59:59+00'
WHERE email = 'bachir.bilal@gmail.com';  -- Replace with his actual email

-- 3. Check his recent usage patterns (run after you have the user_id)
SELECT 
  DATE(created_at) as date,
  COUNT(*) as requests_made,
  COUNT(CASE WHEN suspicious_activity = true THEN 1 END) as suspicious_requests
FROM api_logs 
WHERE user_id = 'BACHIR_USER_ID'  -- Replace with his actual user ID
  AND created_at >= NOW() - INTERVAL '14 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 4. Review his actual prompts for legitimacy (run after you have the user_id)
SELECT 
  created_at,
  raw_prompt,
  generated_title,
  suspicious_activity,
  flagged_reason
FROM api_logs 
WHERE user_id = 'BACHIR_USER_ID'  -- Replace with his actual user ID
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 20;

-- 5. If you want to remove the custom limit later
UPDATE profiles 
SET 
  custom_daily_limit = NULL,
  custom_limit_reason = NULL,
  custom_limit_expires_at = NULL
WHERE email = 'bachir.bilal@gmail.com';