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

| Feature          | Free         | Starter | Pro | Business |
| ---------------- | ------------ | ------- | --- | -------- |
| Basic generation | ✓            | ✓       | ✓   | ✓        |
| Tone selection   | ✗            | ✗       | ✓   | ✓        |
| Emoji toggle     | ✗            | ✗       | ✓   | ✓        |
| Daily limit      | —            | 5       | 15  | 50       |
| Monthly limit    | —            | 75      | 300 | 1000     |
| Lifetime limit   | 4 (one-time) | —       | —   | —        |

**Important:** All feature gating must be enforced server-side. Pro/Business tiers only: emojis and tone customization.
