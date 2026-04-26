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

| Feature          | Free | Starter | Pro | Business |
| ---------------- | ---- | ------- | --- | -------- |
| Basic generation | ✓    | ✓       | ✓   | ✓        |
| Tone selection   | ✗    | ✗       | ✓   | ✓        |
| Emoji toggle     | ✗    | ✗       | ✓   | ✓        |
| Daily limit      | 2    | 15      | 40  | 75       |

**Important:** All feature gating must be enforced server-side. Pro/Business tiers only: emojis and tone customization.

## Known Non-Issues (Do Not Suggest)

These have been reviewed and intentionally kept as-is:

- **Pricing page duplication** (`src/pages/pricing.astro` vs `src/pages/[lang]/pricing.astro`): EN page is intentionally hardcoded, localized pages use the copy system. Do not suggest extracting a shared Pricing component.
- **LanguageSwitcher ARIA keyboard nav**: The switcher uses `role="menu"` / `role="menuitem"` with click-based interaction. Full arrow-key nav / active-descendant management is not required and would add disproportionate complexity for an 8-item language list.
- **Flag CDN (flagcdn.com)**: Third-party CDN is intentional. `referrerpolicy="no-referrer"` and `loading="lazy"` are already applied.
