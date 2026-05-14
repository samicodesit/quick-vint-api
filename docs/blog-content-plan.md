# Blog Content Plan

Tracked source of truth for planned, drafted, localized, published, and reviewed blog posts. Update this file in the same change as every published blog post.

## Status Legend

- `[ ]` planned
- `[~]` drafting
- `[x]` published

## Product Placement Rules

Approved component names for the `Product placement` column:

- `none`
- `ProductMention`
- `PhotoToListingCTA`
- `WritingStyleCTA`
- `EndOfPostCTA`

Use a maximum of two placements per post: one contextual mid-post component plus the existing end-of-post CTA. Do not place a CTA before the article has already solved part of the reader's problem.

Product placements may only mention current AutoLister AI capabilities: generating Vinted titles and descriptions from item photos, adding SEO-style hashtags, supporting localized output, optional listing text formatting, and paid-tier writing controls where the component copy is explicit and accurate.

Do not use product placements for pricing recommendations, price calculation, bulk listing, automated publishing, offer handling, buyer messaging, follower or like automation, relisting, shipping, returns, disputes, refunds, blocked accounts, scams, prohibited-item workflows, or any other Vinted account action.

## AI Writing Prompt

Short command for future AI agents:

> Pick the next unpublished post in `docs/blog-content-plan.md`, write and publish it in `en`, `fr`, `de`, and `nl`, update the tracker, and run the blog checks.

Full prompt:

```text
Read docs/blog-content-plan.md and pick the next unpublished post in priority order from the Localization Matrix.

Create published MDX posts for en, fr, de, and nl under src/content/blog/{locale}/ using the existing blog frontmatter schema and the row's Translation key, Category, Search intent, Target query, Product placement, and Notes.

Rules:
- Publish all four blog locales unless explicitly asked for drafts or fewer localizations.
- Do not set draft: true unless explicitly asked to create drafts.
- Use the row's Translation key exactly.
- Choose clear SEO slugs based on the target query. Localized posts may use localized slugs when natural.
- Include practical, original article sections and FAQ items in each locale.
- Use only the approved Product placement component from the row.
- Follow the Product Placement Rules in this file exactly.
- Do not mention pricing advice, bulk listing, automated publishing, offer handling, buyer messaging, follower/like automation, relisting, or any Vinted account actions as AutoLister AI features.
- For pricing, shipping, refunds, disputes, scams, blocked accounts, and prohibited-item posts, cite official Vinted sources and avoid sounding like Vinted support.
- Update the tracker locale statuses to [x] for each non-draft published locale and fill URL, Publish date, and Last reviewed.
- Run pnpm check:blog-plan and pnpm build.
```

## Localization Matrix

| Priority | Search intent | Target query | Category | Translation key | en | fr | de | nl | URL | Publish date | Last reviewed | Product placement | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P0 | Improve listing text | how to write Vinted descriptions that sell | selling-tips | vinted-descriptions-that-sell | [x] | [x] | [ ] | [ ] | /blog/how-to-write-vinted-descriptions-that-sell | 2026-05-04 | 2026-05-13 | ProductMention | Complete German and Dutch localizations before new clusters. |
| P0 | Improve listing photos | Vinted photos that sell | selling-tips | vinted-photos-that-sell | [x] | [x] | [ ] | [ ] | /blog/vinted-photos-that-sell | 2026-05-04 | 2026-05-13 | PhotoToListingCTA | Complete German and Dutch localizations before new clusters. |
| P1 | Beginner setup | how to sell on Vinted | marketplace-guide | how-to-sell-on-vinted-beginner-checklist | [x] | [x] | [x] | [x] | /blog/how-to-sell-on-vinted | 2026-05-13 | 2026-05-13 | EndOfPostCTA | Beginner checklist; CTA only after listing quality section. |
| P1 | Diagnose poor sales | why are my Vinted items not selling | selling-tips | why-vinted-items-not-selling | [x] | [x] | [x] | [x] | /blog/why-are-my-vinted-items-not-selling | 2026-05-13 | 2026-05-13 | PhotoToListingCTA | Mention only when causes involve poor photos, weak titles, or thin descriptions. |
| P1 | Sell-through improvement | how to sell faster on Vinted | selling-tips | how-to-sell-faster-on-vinted | [ ] | [ ] | [ ] | [ ] | TBD | TBD | TBD | PhotoToListingCTA | Avoid claims about automation or account growth. |
| P1 | Timing question | best time to upload on Vinted | selling-tips | best-time-to-upload-on-vinted | [ ] | [ ] | [ ] | [ ] | TBD | TBD | TBD | none | Product is not directly relevant unless article includes a short listing-quality section. |
| P1 | Search visibility | Vinted title keywords | selling-tips | vinted-title-keyword-guide | [ ] | [ ] | [ ] | [ ] | TBD | TBD | TBD | ProductMention | Tie to generating searchable titles and hashtags from item photos. |
| P1 | Listing template | Vinted description template | selling-tips | vinted-description-template-by-item-type | [ ] | [ ] | [ ] | [ ] | TBD | TBD | TBD | WritingStyleCTA | Suitable for formatting, bullets, tone, and optional writing controls. |
| P1 | Home photo setup | how to take Vinted photos at home | selling-tips | how-to-take-vinted-photos-at-home | [ ] | [ ] | [ ] | [ ] | TBD | TBD | TBD | PhotoToListingCTA | CTA can explain clearer photos improve title and description output. |
| P2 | Offers and bundles | how to handle offers and bundles on Vinted | marketplace-guide | how-to-handle-vinted-offers-and-bundles | [ ] | [ ] | [ ] | [ ] | TBD | TBD | TBD | none | Do not imply offer handling or buyer messaging automation. |
| P2 | Pricing research | how to price items on Vinted | pricing-strategy | how-to-price-items-on-vinted | [ ] | [ ] | [ ] | [ ] | TBD | TBD | TBD | none | Do not market pricing advice or price calculation. |
| P2 | Seller dispute guidance | Vinted buyer says item not as described | marketplace-guide | vinted-item-not-as-described-seller-guide | [ ] | [ ] | [ ] | [ ] | TBD | TBD | TBD | none | Cite official Vinted sources; avoid sounding like Vinted support. |
| P2 | Refund and return guidance | Vinted refund and return guide for sellers | marketplace-guide | vinted-refund-return-guide-sellers | [ ] | [ ] | [ ] | [ ] | TBD | TBD | TBD | none | Cite official Vinted sources; no product CTA unless a narrow listing-clarity note is needed. |
| P2 | Shipping issue guidance | Vinted shipping problems lost delayed damaged parcels | marketplace-guide | vinted-shipping-problems-guide | [ ] | [ ] | [ ] | [ ] | TBD | TBD | TBD | none | Cite official Vinted sources; do not imply logistics support. |
| P2 | Account issue research | why Vinted blocked my account | marketplace-guide | why-vinted-blocked-my-account | [ ] | [ ] | [ ] | [ ] | TBD | TBD | TBD | none | Cite official Vinted sources; avoid Vinted support framing. |
| P2 | Policy research | what items are not allowed on Vinted | marketplace-guide | what-items-not-allowed-on-vinted | [ ] | [ ] | [ ] | [ ] | TBD | TBD | TBD | none | Cite official Vinted sources and keep product placement out. |
| P2 | Safety research | how to avoid Vinted scams as a seller | marketplace-guide | how-to-avoid-vinted-scams-seller | [ ] | [ ] | [ ] | [ ] | TBD | TBD | TBD | none | Cite official Vinted sources; no product CTA. |
