# Fair Usage Policy Implementation

This document outlines the comprehensive rate limiting and fair usage policy system implemented to prevent abuse and control costs.

## 🚨 Problem Solved

The previous system allowed unlimited API calls for paid subscribers, leading to:

- A user making 263 requests in 16 hours
- $4.89 in OpenAI costs (more than the $3.99 subscription price)
- No protection against rapid API abuse

## 🛡️ New Protection Mechanisms

### 1. Multi-Tier Rate Limiting

**Free Tier:**

- 2 requests per minute
- 10 requests per hour
- 20 requests per day
- 5 requests per month

**Unlimited Monthly:**

- 5 requests per minute
- 30 requests per hour
- 100 requests per day
- 1,000 requests per month (not truly unlimited anymore)

**Unlimited Annual:**

- 8 requests per minute
- 50 requests per hour
- 150 requests per day
- 1,500 requests per month

### 2. Global Cost Protection

- **Daily Budget Cap:** $50 maximum spend per day across all users
- **Cost Tracking:** Each request costs ~$0.02 (estimated GPT-4o with images)
- **Automatic Shutoff:** Service stops when budget is reached

### 3. Security & Privacy

**No Information Leakage:**

- Generic error messages that don't reveal rate limits
- No remaining request counts exposed to clients
- Admin endpoints secured with separate authentication
- Cron endpoints protected from unauthorized access

**Error Messages Returned to Clients:**

- `"Too many requests. Please try again later."` (instead of specific limits)
- `"Service temporarily unavailable. Please try again later."` (instead of maintenance details)
- `"Monthly usage limit reached. Please upgrade your plan or try again next month."` (no specific numbers)

### 3. Emergency Controls

**Emergency Brake:**

```bash
# Stop all API calls immediately
curl -X POST https://your-domain.com/api/admin/emergency-brake \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action": "enable", "reason": "High cost abuse detected"}'

# Resume service
curl -X POST https://your-domain.com/api/admin/emergency-brake \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action": "disable", "reason": "Issue resolved"}'
```

**Usage Monitoring:**

```bash
# Get real-time usage statistics
curl https://your-domain.com/api/admin/usage-stats \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET"
```

## 📊 Database Schema Requirements

You'll need to create these tables in Supabase:

```sql
-- Rate limiting storage
CREATE TABLE rate_limits (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  user_id UUID NOT NULL,
  count INTEGER DEFAULT 0,
  window_type TEXT NOT NULL, -- 'minute', 'hour', 'day'
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_rate_limits_key_user ON rate_limits(key, user_id);
CREATE INDEX idx_rate_limits_expires ON rate_limits(expires_at);

-- Daily cost tracking
CREATE TABLE daily_stats (
  id SERIAL PRIMARY KEY,
  date TEXT UNIQUE NOT NULL, -- 'YYYY-MM-DD'
  total_api_calls INTEGER DEFAULT 0,
  estimated_cost DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System controls
CREATE TABLE system_settings (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🔧 Environment Variables

Add these to your Vercel environment:

```bash
ADMIN_SECRET=your-super-secure-admin-secret-here
CRON_SECRET=your-cron-secret-here
```

## 📈 Monitoring

The system provides:

1. **Real-time Rate Limit Feedback:** API responses include remaining request counts
2. **Admin Dashboard Data:** Usage stats, top users, active limits
3. **Automated Cleanup:** Expired rate limit records are cleaned every 6 hours
4. **Cost Tracking:** Daily spend monitoring with automatic shutoff

## 🚀 Deployment

1. Deploy the updated code to Vercel
2. Create the database tables in Supabase
3. Set the environment variables
4. The cron jobs will run automatically:
   - `reset-counts`: Daily at 5 AM UTC (monthly resets)
   - `cleanup-rate-limits`: Every 6 hours (cleanup expired records)

## 🎯 Benefits

- **Cost Control:** Hard caps prevent runaway costs
- **Fair Usage:** Reasonable limits for all subscription tiers
- **Better UX:** Clear error messages with remaining quotas
- **Emergency Controls:** Immediate response capabilities
- **Monitoring:** Full visibility into usage patterns

## 📞 Response to Abuse

If a user is abusing the system:

1. **Automatic:** Rate limits will block them automatically
2. **Manual:** Use the emergency brake to stop all traffic
3. **Investigation:** Check usage stats to identify patterns
4. **Action:** Modify their subscription or ban if necessary

This system ensures your OpenAI costs stay predictable while maintaining good service for legitimate users.
