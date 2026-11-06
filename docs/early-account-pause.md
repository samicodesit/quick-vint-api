# Earlier account pause checks

Production deployment approved by the owner on 2026-11-06, subject to independent review and the release gate.

The existing shared-IP detector is reused without changing its lookback, evidence threshold, exemptions or database-error behavior. Independent review identified and corrected existing paid-access blind spots: purchased credits and unexpired paid access are excluded, and the final update rechecks live entitlements before writing.

- Web usage refresh returns a newly detected pause immediately.
- The shared model endpoint checks before GET can resume queued work, before invitation, creation, retry or enabling. Both web and the current extension use this endpoint.
- Disabling and dismissing stay available and no longer resume queued generation.
- Direct photo creation, resume and retry requests check before admission or worker dispatch.
- Model workers reuse the existing photo access check before every claim, including retries and cron recovery. This also respects the existing emergency brake and payment suspension checks.
- Existing response shapes and client error handling are reused. No new UI copy, migration, extension package or customer communication is required.

Verification: regression tests first reproduced the gaps. Added real HTTP/SQL regression coverage for purchased credits and concurrent subscription, credit-pack and paid-access payments; all 13 abuse integration cases pass. Full `npm run verify:production` passed: lint, TypeScript, build, formatting and 1,676 tests across 189 suites. Twenty-two opt-in browser tests remain skipped. Existing exemption and ordinary shared-IP tests pass. No live accounts were paused or provider work invoked for verification.

Independent review: initial review blocked release on credit-pack re-pausing and concurrent-payment races. Both fixes passed re-review. Remaining limitations: existing shared-IP rules can have false positives; the extension can retry a blocked model-status request every three seconds without generating images. The final gate must pass before the approved production push.
