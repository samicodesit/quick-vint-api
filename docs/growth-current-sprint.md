# AutoLister AI Growth Current Sprint

This is the durable source of truth for current growth work. Chat is temporary; if Codex makes or changes a growth decision, update this file in the same change.

## Current Operating Goal

- Period: 2026-07-06 to 2026-08-02
- Goal: make AutoLister AI the obvious "AI Vinted listing helper" for sellers who want faster titles, descriptions, and hashtags from photos.
- Primary market: France first.
- Secondary market: Netherlands/Belgium.
- Constraint: 5-8 operator hours per week.
- Paid-test budget: EUR 300-500 per month.
- Status: waiting for the next Monday admin metrics refresh before changing targets.

## Weekly Review Ritual

Run this every Monday.

1. Refresh the Chrome Web Store `Last 30 days` snapshot if the reporting period changed.
2. Check `/admin/logs`, `/admin/users`, and `/admin/costs` for the specific product metrics needed for the review.
3. Ask Codex: `Run growth review. Read docs/growth-playbook.md, docs/growth-current-sprint.md, docs/blog-content-plan.md, and these current admin/Chrome Store metrics. Update the sprint plan if the decision changes.`
4. Record this week's decision in the Decision Log below.
5. Keep only three active weekly actions.

Daily rule: inspect only the metric needed for the current action, record one result, then stop.

## Current Weekly Actions

Refresh these after the Monday review. Until then, do not start new growth side quests.

| Priority | Action                                                            | Channel      | Market   | Success metric                         | Status  |
| -------- | ----------------------------------------------------------------- | ------------ | -------- | -------------------------------------- | ------- |
| 1        | Refresh admin metrics and Chrome Store snapshot                   | Measurement  | All      | Current 30-day snapshot saved          | Pending |
| 2        | Pick one store or trust improvement from the refreshed bottleneck | Chrome Store | FR/NL    | Better install quality or more ratings | Pending |
| 3        | Pick one acquisition/content action from the refreshed bottleneck | SEO/outreach | FR first | Active generators, not clicks          | Pending |

## Active Experiments

Use this table for any growth action that takes more than one day or spends money.

| ID              | Hypothesis             | Channel | Market | Action                                    | Budget | Start      | End | Success metric | Result | Decision |
| --------------- | ---------------------- | ------- | ------ | ----------------------------------------- | -----: | ---------- | --- | -------------- | ------ | -------- |
| G-2026-07-06-01 | Pending Monday refresh | TBD     | TBD    | Do not launch until baseline is refreshed |  EUR 0 | 2026-07-06 | TBD | TBD            | TBD    | Pending  |

## Metrics To Refresh

Source: `/admin/logs`, `/admin/users`, `/admin/costs`, Stripe, and Chrome Web Store Developer Dashboard.

| Metric                   | Latest value | Date | Notes             |
| ------------------------ | -----------: | ---- | ----------------- |
| Chrome Store page views  |          TBD | TBD  | Last 30 days only |
| Chrome Store installs    |          TBD | TBD  | Last 30 days only |
| Chrome Store uninstalls  |          TBD | TBD  | Last 30 days only |
| Chrome weekly users      |          TBD | TBD  | CWS snapshot      |
| Chrome rating count      |          TBD | TBD  | Lifetime count    |
| 30-day signups           |          TBD | TBD  | `/admin/users`    |
| 30-day active generators |          TBD | TBD  | `/admin/logs`     |
| 2+ generation users      |          TBD | TBD  | `/admin/logs`     |
| quota pressure users     |          TBD | TBD  | `/admin/users`    |
| limit hits               |          TBD | TBD  | `/admin/logs`     |
| paywalls shown           |          TBD | TBD  | `/admin/logs`     |
| checkout starts          |          TBD | TBD  | `/admin/logs`     |
| paid profiles            |          TBD | TBD  | `/admin/users`    |
| MRR                      |          TBD | TBD  | Stripe            |

## Decision Log

Append one row whenever the weekly focus changes or an experiment ends.

| Date       | Decision                                                           | Reason                                                                                                                                                      | Result/Follow-up                                                         |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 2026-07-04 | Reposition homepage hero copy toward "Vinted AI listing assistant" | GSC query demand is clustered around "vinted ai", "vinted ai listing", and "vinted description generator"; old H1 was "The Only AI Vinted Lister You Need." | Review homepage GSC and hero CTA movement on 2026-07-18 and 2026-08-01   |
| 2026-07-04 | Created durable growth sprint tracker                              | Growth plans in chat are not durable enough for recurring execution                                                                                         | Next Monday review must fill current metrics and replace pending actions |

## Operating Rules

- The sprint doc is the durable memory. Use focused admin routes for live metrics.
- Do not judge growth work by impressions, clicks, or email opens alone.
- Count installs, signups, successful generations, 2+ generation users, paywalls, checkouts, paid users, ratings, and replies.
- Do not scale paid traffic unless activation and value depth are healthy.
- Do not position AutoLister AI as Vinted automation, botting, auto-like, auto-follow, buyer messaging, relisting, or account control software.
- Keep "Vinted description generator" visible in high-intent acquisition copy.
- Every experiment needs a hypothesis, channel, market, action, budget, date range, success metric, result, and decision.
