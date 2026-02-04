# Quick-Vint API - AI Agent Instructions

## Project Overview

Vercel serverless API for a Vinted listing generator Chrome extension. Provides AI-powered title/description generation via OpenAI GPT-4o-mini, with Stripe subscriptions, magic link authentication, and comprehensive rate limiting.

## Architecture & Data Flow

**Core Flow**: Extension → `/api/generate` → OpenAI GPT-4o-mini → Vinted-optimized listings

- **Auth**: Supabase magic links (no passwords) → JWT tokens in headers (`Authorization: Bearer <token>`)
- **Rate Limiting**: Multi-tier system (free/starter/pro/business) enforced in [utils/rateLimiter.ts](utils/rateLimiter.ts)
- **Billing**: Stripe subscriptions via webhooks → updates `profiles` table → tier limits applied
- **Security**: CORS restricted to extension origins + Vinted domains, disposable email blocking, request logging

**Critical Database Schema** (Supabase `profiles` table):

```
id, email, subscription_tier, subscription_status, stripe_customer_id,
stripe_subscription_id, api_calls_this_month, last_api_call_reset,
current_period_end, blocked
```

## Key Patterns & Conventions

### 1. Environment Variables (ALL prefixed!)

```typescript
VERCEL_APP_SUPABASE_URL; // Supabase project URL
SUPABASE_SERVICE_ROLE_KEY; // Admin key for server operations
VERCEL_APP_OPENAI_API_KEY; // OpenAI API key
STRIPE_SECRET_KEY; // Stripe API key
STRIPE_WEBHOOK_SECRET; // Webhook signature verification
VERCEL_APP_ALLOWED_ORIGINS; // Comma-separated CORS origins
CRON_SECRET; // Secures cron endpoints
```

### 2. CORS Configuration (critical for extension!)

- **Pattern**: Dynamic origin checking in each endpoint ([api/generate.ts](api/generate.ts#L14-L29))
- **Extension origins**: Must be in `VERCEL_APP_ALLOWED_ORIGINS`
- **Vinted pages**: Regex pattern `/^https:\/\/(?:[\w-]+\.)?vinted\.(?:[a-z]{2,}|co\.[a-z]{2})$/` allows all Vinted country domains

### 3. Rate Limiting System ([utils/rateLimiter.ts](utils/rateLimiter.ts))

- **Global protection**: Daily budget cap ($100 default) prevents runaway costs
- **Per-user limits**: Burst (per-minute), daily, monthly from [utils/tierConfig.ts](utils/tierConfig.ts)
- **Database-driven**: `rate_limits` table tracks usage with automatic expiry
- **Never leak limits**: Generic error messages to prevent abuse reconnaissance

### 4. Request Logging ([utils/apiLogger.ts](utils/apiLogger.ts))

- **Every request logged**: `api_logs` table captures prompts, tokens, timing, suspicious activity
- **Auto-flagging**: Non-Vinted URLs, keyword detection, high-frequency patterns
- **Privacy**: Admin-only access via [api/admin/index.ts](api/admin/index.ts)

### 5. Stripe Integration

- **Webhook handler**: [api/stripe/webhook.ts](api/stripe/webhook.ts) updates subscriptions
- **Tier mapping**: `getTierByStripePriceId()` in [utils/tierConfig.ts](utils/tierConfig.ts) maps Stripe price IDs → tiers
- **Raw body required**: `bodyParser: false` config for signature verification

### 6. Cron Jobs (Vercel crons in [vercel.json](vercel.json))

- `reset-counts` (5am daily): Resets 30-day usage cycles
- `daily-cleanup` (4am daily): Maintenance tasks
- **Security**: All cron endpoints require `Authorization: Bearer ${CRON_SECRET}`

## Development Workflows

### Package Manager

**PNPM only** - Enforced via `.npmrc` and `package.json` engines field. Never use npm or yarn.

### Local Development

```bash
# Install dependencies (uses pnpm)
pnpm install

# Start dev servers
pnpm run dev          # Full Vercel dev server (API + static files)
pnpm run dev:i18n     # i18n watch mode + static server (RECOMMENDED for frontend)
pnpm run dev:public   # Static files only via Python HTTP server (port 8000)

# Build static files
pnpm run build:i18n   # Generate all language versions (required before deploy)

# Lint & type-check
pnpm run lint         # ESLint on api/ and utils/
pnpm run type-check   # TypeScript compilation check
pnpm run format       # Prettier formatting

# Localization
pnpm run build:locales  # Validate all translation files have matching keys
```

### Static Website (public/)

The marketing website uses **Static Site Generation (SSG)** with SEO-optimized multilingual support.

**Architecture**:

- **Source**: `public/templates/*.html` (edit these)
- **Translations**: `public/locales/{en,fr,de}.json`
- **Generated**: `public/index.html`, `public/fr/index.html`, `public/de/index.html`
- **URLs**: `/` (English), `/fr/` (French), `/de/` (German)

**Development Workflow**:

```bash
# Start watch mode (auto-rebuilds on changes)
pnpm run dev:i18n

# Edit template:
vim public/templates/index.html

# Or edit translation:
vim public/locales/fr.json

# Watch automatically rebuilds → refresh browser to see changes
# All language versions rebuild simultaneously
```

**Template Syntax** (Handlebars):

```html
<!-- Text translation -->
<h1>{{t 'home.heroTitle'}}</h1>

<!-- Language conditionals -->
{{#if isEn}}English content{{/if}} {{#if isFr}}Contenu français{{/if}}

<!-- Language-specific links -->
<a href="{{#if isEn}}pricing{{else}}{{lang}}/pricing{{/if}}">Pricing</a>

<!-- Metadata (auto-injected) -->
{{title}} → From meta.home.title {{description}} → From meta.home.description
{{{hreflangTags}}} → Auto-generated language alternates {{{ogTags}}} → Open
Graph meta tags
```

**SEO Features**:

- ✅ Language-specific URLs for Google indexing
- ✅ Hreflang tags on all pages
- ✅ Canonical URLs per language
- ✅ Translated meta tags (title, description, OG, Twitter)
- ✅ HTML lang attribute set correctly
- ✅ No duplication in source code (single template → multiple outputs)
- i18n engine: `public/js/i18n.js` (auto-detects language, updates DOM)
- HTML pattern: Use `data-i18n="key.path"` attributes for text content
- See [LOCALIZATION.md](LOCALIZATION.md) for complete guide
- Example implementation: [public/example-i18n.html](public/example-i18n.html)

**Testing translations**:

```bash
# Start dev server
pnpm run dev:public

# Open with language parameter
http://localhost:8000/?lang=fr
http://localhost:8000/?lang=de
```

### Testing Endpoints Locally

Use Vercel CLI: `vercel dev` (requires Vercel account + env vars configured)

### Common Tasks

**Adding a new API endpoint**:

1. Create `api/<name>.ts` with Vercel handler signature
2. Add CORS middleware if extension-facing
3. Implement auth check if not public
4. Update rate limiter if usage-counted
5. Add logging via `ApiLogger.logRequest()`

**Updating tier limits**:

- Modify [utils/tierConfig.ts](utils/tierConfig.ts) → redeploy (cached in memory)
- OR: Migrate to database-driven config (aspirational, not implemented)

**Debugging rate limit issues**:

1. Check `rate_limits` table for user's entries
2. Review `api_logs` for flagged requests
3. Verify tier config matches Stripe subscription

**Adding new language to website**:

1. Create `public/locales/{lang}.json` with all translation keys
2. Update `i18n.js` `supportedLanguages` array
3. Update `scripts/validate-locales.js` `LANGUAGES` array
4. Run `pnpm run build:locales` to validate
5. Add language button to switchers in HTML files

## Critical Gotchas

1. **Supabase Service Role Key**: Used everywhere, not user-level auth. Never expose to frontend.
2. **CORS must allow Vinted domains**: Extension runs in page context, needs `vintedOriginPattern`
3. **Disposable email check**: Hardcoded 5000+ domain list in [utils/disposableDomains.ts](utils/disposableDomains.ts)
4. **Stripe webhooks**: Must verify signature before trusting events
5. **Rate limits stored in UTC**: `expires_at` timestamps, cron runs in UTC

## External Dependencies

- **Supabase**: Auth, database (PostgreSQL), RLS policies not used (service key bypasses)
- **OpenAI**: GPT-4o-mini for generation (~$0.02/request estimated)
- **Stripe**: Subscriptions only, no one-time payments
- **Vercel**: Serverless functions, cron jobs, environment variables

## Testing & Validation

- No automated tests currently
- Manual testing via Chrome extension
- Monitor via Admin dashboard ([public/admin.html](public/admin.html))
- Check Vercel logs for function errors
- Review Supabase `api_logs` table for suspicious activity

## Migration Pattern

SQL files in [migrations/](migrations/) - run manually in Supabase SQL editor (no auto-migration framework)

Do not be creating always new md files. just update existing ones, UNLESS YOU REALLY NEED TO.
Do not start impelementation of plans while in plan mode -- stay in plan mode until asked to implement.
