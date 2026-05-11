# Copilot Instructions — quick-vint-api (Backend API)

## Cross-Repo Awareness

This backend API (`quick-vint-api`) serves the Chrome extension (`quick-vint`). **When making changes, always cross-check the other repo** to ensure consistency:

- **API request/response shapes** (e.g., `/api/generate` body fields) must stay in sync with what the extension sends from `content.js`.
- **Tier features** (emojis, tone, limits) are enforced here server-side. Never trust client-sent feature flags without validating the user's `subscription_tier`.
- **Tier config** lives in `utils/tierConfig.ts`. The extension popup mirrors tier info for UI purposes only.
- **Auth tokens** are Supabase JWTs sent as `Authorization: Bearer <token>`. Validate with Supabase `getUser()`.

## Project Context

- Astro-based API deployed on Vercel (serverless functions)
- API routes in `api/` directory (Vercel serverless convention)
- Uses Supabase for auth, profiles, and rate limiting
- Uses OpenAI for content generation
- Build: `pnpm build` / Deployed via Vercel
- Lint: `eslint` configured

## Subscription Tiers

Current pricing follows the credit-based pricing overhaul in `.claude/skills/pricing-overhaul/SKILL.md`:

| Feature          | Free Evaluation | Closet Clear Pack | Starter   | Plus      | Pro       | Business  |
| ---------------- | --------------- | ----------------- | --------- | --------- | --------- | --------- |
| Credits          | 13 total ever   | 15 perpetual      | 80/mo     | 200/mo    | 400/mo    | 1,000/mo  |
| Phone Upload     | 5/month         | All 15 credits    | Unlimited | Unlimited | Unlimited | Unlimited |
| Tone selection   | ✗               | ✗                 | ✗         | ✗         | ✓         | ✓         |
| Emoji toggle     | ✗               | ✗                 | ✗         | ✗         | ✓         | ✓         |
| Multi-lang batch | ✗               | ✗                 | ✗         | ✗         | ✓         | ✓         |
| Preferences      | ✗               | ✗                 | ✗         | ✓         | ✓         | ✓         |
| Smart Re-Gen     | ✗               | ✗                 | ✗         | ✓         | ✓         | ✓         |

**Important:** All feature gating must be enforced server-side. Pro/Business tiers only: emojis, tone customization, multi-language batch generation, and detailed listing tips. Plus and above only: listing preferences and Smart Re-Gen. Legacy users keep their old plan limits/features until they voluntarily switch to the new pricing.

## Pricing Overhaul Review Notes

Avoid repeating these false-positive review comments:

- **No daily limits for new plans**: New pricing uses credits and rollover, not daily/monthly count limits. `max_limits` being nullable for new tiers is intentional.
- **Closet Clear Pack is not a subscription tier**: It is a one-time, 15-credit purchase with permanent credits. Pack credits are consumed after expiring subscription credits.
- **Free credits do not reset forever**: Free evaluation is 5 signup credits plus 2 credits/week for 4 weeks, 13 total ever per account.
- **Plus does not include tone/emoji/multi-lang**: Those are intentionally Pro/Business gates. Plus starts Listing Preferences and Smart Re-Gen only.
- **Legacy users are intentionally preserved**: Existing legacy subscribers keep old limits and pricing unless they opt into the new model; do not suggest remapping them automatically.
- **Pricing page duplication remains intentional**: EN pricing is hardcoded while localized pricing uses copy keys.

## Known Non-Issues (Do Not Suggest)

These have been reviewed and intentionally kept as-is:

- **Pricing page duplication** (`src/pages/pricing.astro` vs `src/pages/[lang]/pricing.astro`): EN page is intentionally hardcoded, localized pages use the copy system. Do not suggest extracting a shared Pricing component.
- **LanguageSwitcher ARIA keyboard nav**: The switcher uses `role="menu"` / `role="menuitem"` with click-based interaction. Full arrow-key nav / active-descendant management is not required and would add disproportionate complexity for an 8-item language list.
- **Flag CDN (flagcdn.com)**: Third-party CDN is intentional. `referrerpolicy="no-referrer"` and `loading="lazy"` are already applied.
