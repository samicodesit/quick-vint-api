# Listing preparation redesign

Source of intent: the October 9 user-supplied “Redesign AutoLister around preparing and copying a listing” plan.

Worktree: `codex/mobile-web-phase1`, starting at `35220a4` (existing isolated feature branch).

Scope: DraftWorkspace markup/controller/styles, shared authentication/account presentation, icon dependency, browser fixture regressions and QA evidence. Existing API contracts, migrations and generation/upload/autosave services remain the integration boundaries.

- Baseline: 812/815 tests passed in sandbox; the three child-process EPERM failures passed on an escalated rerun.
- Storyboard: [desktop/phone sequence](storyboard.html), reviewed before replacing the markup. It covers home, empty preparation, grouping, review, menus, authentication and interrupted saves/generation.
- Library/preparation/grouping/review behavior: implemented. Add item opens a local composer without creating a blank draft; Add several stays in grouping and shows created groups. Photos remain visible during readable review; Edit reveals inputs; copying never changes status. Listed is manual, supports photo-only items and advances through the selected batch. Settings and photo actions use anchored panels/phone sheets. Save photo downloads the prepared JPEG using the existing signed URL.
- Authentication/account: implemented. Official Google mark, separate email/code steps with destination and Change email, neutral confirmation and readable errors. Account contains the existing allowance/plan/billing/sign-out controls; failed sign-out keeps work available.
- Persistence: existing draft/done states and API contracts preserved, no migration. Owner-scoped group references reload through existing list/detail actions. Navigation restores selected items, loaded pages and library scroll; recovery survives expired authentication and failed saves. Large selections use a labelled allowance-bounded run of at most 20, preserving the rest.
- Final production gate: lint, types, feature-enabled build (132 pages), formatting, **115 files / 817 tests passed**, test run starting October 9 at 19:21:09 local environment time. [Browser result](listing-preparation/result.json): **44 checks**, four widths (360/390/768/1440), 26 simulated generations and no page errors. The full matrix is `/tmp/autolister-redesign-final-browser` in this session.
- Fresh review: five important findings fixed, plus the related grouping-close navigation case found on recheck. All six targeted browser regressions failed before their fixes and pass afterward: Listed-save retry, delayed detail after Back, delayed group detail after closing grouping, later-page batch continuation, outgoing library scroll, and failed sign-out. A unit regression checks that confirmed state changes only after a successful save. Fixture seeding was corrected before the final rerun.
- Visual/accessibility checks: reviewed actual home, preparation, grouping, review, auth/code, account/settings, save/conflict, quota/partial-failure layouts across the four-width capture matrix. Keyboard opening, Tab order, Escape/focus return, photo selection and safe deletion cancellation pass. Primary/copy/settings targets are at least 44px on phone. Text palette contrast on white is at least 4.5:1; 200% CSS zoom has no horizontal overflow. CSS zoom is a local smoke check, not certification of browser zoom or physical keyboard behavior.
- Physical phone and staging: required before deployment; unavailable in this local fixture task.

Unperformed: actual iOS/Android camera, HEIC/orientation, keyboard and clipboard; real staging Supabase/Storage/provider integration, email/Google redirect and Stripe return; multi-connection PostgreSQL concurrency. Fixtures intercept provider/auth/billing/storage; these results do not verify a deployed customer journey. See [release handoff](../../browser-drafts-release.md).

Decision: use the existing feature checkout rather than main. No deployment, customer activity or marketplace automation is authorized by this implementation brief.
