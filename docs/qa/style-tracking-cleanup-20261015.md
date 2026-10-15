# Style and pricing tracking cleanup, October 15, 2026

Skip remains in both the isolated preview and production onboarding. It saves the starting preferences and goes directly to Add item. Apply saves the selected preferences and follows the same direct handoff.

## Corrected tracking

- `web_paywall_view` records an opening `reason`, replacing its misleading `errorCode` field. This is a pricing-dialog impression, never proof of checkout or payment.
- Separate `entryPoint` values identify the profile menu, a paid-feature control, an incoming plans link, or a blocked generation. Checkout start carries the same reason and entry point plus the chosen tier. Acquisition `source`, account ownership, browser ID and session ID retain their existing meaning.
- `web_style_setup` completion records Apply or Skip, both output languages, Short/Long, bullets/text, hashtags, emojis and seller-note inclusion. It records no note content and adds no individual toggle-click events.
- The shared backend policy now accepts the Short/Long string as well as the existing numeric description-length diagnostic. It previously discarded the onboarding string. Browser and backend policies are generated together.
- Migration `2026-10-15_style_funnel_metrics.sql` preserves the bounded style event and fields during the existing cleanup. Photos, generated copy, notes and identifying request evidence still clear on the existing schedule. Metrics still expire after 30 days. The function remains restricted to service-role execution. The migration changes its definition only and does not run cleanup or update customer rows.

Existing retained records may still contain the old `errorCode`. Interpret it as a paywall opening reason only for `web_paywall_view`. Compaction also preserves that legacy value as `reason`; it does not infer a missing historical entry point. Real failure tracking elsewhere is unchanged. Checkout return and paid webhook outcomes remain separate from views and starts.

## Verification

Seven new regression cases failed before the corresponding filter changes and passed afterward. Targeted checks cover the actual shipped browser transport, mobile wrapper and tracking endpoint. The PostgreSQL-compatible cleanup regression also failed before repair and passes afterward, including privacy removal, metric expiry and restricted access.

The rebuilt frontend was exercised with local-only auth and API fixtures. Skip reached Add item with Short defaults. Apply reached Add item with Long, paragraphs, hashtags/emojis disabled and a custom note included. Recorded events contain the switches and omit the note text. Profile-menu pricing and a chosen Pro checkout retain identical acquisition/session context. Incoming plans links record their distinct entry point. A deliberate local checkout failure leaves the dialog usable.

No provider generation, real signup, customer account change, Stripe checkout, charge or marketplace action was performed. Generation-limit and paid-feature entry-point wiring is covered by typed callers and existing policy tests, not a new browser reenactment. Full production checks, database-definition readback and deployed-asset acceptance are required before calling this live. Sanitized browser and release receipts are under the parent workspace's `reports/style-onboarding-release-2026-10-15/`.
