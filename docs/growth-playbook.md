# AutoLister AI Growth Playbook

## Baseline

Use this as the starting point for the next growth cycle.

- Chrome Web Store public users: 305
- Chrome Web Store rating: 4.3 from 6 ratings
- TrustMRR MRR: $222
- Active paid sellers from profiles: 29
- 30-day signups: 160
- 30-day active generators: 145
- 30-day paid active generators: 15
- 30-day successful generations: 719
- 30-day limit hits: 131
- Repeat active users: 22.8% of active generators used AutoLister on 2+ days
- Approximate 30-day signup-to-paid rate: 7.5%

Market context:

- Vinted reported EUR 10.8bn GMV and EUR 1.1bn revenue for 2025 across 26 markets.
- Vinted says EUR 10.8bn was returned directly to sellers' pockets in 2025.
- This means the market is not the constraint. The near-term constraint is reaching the right subset of active sellers and making AutoLister habitual.

## Main Goal

Grow paid MRR before optimizing for raw install count.

Raw installs are useful only when they create one of these signals:

- A seller generates at least one listing.
- A seller hits a real usage limit.
- A seller starts checkout.
- A seller pays or buys credits.
- A seller returns on a second listing day.

## Weekly Scorecard

Run:

```bash
node scripts/growth-scorecard.mjs
```

Add these manual inputs from external dashboards:

- Chrome Web Store users, impressions, listing visitors, installs, uninstall rate, rating count.
- TrustMRR MRR, active subscriptions, new MRR, churned MRR.
- Stripe checkout sessions, successful payments, failed payments, refunds.
- Paid or creator spend, clicks, installs, paid conversions.

## Daily Dashboard

Open `/admin`, sign in with the admin secret, then use the `Growth` tab.

Check this every morning:

- Today's signups
- Today's successful generations
- Active paid profiles
- Repeat active user rate
- Signup-to-paid rate
- Limit hits -> paywall shown -> checkout started -> checkout opened
- Chrome Store clicks from the site

Manual daily inputs still needed:

- Chrome Web Store listing impressions
- Chrome Web Store listing visitors
- Chrome Web Store installs
- Chrome Web Store uninstall rate
- Chrome Web Store search terms, if available in the dashboard
- TrustMRR/Stripe MRR movement

## Expected Numbers

Current stage: early but commercially real. The product has proof of willingness to pay, but not yet enough repeat usage or distribution.

Interpret the current numbers this way:

- 7.5% 30-day signup-to-paid is a good early signal. Do not panic about monetization yet.
- 22.8% repeat active usage is the bigger issue. The product needs more second-day and weekly seller habit.
- 29 active paid profiles on 305 public Chrome users is unusually strong if the Chrome number is accurate, but some profiles may come from website/auth flows rather than active installed users.
- 719 successful generations in 30 days means users are getting value, but the average active generator is still not listing very often.

Targets for the next 30 days:

- Chrome public users: 450 to 600
- Total profiles: +120 to +250
- 30-day active generators: 200+
- Repeat active users: 30%+
- Active paid profiles: 40 to 50
- MRR: $300 to $450
- Chrome Store rating count: 15+ while keeping rating above 4.2

Targets for the next 90 days:

- Chrome public users: 1,000+
- 30-day active generators: 500+
- Repeat active users: 40%+
- Active paid profiles: 80 to 150
- MRR: $750 to $1,500

If 30-day repeat usage does not improve, do not spend heavily on ads. Use founder-led outreach and product fixes until repeated usage is healthier.

## Funnel Events

The site and extension now emit these key events to `/api/events/track`:

- `chrome_store_click`
- `magic_link_request`
- `magic_link_sent`
- `generate_click`
- `generate_request`
- `generate_success`
- `generate_missing_photo`
- `generate_limit_hit`
- `paywall_shown`
- `paywall_option_select`
- `checkout_start`
- `checkout_opened`
- `credit_pack_click`
- `billing_portal_start`
- `pricing_view_all_click`
- `phone_upload_start`
- `batch_start`

Use these event counts to answer:

- Are store visitors turning into installs?
- Are installs turning into signed-in users?
- Are signed-in users generating at least once?
- Are active users hitting limits?
- Are limit hits turning into checkout?
- Are checkouts turning into paid subscriptions?

## First Experiments

Run experiments in one-week windows and compare against the scorecard.

1. Chrome Web Store listing
   - Update first two lines to focus on the outcome: Vinted titles and descriptions from photos in seconds.
   - Add screenshots that show before photo, generated title, generated description, and phone upload.
   - Ask active paid sellers for ratings after a successful generation or renewal.

2. Founder-led outreach
   - Send 20 targeted messages per day to active Vinted sellers in English and French markets.
   - Offer the Chrome extension directly, not a generic landing page.
   - Track replies, installs, first generation, and paid conversion.

   Daily target:

   - 20 direct messages or comments to relevant sellers
   - 5 warm conversations
   - 2 installs
   - 1 first generation

   Prioritize sellers who list many fashion items, use weak descriptions, and are already active.

3. Limit-to-paid conversion
   - Monitor `generate_limit_hit -> paywall_shown -> checkout_start -> checkout_opened`.
   - If checkout starts are low, simplify paywall copy.
   - If checkout opens are high but payments are low, inspect pricing, payment failures, and Stripe session metadata by `source`.

4. Retention
   - Improve the second-day habit around phone upload and batch listing.
   - Track repeat active users weekly.
   - Prioritize fixes where users generate once and never return.

5. SEO/content
   - Keep the exact phrase "Vinted description generator" near the top of Chrome Web Store and landing-page copy.
   - Build pages around search-intent phrases:
     - Vinted description generator
     - Vinted title generator
     - Vinted AI description generator
     - how to write Vinted descriptions
     - Vinted listing description template
     - Vinted hashtags
     - sell faster on Vinted
   - Use the blog plan for informational searches, but route every article to the Chrome extension.

## Decision Rules

- If weekly active generators grow but paid conversion falls, tighten onboarding and paywall targeting before buying more traffic.
- If checkout starts are healthy but paid conversion is weak, inspect Stripe and pricing.
- If Chrome users grow but active generators do not, the listing promise or onboarding is mismatched.
- If repeat active usage stays under 30%, prioritize product workflow improvements over acquisition spend.
- If founder-led outreach converts to paid at a higher rate than store traffic, scale that channel before paid ads.

## What Not To Do Yet

- Do not buy broad paid ads until repeat active usage is above 30%.
- Do not optimize for vanity installs if generated listings and paid users do not move.
- Do not position AutoLister as automation, botting, auto-like, auto-follow, or auto-relist software.
- Do not remove "Vinted description generator" from the first visible store-copy lines.
- Do not claim large social proof until the numbers are stronger.
