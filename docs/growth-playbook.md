# AutoLister AI Growth Playbook

## Source Of Truth

- `docs/growth-playbook.md`: rules, KPI model, thresholds, and allowed actions.
- `docs/growth-current-sprint.md`: current goal, weekly actions, active experiments, metric snapshot, and decision log.
- `docs/blog-content-plan.md`: SEO/content tracker only.
- `/admin/logs`, `/admin/users`, and `/admin/costs`: product events, account behavior, and cost checks.

Chat is not the source of truth. After any growth decision from Codex, update `docs/growth-current-sprint.md` before considering the decision saved.

## Daily Plan

Do this once per day. Stop after the checklist is done.

1. Open Chrome Web Store Developer Dashboard and choose `Last 30 days`. Chrome Store reporting does not expose a shorter period, so do not enter 7-day numbers here.
2. Record the same-period Chrome Store numbers in `docs/growth-current-sprint.md`:
   - period start/end
   - page views
   - impressions
   - installs
   - uninstalls
   - weekly users
   - public listing users, if Chrome shows it
   - lifetime rating count
3. Check `/admin/logs`, `/admin/users`, and `/admin/costs` only for the specific metric or user issue you are investigating.
4. Use prepared scripts only when the sprint plan calls for them.

Do not judge emails by opens. Count replies, installs, generations, checkout starts, paid users, or new ratings.

If the dashboard says:

- `Measurement`: paste Chrome Store numbers first.
- `Store Listing`: improve screenshots, first description lines, or ratings.
- `Acquisition`: do direct seller outreach and SEO.
- `Activation`: fix first-generation onboarding.
- `Value Depth`: improve the path from first generation to 2-3 generations. With a 5-free-generation limit, this matters more than generic repeat free usage.
- `Paywall`: simplify upgrade choices.
- `Scale`: increase outreach volume or test creators/paid channels.

## Weekly Plan

Run this every Monday.

1. Refresh the Chrome Store `Last 30 days` snapshot if the reporting period changed.
2. Ask Codex to read `docs/growth-playbook.md`, `docs/growth-current-sprint.md`, `docs/blog-content-plan.md`, and the specific admin metrics you inspected.
3. Update `docs/growth-current-sprint.md` with the current weekly actions, metric snapshot, and decision log.
4. Ship one change tied to the current focus.
5. Record these numbers in the sprint doc:
   - Chrome users
   - 30-day signups
   - active generators
   - 2+ generation users
   - quota pressure users
   - limit hits
   - paywall shown
   - checkout starts
   - paid profiles
   - MRR

Keep only three active weekly actions. If a new idea appears, either replace one of the three or leave it for the next Monday review.

## KPI Model

AutoLister AI has 5 free lifetime generations. The core funnel is:

1. Chrome Store visitor
2. Install
3. Signup
4. First successful generation
5. 2+ successful generations
6. 3+ generations or limit hit
7. Paywall shown
8. Checkout started
9. Paid

Primary KPIs:

- `Activation`: signups -> active generators.
- `2+ Generation Users`: users who got past one try.
- `Quota Pressure`: users with 3+ generations, existing free usage of 3+, or a limit hit.
- `Limit to Paywall`: limit hits -> paywall shown.
- `Paywall to Checkout`: paywall shown -> checkout started.
- `Signup to Paid`: recent signups -> paid profiles.

## Thresholds

- Acquisition weak: under 4 signups/day over our own last 7 days.
- Activation weak: under 45% of 30-day signups become active generators.
- Value depth weak: under 20% quota pressure or under 1.7 generations per active generator.
- Value depth healthy: 35%+ quota pressure or 2.5+ generations per active generator.
- Signup to paid acceptable: 4-8%.
- Signup to paid strong: 8%+.
- Paywall weak: 10+ paywalls shown and under 10% checkout starts.

## Exact Actions

`Measurement`: save a valid 30+ day Chrome Store snapshot.

`Store Listing`: keep "Vinted description generator" visible. Change one screenshot, short description, or first paragraph. Ask 3 recently active paid users for ratings using the prepared script.

`Acquisition`: send 20-30 Vinted seller outreach messages. Target active sellers with many listings and weak descriptions. Count installs, first generations, and paid users.

`Activation`: run signup -> upload -> generate. Remove the first confusing step. Check `generate_missing_photo` and `generate_error`.

`Value Depth`: review users with only one successful generation. Fix the next-item path after first success. Use email only if logs do not explain the drop-off.

`Paywall`: confirm every limit hit shows upgrade options. Simplify to one primary plan and one secondary credit option.

`Scale`: increase only channels that produce active generators or paid users.

## Targets

Next 30 days:

- Chrome public users: 450-600
- 30-day active generators: 200+
- 2+ generation users: 45%+
- quota pressure users: 30%+
- active paid profiles: 40-50
- MRR: $300-$450
- Chrome Store ratings: 15+ while staying above 4.2

Next 90 days:

- Chrome public users: 1,000+
- 30-day active generators: 500+
- 2+ generation users: 55%+
- quota pressure users: 40%+
- active paid profiles: 80-150
- MRR: $750-$1,500

## Rules

- Do not optimize for vanity installs.
- Do not remove "Vinted description generator" from high-visibility copy.
- Do not position AutoLister as botting, auto-like, auto-follow, or auto-relist software.
- Do not scale paid traffic until activation and value depth are healthy.
- Do not use email as a belief system. Use it only as a small prepared measurement experiment.
