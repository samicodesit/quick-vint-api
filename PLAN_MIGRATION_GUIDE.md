# Plan Limit Migration Guide

## What Changed

| Tier              | Old Daily | New Daily | Old Monthly | New Monthly |
| ----------------- | --------- | --------- | ----------- | ----------- |
| Free              | 2         | **none**  | 8           | **4 (lifetime)** |
| Starter (€3.99)   | 15        | **5**     | 300         | **75**      |
| Pro (€9.99)       | 40        | **15**    | 800         | **300**     |
| Business (€19.99) | 75        | **50**    | 1500        | **1000**    |

Free tier now has **no daily cap** and a **4-use lifetime trial** (tracked via `api_calls_this_month`, which is never reset for non-active subscribers). Paid tier daily limits decreased.

## How Limits Work (Important to Understand)

Limits are **NOT stored in the database per user**. Here's the flow:

1. User makes a request to `/api/generate`
2. Backend looks at user's `subscription_tier` field in the `profiles` table (e.g., `"starter"`)
3. Backend looks up that tier's limits in `utils/tierConfig.ts`
4. Backend checks usage counts: **minute/daily** from the `rate_limits` table, **monthly** from `profiles.api_calls_this_month`
5. If usage < limit → allowed. If usage >= limit → blocked.

This means: **the moment you deploy the new `tierConfig.ts`, ALL users get the new limits immediately**. No database migration needed. No per-user changes.

## Deployment Steps

### Step 1: Deploy the backend first

```bash
cd quick-vint-api
pnpm build          # verify it compiles
git add -A
git commit -m "Revise tier limits based on real usage patterns"
git push             # triggers Vercel auto-deploy
```

Once deployed, ALL users (free and paid) immediately operate under the new limits. The `rate_limits` table doesn't need any changes — it only stores usage counts, not the limits themselves.

### Step 2: Update the extension

```bash
cd quick-vint
npm run build        # rebuilds content.min.js
```

Then:

1. Go to `chrome://extensions`
2. Click the refresh icon on AutoLister AI
3. The popup will now show the new limits

For the published Chrome Web Store version: submit a new version through the Chrome Developer Dashboard. The extension now fetches limits from `/api/tier-config` on load, so even old extension versions will display correct limits after the API is deployed.

### Step 3: Nothing else

- **Stripe**: No changes needed. Stripe handles billing (€3.99/€9.99/€19.99), not limits. Prices haven't changed.
- **Supabase**: No schema changes needed. The `profiles` table stores `subscription_tier` (a string), and limits come from `tierConfig.ts`.
- **Rate limits table**: No changes needed. It stores usage counts with expiry timestamps. Daily counters reset at midnight UTC; monthly usage for active subscribers resets on a rolling 30-day basis using `last_api_call_reset`. Free users' `api_calls_this_month` is never reset (lifetime trial).

## What Happens to Existing Users

### Free users

- **Daily cap removed; Free becomes a 4-use lifetime trial.** Usage is tracked via `api_calls_this_month`, which is never reset for non-active (non-paying) users.
- This is intentional — free users get just enough to try the product, then must upgrade.

### Starter subscribers (€3.99/month)

- Daily drops 15 → 5, monthly drops 300 → 75.
- **In practice:** Most casual sellers use 2-4/day. Very few hit even 5/day. The monthly drop from 300 to 75 is more noticeable, but 75 = ~2.5/day average, which covers most casual patterns.
- **Risk**: If a Starter user was consistently listing 6-15 items/day, they'll hit the new daily cap. This is intentional — it pushes them toward Pro.

### Pro subscribers (€9.99/month)

- Daily drops 40 → 15, monthly drops 800 → 300.
- **In practice**: Very few Vinted sellers list 15+ items in a single day. 300/month = 10/day average, plenty for active sellers.
- **Risk**: Low. An active seller doing 10/day would use ~300/month, exactly at the cap. But most active sellers are more like 5-7/day.

### Business subscribers (€19.99/month)

- Daily drops 75 → 50, monthly drops 1500 → 1000.
- **In practice**: 50/day is still massive. Even power resellers rarely list 50 items in a single day on Vinted.
- **Risk**: Minimal.

## Should You Email Existing Subscribers?

**Short answer: Only if you have users consistently hitting the old higher limits.**

Check first (run this in Supabase SQL editor):

```sql
-- Find users who used more than the NEW limits in the past 30 days
-- This tells you who will actually be affected

-- Users who exceeded new daily limits recently
SELECT
  p.email,
  p.subscription_tier,
  rl.count as usage_count,
  rl.window_type,
  rl.created_at
FROM rate_limits rl
JOIN auth.users u ON rl.user_id = u.id
JOIN profiles p ON p.id = u.id
WHERE rl.window_type = 'day'
  AND rl.created_at > NOW() - INTERVAL '30 days'
  AND (
    (p.subscription_tier = 'starter' AND rl.count > 5) OR
    (p.subscription_tier = 'pro' AND rl.count > 15) OR
    (p.subscription_tier = 'business' AND rl.count > 50)
  )
ORDER BY rl.count DESC;
```

- **If 0 results**: Nobody will notice. Just deploy, no email needed.
- **If a few results**: Consider sending those specific users a heads-up email (see template below).
- **If many results**: You might want to grandfather those users (see grandfathering section).

### Email Template (if needed)

> Subject: Your AutoLister AI plan – updated limits
>
> Hi,
>
> We've refined our plan limits to better reflect typical Vinted selling patterns. Your [Starter/Pro/Business] plan now includes:
>
> - **[X] listings per day**
> - **[Y] listings per month**
>
> These limits are designed to comfortably cover regular selling activity. If you find you need more capacity, you can easily upgrade through the extension.
>
> Thanks for being an AutoLister AI subscriber!

### Grandfathering (Optional, NOT recommended for your stage)

If you really want to let existing subscribers keep their old limits until their subscription renews:

1. Add columns to `profiles`:

```sql
ALTER TABLE profiles ADD COLUMN custom_daily_limit INTEGER DEFAULT NULL;
```

2. Set old limits for current subscribers:

```sql
UPDATE profiles SET custom_daily_limit = 15
WHERE subscription_tier = 'starter' AND subscription_status = 'active';

UPDATE profiles SET custom_daily_limit = 40
WHERE subscription_tier = 'pro' AND subscription_status = 'active';

UPDATE profiles SET custom_daily_limit = 75
WHERE subscription_tier = 'business' AND subscription_status = 'active';
```

> **Note:** Only `custom_daily_limit` is currently supported by the rate limiter. Monthly limits are tracked via `profiles.api_calls_this_month` and compared against `tierConfig.ts` — there is no `custom_monthly_limit` override path in the current code. If monthly grandfathering is needed, that would require additional code changes in `rateLimiter.ts`.

3. Modify `RateLimiter.checkRateLimit()` in `rateLimiter.ts` to check `custom_daily_limit` / `custom_limit_expires_at` first, falling back to `tierConfig.ts` (this is already implemented).

4. Add a Stripe webhook handler for `invoice.paid` that clears the custom limits (sets them back to NULL) when the subscription renews.

**Why this is NOT recommended:** It adds complexity for a problem that likely affects very few users. You're early-stage — optimize for speed, not edge cases. If someone complains, offer them a free upgrade to the next tier for a month.

## Quick Reference: New Limits

| Tier     | Daily | Monthly | Burst/min | Cost @ max | Revenue | Margin |
| -------- | ----- | ------- | --------- | ---------- | ------- | ------ |
| Free     | 3     | 5       | 3         | $0.10      | €0      | -$0.10 |
| Starter  | 5     | 75      | 5         | $1.50      | €3.99   | ~€2.49 |
| Pro      | 15    | 300     | 10        | $6.00      | €9.99   | ~€3.99 |
| Business | 50    | 1000    | 20        | $20.00     | €19.99  | ~€0    |

Note: "Cost @ max" assumes every user maxes out their monthly limit, which doesn't happen. Real margins are much better. Cost per request ≈ $0.02 (GPT-4o-mini with images).
