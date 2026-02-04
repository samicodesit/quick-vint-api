# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoLister AI is a Next.js 15 web application that generates AI-powered titles and descriptions for Vinted marketplace listings using OpenAI GPT-4o-mini. It includes Stripe subscriptions, magic link authentication via Supabase, and a multi-tier rate limiting system.

**Package Manager**: pnpm only (enforced via `.npmrc` and `package.json` engines)

## Common Commands

```bash
# Development
pnpm dev              # Next.js dev server (API + frontend)
pnpm run dev:i18n     # i18n watch mode + static server (recommended for frontend)
pnpm run dev:public   # Static files only via Python server on :8000

# Build
pnpm run build        # Next.js production build
pnpm run build:i18n   # Generate all language versions (SSG for static files)

# Quality Checks
pnpm run lint         # ESLint
pnpm run type-check   # TypeScript check (tsc --noEmit)
pnpm run build:locales # Validate translation files have matching keys
```

## High-Level Architecture

### Framework & Structure

- **Framework**: Next.js 15.1.6 with React 19, using App Router (`app/` directory)
- **Language**: TypeScript 5.8.3 with strict mode
- **Deployment**: Vercel serverless functions
- **Database**: Supabase (PostgreSQL) with service role key access (bypasses RLS)

### Directory Structure

```
app/                          # Next.js App Router
├── [locale]/                 # i18n routes (en, fr, de) via next-intl
│   ├── page.tsx              # Homepage
│   ├── pricing/              # Pricing page
│   └── ...                   # Other pages
├── api/                      # API routes
│   ├── generate/             # Main AI generation endpoint (OpenAI)
│   ├── auth/                 # Magic link authentication
│   ├── stripe/               # Checkout, portal, webhook
│   └── admin/                # Admin endpoints
├── layout.tsx                # Root layout
└── globals.css               # Global styles

components/                   # React components (Footer, Navigation, etc.)
i18n/                         # next-intl configuration
├── config.ts                 # Locale definitions (en, fr, de)
├── request.ts
└── routing.ts

messages/                     # Translation files for next-intl
├── en.json
├── fr.json
└── de.json

utils/                        # Utility modules
├── tierConfig.ts             # Subscription tier definitions
├── rateLimiter.ts            # Multi-tier rate limiting system
├── apiLogger.ts              # Request logging & suspicious activity detection
├── supabaseClient.ts         # Supabase service role client
├── disposableDomains.ts      # 5000+ blocked email domains
└── vintedCountryDetector.js  # Vinted domain detection

middleware.ts                 # Next-intl middleware for locale routing
```

### Internationalization (Dual System)

**App Router (next-intl)**: Used for Next.js pages in `app/[locale]/`
- Config in `i18n/config.ts` (locales: en, fr, de)
- Translations in `messages/{en,fr,de}.json`
- Middleware handles routing with `localePrefix: 'as-needed'` (`/` for en, `/fr/` for fr)

### Authentication Flow

- **Method**: Supabase magic links (passwordless)
- **Token**: JWT passed in `Authorization: Bearer <token>` header
- **Validation**: `supabase.auth.getUser(token)` in API routes
- **Disposable email blocking**: Hardcoded list in `utils/disposableDomains.ts`

### Rate Limiting System (`utils/rateLimiter.ts`)

Multi-tier system enforced before API calls:

1. **Emergency brake**: Database-driven system shutdown via `system_settings` table
2. **Global budget**: $100/day max across all users (tracked in `daily_stats` table)
3. **Tier limits**: Per-user burst (per-minute), daily, monthly limits from `tierConfig.ts`

```typescript
// Tier structure (utils/tierConfig.ts)
free:     { daily: 2,   monthly: 10,  burst: { perMinute: 3 } }
starter:  { daily: 15,  monthly: 300, burst: { perMinute: 10 } }
pro:      { daily: 40,  monthly: 800, burst: { perMinute: 20 } }
business: { daily: null, monthly: 1500, burst: { perMinute: 30 } } // No daily limit
```

**Storage**: Rate limits tracked in Supabase `rate_limits` table with UTC-aligned expiry times.

### Database Schema (Supabase)

**profiles table**:
```sql
id, email, subscription_tier, subscription_status
stripe_customer_id, stripe_subscription_id
api_calls_this_month, last_api_call_reset
current_period_end, blocked, role, account_status
custom_daily_limit, custom_limit_expires_at
```

**rate_limits table**: Time-based usage tracking with `key`, `user_id`, `count`, `window_type`, `expires_at`

**api_logs table**: Comprehensive logging with suspicious activity flagging

**daily_stats table**: Global usage for budget tracking

### API Patterns

**CORS** (critical for Chrome extension):
- Dynamic origin checking against `VERCEL_APP_ALLOWED_ORIGINS` env var
- Regex pattern for all Vinted country domains: `/^https:\/\/(?:[\w-]+\.)?vinted\.(?:[a-z]{2,}|co\.[a-z]{2})$/`

**Standard endpoint structure** (`app/api/generate/route.ts`):
1. CORS check
2. Auth token validation
3. Profile fetch & tier determination
4. Rate limiting (`RateLimiter.checkRateLimit()`)
5. Business logic (OpenAI call, etc.)
6. Logging via `ApiLogger.logRequest()`
7. Record usage via `RateLimiter.recordSuccessfulRequest()`

### Stripe Integration

- **Checkout**: `/api/stripe/create-checkout` - Creates session, redirects to Stripe
- **Portal**: `/api/stripe/create-portal` - Customer self-service
- **Webhook**: `/api/stripe/webhook` - Updates `profiles` table on subscription events
- **Tier mapping**: `getTierByStripePriceId()` in `utils/tierConfig.ts`

### Request Logging (`utils/apiLogger.ts`)

Every request logged to `api_logs` with:
- User info, endpoint, request body, timing
- OpenAI token usage, generated content
- **Auto-flagging**: Non-Vinted URLs, suspicious keywords, bot patterns

### Cron Jobs (vercel.json)

Configured in `vercel.json` but files are deleted (not in use):
- `/api/cron/reset-counts` - Daily at 5am UTC
- `/api/cron/daily-cleanup` - Daily at 4am UTC
- **Security**: Require `Authorization: Bearer ${CRON_SECRET}`

## Environment Variables

All required env vars (must be prefixed with `VERCEL_APP_` for some):

```bash
# Supabase
VERCEL_APP_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY        # Admin key, never expose to frontend
NEXT_PUBLIC_SUPABASE_URL         # Public for client
NEXT_PUBLIC_SUPABASE_ANON_KEY    # Public for client

# OpenAI
VERCEL_APP_OPENAI_API_KEY

# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET            # For signature verification

# CORS / Security
VERCEL_APP_ALLOWED_ORIGINS       # Comma-separated origins
ADMIN_SECRET                     # Admin API auth
CRON_SECRET                      # Cron endpoint security

# App
NEXT_PUBLIC_APP_URL              # Public app URL
```

## Critical Patterns

1. **Service Role Key**: All Supabase operations use service role (bypasses RLS). Never expose to frontend.

2. **Rate Limit Time Alignment**: All rate limit expiry uses UTC-aligned timestamps to ensure predictable resets.

3. **Generic Error Messages**: Never leak specific rate limit details or internal errors to clients.

4. **Logging Before Return**: Always log request data before returning error responses.

5. **Path Aliases**: Use `@/` prefix for imports (configured in `tsconfig.json`):
   - `@/utils/*`, `@/components/*`, `@/messages/*`, `@/i18n/*`
