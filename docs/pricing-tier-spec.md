# Pricing Tier Spec

Last reviewed: 2026-07-03

This is the source-of-truth checklist for the public pricing page and product tier behavior. Keep this file updated whenever limits, plan features, or pricing-page copy change.

## Public Pricing Display

The pricing page reads limits from `src/utils/pricingDisplay.ts`.

By default, `PUBLIC_PRICING_DISPLAY_MODE` is `legacy`, which shows compatibility limits while the extension rollout continues:

| Tier | Public price | Public limit display |
| --- | ---: | --- |
| Free Trial | EUR 0 | 2 listings/day, 8 listings/month |
| Starter | EUR 3.99/month | 15 listings/day, 300 listings/month |
| Pro | EUR 9.99/month | 40 listings/day, 800 listings/month |
| Business | EUR 19.99/month | No daily limit, 1,500 listings/month |

When `PUBLIC_PRICING_DISPLAY_MODE=current`, the public page switches to the current entitlement limits:

| Tier | Current entitlement limits |
| --- | --- |
| Free Trial | 5 lifetime listings, no daily/monthly reset |
| Starter | 10 listings/day, 75 listings/month |
| Pro | 25 listings/day, 250 listings/month |
| Business | 60 listings/day, 600 listings/month |

## Feature Matrix

| Feature | Free Trial | Starter | Pro | Business |
| --- | --- | --- | --- | --- |
| AI-generated titles and descriptions | Yes | Yes | Yes | Yes |
| Emoji support in generated descriptions | Yes | No | Yes | Yes |
| Change AI writing tone | No | No | Yes | Yes |
| Phone upload + batch upload | Soon restricted to Pro/Business | Soon restricted to Pro/Business | Yes | Yes |
| One-time credit pack | Available | Available | Available | Available |
| Dedicated support | No | No | No | Yes |
| Priority processing | No | No | Yes | Yes |

## Implementation Notes

- Tier limits and Stripe price IDs live in `utils/tierConfig.ts`.
- Public limit copy is derived in `src/utils/pricingDisplay.ts`.
- The pricing UI is rendered by `src/components/PricingPage.astro`.
- Free Trial currently allows emojis by default in `api/generate.ts`.
- Tone customization and paid emoji controls are only enabled for `pro` and `business` in `api/generate.ts`.
- Batch capacity uses the same generation entitlement checks through `api/user/batch-capacity.ts`.
- `api/phone-upload.ts` stores and lists uploaded photos; the public pricing promise is that phone upload and batch upload will be restricted to Pro and Business.
- Business has unlimited daily usage only in legacy compatibility mode or for active legacy Business subscribers; current new Business entitlement is 60/day.
