# API Logging System Setup

This logging system helps you monitor and track all incoming API requests to detect suspicious activity. Here's what has been implemented:

## 🎯 What This System Does

### 1. **Comprehensive Request Logging**
- Logs every API call to your `/api/generate` endpoint
- Captures user information, request details, and response data
- Records the exact prompts being sent to OpenAI
- Tracks image URLs, processing time, and token usage

### 2. **Automatic Suspicious Activity Detection**
- Detects non-Vinted related image URLs
- Flags requests with suspicious keywords (adult content, illegal activities, etc.)
- Identifies potential bot traffic
- Monitors high-frequency usage patterns

### 3. **Admin Dashboard**
- View all requests in real-time
- Filter by suspicious activity, user, date range
- Flag/unflag activities manually
- Block users directly from the dashboard

## 📋 Files Created

### Database
- `migrations/create_api_logs_table.sql` - Database schema for logging

### Backend Code
- `utils/apiLogger.ts` - Logging utility with suspicious activity detection
- `api/admin/view-logs.ts` - API endpoint to view logs (admin only)
- `api/admin/flag-activity.ts` - API endpoint to flag suspicious activity
- Updated `api/generate.ts` - Added comprehensive logging to your main API

### Frontend
- `public/api-logs.html` - Admin dashboard to view and manage logs

## 🚀 Setup Instructions

### 1. **Database Setup**
Run the SQL migration to create the logs table:
```sql
-- Run this in your Supabase SQL editor
-- The file is in: migrations/create_api_logs_table.sql
```

### 2. **Update Your Database Schema**
Make sure your `profiles` table has these columns (if not already present):
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_status VARCHAR(50) DEFAULT 'active';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blocked_by UUID;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE;
```

### 3. **Make Yourself Admin**
```sql
UPDATE profiles SET role = 'admin' WHERE id = 'YOUR_USER_ID';
```

### 4. **Access the Dashboard**
1. Go to `https://your-domain.com/api-logs.html`
2. Use your admin JWT token to authenticate
3. Start monitoring your API requests!

## 🔍 What You Can Monitor

### Request Details
- **User Information**: Email, subscription tier, API usage count
- **Request Metadata**: IP address, user agent, origin domain
- **Content Analysis**: Image URLs and exact prompts sent to OpenAI
- **Response Data**: Generated titles/descriptions, processing time
- **Performance**: Token usage, response status codes

### Suspicious Activity Indicators
- 🚨 **Non-Vinted URLs**: Images not from Vinted domains
- 🚨 **Inappropriate Content**: Adult, violent, or illegal keywords
- 🚨 **Bot Traffic**: Automated requests or suspicious user agents
- 🚨 **High Frequency**: Users making too many requests

### Admin Actions
- **Flag Requests**: Mark suspicious activity for review
- **Block Users**: Immediately prevent user access
- **Review History**: See all flagged activities and admin actions

## 📊 Dashboard Features

### Summary Cards
- Total requests across all time
- Count of suspicious activities
- Error rate monitoring
- Today's usage statistics

### Filtering Options
- **Suspicious Only**: View only flagged requests
- **User ID**: Filter by specific user
- **Date Range**: View requests from specific time periods

### Real-time Data
- Auto-refreshing request logs
- Immediate flagging/unflagging
- Live user blocking capabilities

## 🛡️ Security Features

### Automatic Detection
The system automatically flags requests containing:
- Adult/explicit content keywords
- Illegal activity references
- Non-Vinted image domains
- Bot-like behavior patterns

### Manual Review
- Admins can review and override automatic flags
- Detailed reason tracking for all administrative actions
- Full audit trail of who flagged what and when

### User Protection
- Row Level Security (RLS) enabled
- Users can only see their own logs (if given permission)
- Admins have full access to all logs

## 🔧 How to Use

### Daily Monitoring
1. Check the dashboard daily for suspicious activity
2. Review high-frequency users
3. Investigate any flagged requests

### Investigation Workflow
1. **Identify**: Suspicious requests are highlighted in red
2. **Review**: Click on entries to see full prompt details
3. **Action**: Flag, unflag, or block users as needed
4. **Document**: All actions are logged with reasons

### Response to Suspicious Activity
1. **Minor Issues**: Flag for monitoring
2. **Policy Violations**: Block user access
3. **Serious Abuse**: Consider additional security measures

## 📝 Example Suspicious Patterns to Watch For

### Content Abuse
```
- Prompts asking for adult content generation
- Requests to create fake/fraudulent listings
- Attempts to generate content for non-clothing items
```

### Technical Abuse
```
- Rapid-fire requests (rate limiting bypass attempts)
- Requests from unusual geographic locations
- Bot-like user agent strings
```

### Business Abuse
```
- Users generating content for competitors
- Bulk content generation for commercial use outside ToS
- API usage patterns that suggest reselling access
```

## 🔄 Regular Maintenance

### Weekly Tasks
- Review suspicious activity trends
- Check for new attack patterns
- Update detection rules if needed

### Monthly Tasks
- Analyze user behavior patterns
- Review blocked users for potential appeals
- Export logs for longer-term analysis

## ⚡ Quick Start

1. Run the database migration
2. Set yourself as admin in the profiles table
3. Deploy the updated code
4. Visit `/api-logs.html` and start monitoring!

The system is now actively logging every request and will help you identify exactly what your users are doing with your GPT API. Any suspicious activity will be automatically flagged for your review.