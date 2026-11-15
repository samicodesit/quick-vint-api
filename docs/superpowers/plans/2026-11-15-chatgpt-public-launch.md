# ChatGPT public launch preparation

Goal: prepare approved AutoLister 1.0.2 for ordinary signed-in sellers without changing the approved package or publishing before owner approval.

Architecture: keep the current Supabase OAuth client, delegated role, resource checks and encrypted account-bound handoffs. Introduce `CHATGPT_PLUGIN_ACCESS=public` as an explicit release switch. Absent, private or unknown values retain the existing tester restriction. The existing enabled switch remains required. Public means authenticated AutoLister accounts, never anonymous access.

Approaches considered: publishing the private service would reject sellers; deleting the allowlist would remove a useful rollback control. A deliberate public switch preserves the private default and existing safety boundaries. This implementation choice is made under the owner's request to do the necessary preparation. Production access expansion, deployment and publication require final approval under the workspace instructions.

Constraints: preserve OAuth issuer, audience, client, role, expiry and resource validation; deny OAuth tokens on ordinary APIs; retain account ownership, expiry, photo validation and budgets. No new providers, credentials, billing changes, customer actions or marketplace automation. No UI redesign or approved metadata changes.

## Tasks

- [x] Verify the baseline plugin and consent tests in an isolated checkout of origin/main.
- [x] Write failing tests for a non-tester connecting, preparing and opening their own draft in explicit public mode. Cover private defaults, invalid OAuth claims, missing identity, disabled service and cross-account denial.
- [x] Implement one shared access policy used by connection, MCP validation and handoff routes. Keep private defaults.
- [x] Run targeted tests, then the full production verification gate. Review the complete diff inline, without delegation.
- [x] Record live approval and connection evidence, launch/rollback commands and remaining external checks. Leave production unchanged pending owner approval.

Review focus: anonymous and ordinary bearer tokens cannot impersonate OAuth; wrong clients/resources stay rejected; public mode cannot open another seller's handoff; misspelled settings fail closed; rollback keeps the private testers usable.

## Progress

Base: origin/main 35123ff. Approved package: pluginrel_fbb3be85849c81918ae915739a335f38, version 1.0.2. Portal and live consent confirm the private-access blocker. The saved reviewer credentials were ephemeral and are no longer present. The owner's current browser session was preserved.

Baseline: 42 plugin/consent/database checks passed. Red: three new public-path tests failed with 403/401 as expected. Green: 18 public-access cases and existing auth/transfer checks passed. Full production gate passed, 1,756 tests and 23 opt-in skips. Inline diff review found no remaining material issue in the local change. External deployment, fresh portal scan, live draft transfer and publication remain approval-gated and unverified.
