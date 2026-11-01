# Your model: implementation ledger

Approved 2026-11-01. Local feature branches only. No deployment or migration of production data is authorized.

## Contract

One immutable, fictional adult model per authenticated account. One free creation, no listing credits. Enable/disable is account-wide and does not yet affect listing generation. Full-length natural mirror selfie including both complete shoes. A phone obscures the central face; natural forehead, cheek, chin and eye-edge fragments are allowed.

Preferences: gender male/female; hair black/blonde/brown/red; height 130 to 210 cm (default 170); build slim/average/plus_size; six skin tones. Explicit choices except height. Creation cannot be edited after success.

Web: listing style, optional model preferences, sign-in, review and explicit creation. Existing users get a deferred invitation. Extension: first eligible authenticated new/edit listing page observed after release, deferred during other active work. Invitation dismissal is shared across surfaces. Settings begin with a full-width model card, a contained full-body preview, enabled toggle and back navigation preserving existing settings.

## Visual revision, 2026-11-01

The invitation uses the existing generated female and male examples, clearly captioned as examples, instead of an enlarged icon. Both static 280 by 420 WebP assets together total 14,246 bytes. No additional image generation, external image service or runtime dependency is needed. The extension packages both files and declares them as web-accessible resources for its listing-page invitation.

Gender and hair choices share one portrait illustration style. Build choices use the same full-body stance and separate slim, average and plus-size contours. All illustrations are inline SVG, with radio labels retained for clarity and accessibility.

The model entry moves from the seller-note row to the first position in web and extension settings. It uses a photographic thumbnail, explicit Create your model / Your model label and a chevron. Accounts with an unseen or merely displayed invitation get a New badge and a CSS border pulse every 3.6 seconds. Opening preferences or dismissing the invitation stops the pulse and records the existing account-wide dismissal. Existing models never pulse. Reduced-motion preferences disable the animation. No JavaScript animation loop or animation library is added. The card title and subtitle are left-aligned, and the web language selectors share one row on mobile with wider dropdown menus kept inside the viewport.

The shared model copy catalogue covers all 18 languages supported by style onboarding and the extension language resolver, including labels, actions, status/recovery messages and accessible names. Web follows browser languages. The extension follows its existing explicit preference/domain/browser precedence. Czech `cs` maps to the existing `cz` key. The English hair label is Red; the API value remains `red`. No translation service or model call runs in the browser.

Selected options use a border and background tint only. Visible checkmarks and radio dots were removed following review. Keyboard operation and native radio semantics are retained.

Revision verification: backend production gate passed with 1,227 tests; extension unit suite passed with 163 tests; both builds passed. The full browser run passed 338 checks and skipped three. Eight failures during active edits and concurrent browser runs were rechecked: the final 16 model-flow checks and the two isolated MV3 regressions passed, covering all eight failures and three additional localization checks. This gives 349 distinct browser checks passing across the runs. Four visual checks were repeated after removing the selection symbols. All 18 translated preference forms were exercised at 320 px, including unchanged API enum values; French and German previews were inspected alongside English. Evidence and actual rendered local fixture screenshots are in `reports/model-ui-revision-20261101/` in the parent workspace.

Settings availability loads even if the settings dialog is already open; only the automatic invitation waits for idle UI. Existing unsaved seller notes remain intact when entering and leaving the model view.

## Generation and data

Server resolves a versioned seeded scene once and preserves it through retries. Four room types, six neutral walls, compatible wood/tile floors, rectangular/arched mirrors and three frame finishes. At most one furniture item and one compatible accent. Windows and light direction agree. Props stay clear of the person. Ordinary fitted off-white tee, charcoal trousers and white trainers.

Selected image model: gpt-image-2.5-flare-2026-09-08, medium, 1024x1536, JPEG 90. Checker: gpt-5.4-mini-2026-03-17, low reasoning, strict three-boolean response. Prototype combined durations 9.42, 11.09 and 10.13 seconds; approximately $0.014 per accepted first attempt. Production latency remains to be measured. Prior feasibility spend approximately $0.41005 of the $2 small-test ceiling.

Authenticated API owns user identity. Durable operation, private permanent storage, atomic creation and leases with fenced publication. Maximum two generation attempts per operation, finite deadline, recovery cron and resumable UI. Ready models cannot be regenerated. Account deletion fences workers and removes image objects. No listing-generation behavior changes.

## Work and verification

- [x] Contracts, environment catalog and prompt compiler with deterministic tests
- [x] Database migration, atomic claims and fencing tests
- [x] Generation pipeline, authenticated endpoints, recovery and privacy cleanup
- [x] Shared preference and preview UI, web onboarding and settings integration
- [x] Extension invitation, settings and authenticated API bridge
- [x] Failure/concurrency/account isolation regression coverage
- [x] Full backend and extension checks, desktop/mobile rendered previews

Baseline: backend main 5bb9647; extension main 60440e4. Native worktree creation rejected the child repositories because the registered workspace is their non-repository parent. Git worktrees created under the parent .worktrees directory instead. Existing dirty checkouts preserved.

UI direction: preserve AutoLister's existing type, colors and compact controls. Use distinct illustrated preference choices, a full-length mirror outline and an uncropped image. Omit redundant helper copy; keep the irreversible-creation consequence visible.

## Preference contract

| Field    | Stored value              | Prompt meaning                                                    |
| -------- | ------------------------- | ----------------------------------------------------------------- |
| gender   | male, female              | Adult gender presentation                                         |
| hair     | black, blonde, brown, red | Hair color (red is shown as Red)                                  |
| heightCm | integer 130 through 210   | Approximate adult height, default 170                             |
| build    | slim, average, plus_size  | Natural body proportions                                          |
| skinTone | tone_1 through tone_6     | Very fair, fair, medium tan, medium brown, dark brown, deep brown |

Only height is preselected. Labels and radio semantics remain accessible even though the illustrations communicate choices visually. No customer text is interpolated into prompts.

## Scene catalog and mixing

| Category           | Values or rule                                                                       |
| ------------------ | ------------------------------------------------------------------------------------ |
| Room               | dressing_corner, bedroom_edge, living_corner, entryway                               |
| Wall               | warm_white, cream, light_beige, warm_grey, pale_sage, muted_greige                   |
| Floor              | pale_oak, medium_oak, walnut; light_stone_tile only in dressing corners or entryways |
| Mirror             | rectangular or soft_arch; natural_oak, dark_wood or matte_black frame                |
| Dressing furniture | stool, low_chest, none                                                               |
| Bedroom furniture  | bedside_table, low_chest, none                                                       |
| Living furniture   | chair, side_table, none                                                              |
| Entry furniture    | console, bench, none                                                                 |
| Accent             | none or plant; table_lamp only with a tabletop; floor_lamp only in bedroom/living    |
| Plant              | snake_plant, zz_plant, rubber_plant                                                  |
| Window             | outside_frame, partial_left, partial_right                                           |
| Light              | soft_overcast, gentle_morning, diffused_afternoon; direction follows visible window  |
| Layout             | furniture left/right, subject centered/slightly_offset                               |
| Phone case         | black, charcoal, dark_taupe                                                          |

A cryptographically random seed is created on the server. SHA-256 counter draws with rejection sampling select uniformly from each compatible list. The room is selected first. There is at most one furniture item and one accent. The complete recipe, seed, catalog version, prompt version and scene fingerprint are committed before any paid request. Retries reuse them. There is no global duplicate search. The test covers 3,000 deterministic scenes and validates compatibility.

## Stored records and observability

- `user_model_settings`: account invitation state, enabled flag, erasure fence.
- `user_models`: unique owner, immutable preferences/scene, operation and deadline, lease, attempts, ready image object key and dimensions.
- `user_model_attempts`: provider model/settings, generation/check/total duration, raw token usage, USD estimate, checker booleans and bounded error code. No images are placed in logs.
- Private `user-models` storage bucket: 10 MB JPEG limit, no public policy. Signed URLs expire after ten minutes and are renewed when the view reopens or gains focus.
- Deletion fences publication immediately, removes known images, and leaves anonymous object tombstones for cron cleanup after the in-flight upload grace period.

One operation permits two attempts. An expired 80-second lease cannot publish. Operations expire after three minutes, including recovery delay. Manual failure retries reuse preferences and scene, wait 30 seconds between operations and stop after six total attempts per account. This bounds failure costs without deducting listing credits. Ready models have no retry path.

Example internal measurement query, without user details:

```sql
select
  status,
  count(*) as attempts,
  percentile_cont(0.5) within group
    (order by (metrics->>'durationMs')::numeric) as median_ms,
  percentile_cont(0.95) within group
    (order by (metrics->>'durationMs')::numeric) as p95_ms,
  sum((metrics->>'estimatedCostUsd')::numeric) as estimated_usd,
  count(*) filter (where metrics->>'estimatedCostUsd' is null) as unknown_cost_attempts
from user_model_attempts
group by status;
```

Provider timings from the earlier feasibility run are not deployed end-to-end timings. A retry can approximately double time and cost. The UI allows leaving immediately while the durable job continues.

## Activation checklist for a separately authorized release

1. Apply `migrations/2026-11-01_user_models.sql` to the target database.
2. Configure `USER_MODELS_ENABLED=true` on the API and `PUBLIC_USER_MODELS_ENABLED=true` for the web build together. Existing Supabase service credentials, OpenAI key and cron secret are reused.
3. Deploy the backend/site with the minute recovery cron and 180-second function limits.
4. Verify account creation, refresh, signed image retrieval, toggles and deletion in the deployed environment before enabling the extension release.
5. Release the extension through its existing store pipeline. No version was bumped or store package uploaded during implementation.

Both flags default off. The extension also hides its entry when the API returns disabled. The separate permanent bucket is not included in temporary-upload cleanup.

## Local verification commands

Use the supported Linux Node toolchain (Node 24 in this workspace). Node 22.17.1 hit an installed Playwright module-loader incompatibility before browser tests could start.

Backend: `npm run verify:production`.
Extension: `AUTOLISTER_API_PATH=/absolute/path/to/the/coordinated/backend npm test` and `npm run build:prod`. Set the backend path explicitly in isolated worktrees so cross-repository phone-page tests do not accidentally load an older sibling checkout.
Local web browser coverage: start Astro with the mobile, drafts and model public flags enabled and fixture Supabase configuration, then run `MODEL_WEB_TEST_URL=http://127.0.0.1:4326 npx playwright test tests/e2e/user-model-web.spec.js` in the extension checkout. All network/auth responses are fixture data. No live Vinted automation or customer accounts are used.

The shared UI source is `public/user-model-ui.js` and `public/user-model.css` in the backend, mirrored byte-for-byte in the extension's `lib/` directory. Preserve parity when changing either surface.

## Implemented-prompt provider verification

The final compiler was exercised directly against the paid provider on 2026-11-01. Each result passed all three automated checks and a visual inspection. This did not upload anything to production storage or create a customer model.

| Preferences                                     | Image generation |   Check | Combined | Estimated USD |
| ----------------------------------------------- | ---------------: | ------: | -------: | ------------: |
| Female, average, brown hair, 170 cm, medium tan |         10.024 s | 2.704 s | 12.728 s |      0.014005 |
| Male, slim, black hair, 188 cm, dark brown      |          9.266 s | 1.769 s | 11.035 s |      0.014072 |
| Female, plus size, red hair, 158 cm, very fair  |          8.497 s | 2.083 s | 10.580 s |      0.013978 |

Additional measured spend: $0.04205425. Combined with feasibility tests: approximately $0.45210425 of the $2 ceiling. No further paid tests are needed for this implementation. These times exclude deployed API/database/storage overhead and are not an SLA.

Evidence is in the parent workspace at `reports/model-implementation-20261101/provider/`: images, exact compiled prompts, scenes, raw usage and timing JSON. The opt-in `scripts/benchmark-user-model.mjs` reproduces this three-image test; it explicitly requires spend authorization. UI screenshots use the resulting female-average sample with local fixture auth/API data.

## Final local acceptance

- Backend `npm run verify:production`: lint, types, build, formatting and 1,227 tests passed; 13 existing opt-in tests skipped.
- Extension unit suite: 160 tests passed. Production build passed.
- Existing extension browser suite: 319 passed initially, four existing tests skipped. Thirteen initial failures were an outdated manifest expectation (one) and an older sibling backend loaded by cross-repository phone checks (twelve). The expectation was updated for the new packaged assets; `AUTOLISTER_API_PATH` was pointed at this coordinated backend. All thirteen passed together with `playwright test --last-failed`. Total existing browser checks passing: 332.
- Eleven new browser checks passed against the feature-enabled local production build: desktop/mobile invitation dismissal, skippable onboarding, retained preferences after authentication, unchanged seller note on back navigation, image inspection, enable/disable, background completion/reopening, account changes, and stale refresh ordering.
- Three fresh images from the implemented prompt passed the checker and visual review. The full-body and both-shoes requirement is visible in each artifact.
- The shared web/extension view and stylesheet were compared for exact parity.
- Inline review covered compact UI copy, selected preference clarity, keyboard labels, popup height, uncropped previews and desktop/mobile settings placement.

The implementation remains local on `codex/user-model` in both repositories. Production database migration, deployed API/storage behavior, production latency and store rollout are not claimed as verified. No production deployment, migration, listing, email or store upload was performed.
