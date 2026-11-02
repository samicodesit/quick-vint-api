# Shared translations QA, 2 November 2026

Status: verified local implementation. Nothing has been
pushed, deployed, packaged or submitted to an extension store for this change.

## Boundaries reviewed

The canonical common catalog contains 24 messages in all 18 supported locales.
The existing 21-message billing catalog is now generated into both bundles.
The shared model component has one canonical copy in the web repository, mirrored
by the same sync command. Six of its generic actions use the common catalog.

Common translations were removed from the original per-screen translation rows.
Web initial copy, onboarding, extension listing settings, seller-note actions,
model controls and pause dialogs consume explicit semantic bindings. A regression
changes one Dutch source value and verifies both generated consumers update.

Context-specific words remain separate. Tests pin the web `New` action to
`Artikel toevoegen`, the model feature badge to `Nieuw`, the extension generation
action to `Genereren`, and the web action to `Concept genereren`. Compact web
format labels and the extension's paragraph labels also remain distinct.

Every migrated onboarding value was compared with its previous value in all 18
locales; those values are unchanged. Review covered meaning, compact copy, user
content boundaries, placeholder preservation, script order, offline execution,
Czech aliases, default-language fallback and the absence of pricing/API changes.
No subagents were used under the owner's routing policy.

## Verification record

- Web production gate: lint, types, build, formatting and 1,486 tests passed;
  20 opt-in browser tests remain skipped.
- Extension unit suite: 171 passed. Browser verification: 442 distinct tests
  passed across the complete run and the matched-backend reruns below. Three
  existing conditional checks remain skipped: two opt-in incident reproductions
  and an admin test whose fixed sibling lookup is unavailable in this workspace.
- Extension production build and paired translation integrity check passed.
- Targeted generator, catalog, model, listing and billing checks passed.
- The existing 14 popup billing browser tests and eight model/funnel browser
  tests passed after loading the shared dependency.
- Eighteen new browser tests exercised the localized pause path and preserved
  seller-authored title and description values.
- Red/green checks covered source synchronization, missing locales, changed
  placeholders, stale artifacts and refusal to write into a non-extension folder.
- A further red/green check edits canonical English common and billing text and
  verifies the real web and standalone uploader consumers use it. It also pins
  local English variants to their own wording. This caught and removed the
  previous blanket English-source shortcut for shared messages.

The installed Playwright runner cannot initialize with Node 22.17.1 because its
module resolver expects a different conditions interface. The existing installed
Node 24.21.0 runs the same tests. No product code or test exclusions were added
to work around that environment issue. Unit tests and the focused browser
baseline passed before implementation; the broad baseline run was stopped after
confirming the runner worked, with the complete suite reserved for final QA.

The initial complete extension browser run reported 419 passes, 12 failures and
14 conditional skips. Its implicit sibling API path resolved to the unrelated
`quick-vint-api-orion` checkout. All 12 phone recovery checks passed without
product changes after pinning `AUTOLISTER_API_PATH` to this task's backend.
The matched-backend batch report and ten desktop/mobile model checks then passed
as well, bringing distinct passing browser checks to 442. The model test URL
was also corrected to the local server origin after an initial `/app/app` setup
error. The initial full command's failure is not represented as a successful
single-command gate; the matched reruns and production build complete the check
record. No unrelated sibling checkout or test-exclusion policy was changed.

## Rendered evidence

The actual web build and extension source were rendered through local fixtures.
The extension preview reuses the checked-in marketplace HTML and Chrome API
mock from the deterministic extension suite. Before views use the extension's
base commit; after views use this checkout. Services and generation were mocked.
There were no real marketplace actions, customer emails or payment operations.

The extension pause dialog was captured in all 18 languages at 390 by 844 pixels.
Every dialog fit within the viewport without horizontal overflow. Dutch settings
and pause dialogs were inspected in both apps at mobile and desktop dimensions.
The settings capture confirms shared seller-note terminology while retaining
the distinct format labels and layouts.

Screenshots, snapshots and review layouts:

`C:/Users/Sami/.codex/visualizations/2026/11/02/01a19ccc-1ea4-7581-8a26-f64e3d7f1bd6/shared-translations`

Fixture source and the final compact check record:

`/home/mests/projects/autolister/ops/evidence/shared-translations-2026-11-02`

## Limits and release

This is a consolidation of shared translations, not a complete extension
localization audit. Marketplace-specific notifications, tutorial copy and
campaign text retain their own catalogs. Existing language-selection policies
remain different where the two apps already choose UI language differently.

The extension bundles these translations and needs an extension release for
installed users to receive them. The web app needs its own deployment. No version
bump, ZIP, upload, store submission or deployment was performed by this task.
