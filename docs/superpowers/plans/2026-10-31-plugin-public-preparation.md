# AutoLister public plugin preparation

**Goal:** Preserve the simple ChatGPT photo-to-AutoLister flow, prepare review materials, and verify isolation and resource limits without publishing.

**Architecture:** Keep the existing Sites project, App and plugin identity. Sites authenticates ChatGPT users. AutoLister independently uses its current browser session and account-scoped local draft storage. Do not trust a caller-supplied identity on a raw public endpoint. Public conversion is a release gate until the canonical ownership and authenticated ingress path are supported and verified.

**Constraints:** No deployment, invitation, submission, purchase, credential changes or production stress tests. Keep model prompts and keys out of the bundle. Countries: all supported, as recommended after the user delegated this decision. Developer name remains unset until identity verification. Use existing branding and minimal copy.

## Work

- [x] Inspect implementation, current publisher account and current official submission requirements.
- [x] Reproduce stale-account and disposal failures with real LocalDraftStore and fake IndexedDB.
- [x] Guard receiver account identity before defaults, image preparation, writes and opening. Stop disposed receivers.
- [x] Run receiver, storage, worker and SQL cap tests. PGlite used; native PostgreSQL unavailable and Docker not running. No claim of fresh multi-session PostgreSQL verification.
- [x] Prepare listing, required cases, policy additions, source patch and actual rendered local previews. Keep missing publisher/demo/hosting facts explicit.
- [x] Have the fresh independent reviewer retest the candidate. Report readiness separately from local test success.

## Outcome

The final production gate passed: lint, type check, build, formatting, 1,215 tests
passed, 14 opt-in tests skipped. Independent receiver/storage checks passed 22/22.
Desktop and 390px browser flows imported the actual local draft and enabled note
with zero generation calls. A controlled account change rendered the actual
rejection UI in both widths. Auth and transfer responses were local fixtures;
this does not establish two real ChatGPT users' public access.

Prepared materials are in `docs/plugin-submission`. No public upload archive was
created because the current canonical Sites App's public authentication and
submission path is not verified. Publisher verification, reviewer access and a
real ChatGPT recording/case run remain release gates. No deployment or publication.

## Review focus

Account changes in another tab; receiver disposal during image preparation; repeated imports preserving edits; forged origin/window/nonce; concurrent shared reservations and settlement; private Sites identity not equivalent to an unauthenticated public endpoint.
