# Delayed background renewal evidence

A 1.4.31 browser silently renewed at 18:49:54 UTC. Queued failures arrived
afterward and produced a persistent-renewal email at 18:57:52. The observer's
first failure did not arrive until 19:17:51, immediately before the existing
policy finally sent its recovery notification. This is an alert correlation
defect, separate from the extension 1.4.32 refresh-overlap correction.

The policy now also accepts a self-contained silent-renewal observation when
its authenticated owner and browser match the failures, its first-failure
browser and event match, and its bounded episode starts before those failures.
The existing valid source, client version, refresh UUID, outcome, timestamp and
receipt-window checks still apply. This fallback requires signInRequired=false.
It does not establish Generate recovery or change login behavior.

Tests execute the actual PostgreSQL policy using PGlite. The three causal
regressions failed before the correction, then passed. The full 44-test policy
suite also preserves other-account/browser isolation, invalid evidence handling,
post-renewal persistent failures, real blocked Generate actions, budgets and
existing recovery notifications. Production read-only replay at the original
decision time returned three outstanding failures with the baseline and zero
with the candidate, using the actual retained records.

Rollout replaces only incident_prepare_auth_notifications(), using the tested
function body. A guard verifies the previous body hash and existing ACL before
replacement, then verifies the new hash, ACL, owner, SECURITY DEFINER and search
path inside the same transaction. Local lock/statement timeouts bound the change.
No new table, index, permission, auth setting or credential is required. Existing
incident evidence remains intact. The full historical migration is not rerun.

Parent evidence directory: ops/evidence/auth-delayed-renewal-alert-2026-11-02.
The historical network failure's trigger remains unknown; the late first-failure
receipt is now established rather than presumed permanently lost. No production
test incident, customer contact, paid generation or test email is involved.
