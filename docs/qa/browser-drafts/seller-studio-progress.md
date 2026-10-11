# Seller Studio implementation and QA

Source: direction-1-full-workflow.png, with direction 2's batch rows and pause/resume. User approved implementation and explicitly requested final QA. Work stays in the port-4340 preview checkout. Existing uncommitted changes are preserved. No deployment, live marketplace or delegated agents.

## Work ledger

- [x] Complete per-item settings contracts, backwards-compatible old drafts and exact generation payloads.
- [x] Shared settings UI, saved defaults, batch inheritance and per-item overrides.
- [x] Seller Studio typography/surfaces and clear single/batch entry, grouping, review and queue.
- [x] Deterministic browser coverage for mixed settings and failure/recovery.
- [x] Source-versus-rendered visual QA at 360/390/768/1440.
- [x] Final production gate.

Ruling: Extend existing JSON settings and the shared generation path; do not create a separate service or worker. Old four-field drafts retain their previous extras-off behavior. New settings are optional at the stored contract boundary and normalized at read time, avoiding a destructive migration.

Initial targeted baseline: existing six contract/generation tests passed. Added feature-parity tests failed because full settings were rejected, normalization was missing, and generation forced emojis/hashtags off. Implementation will make these tests pass before visual work.

## Acceptance evidence

The feature tests passed after implementation. The full browser journey passes with no page errors, alongside full-settings, UI accessibility and six review regressions (Listed retry, navigation, grouping navigation, later pages, scroll restoration and sign-out). The full-settings case exercises mixed per-item settings, inheritance, saved defaults, excluded-note reload, invalid-note correction, save failure and pause/resume.

Visual QA reviewed all 16 contact sheets for 46 named states and 178 captures. The source comparison and post-fix evidence are in the root [design QA report](../../../design-qa.md). Remaining device/live-service limits are explicitly recorded there. Browser 200% native zoom was not established; only CSS zoom passed.

The first production gate stopped at formatting of newly copied QA JSON evidence. After formatting, the complete gate passed on October 9, 2026: lint, TypeScript, feature-enabled Astro build (132 pages), formatting and 116 test files / 828 tests. This includes the relevant mobile-web, draft persistence and generation tests. No production deployment occurred.
