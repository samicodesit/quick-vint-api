# Background auth alert policy

Background refresh alerts previously relied on three rotating examples. The
endpoint now retains bounded original operation/client references so the policy
can check the complete retained cohort. Login, session renewal and credentials
are unchanged.

The policy keeps unknown or foreground failures on the generic alert path. It
alerts on an attributable blocked action, persistent renewal failures or failures
across several browser clients. Session renewal is not Generate recovery.

## Verification

- Causal endpoint regression failed with zero of seven original failures retained,
  then passed with seven retained and the matching renewal correctly assessed.
- 114 targeted tests passed. Full production gate: 1,422 passed, 20 skipped.
- The unchanged SQL reuses the October 19 native PostgreSQL concurrency evidence.
  Fresh endpoint and PGlite tests exercise the current application and migrations.
- Four exact email variants were inspected at desktop and mobile widths. Their
  labeled links target the existing admin issue route. No test email was sent.
- Live function bodies and existing service-role-only ACLs matched the baseline.
- Independent review accepted the scoped patch and corrected rollout ordering.

## Rollout order

1. Build each of the four indexes concurrently, outside a transaction, and verify
   its exact definition, validity and readiness. Check for equivalent indexes.
2. Deploy and verify the application using the normal production push pipeline.
   It remains compatible with the old database functions.
3. Apply the policy migration in its short transaction with local lock and
   statement timeouts. Preserve the existing function ACLs.
4. Verify exact live function bodies, ACLs and natural claim timing. Do not create
   production test incidents or send test email.

Do not apply SQL before the application. The old renderer ignores `authPolicy`
and could incorrectly label a persistent cohort recovered from one sample.

The policy uses the existing shared diagnostic lock and three-second dispatcher
deadline. Check natural claim latency and backlog after rollout. Historical
API-log cleanup backlog is separate from incident receipt cleanup health.

Detailed evidence is in the parent workspace at
`ops/evidence/auth-policy-rollout-2026-11-02/`. Prior native evidence remains at
`ops/evidence/auth-email-policy-2026-10-19/`.
