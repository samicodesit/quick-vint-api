# AutoLister ChatGPT launch, November 15, 2026

Status: local backend change verified. Approved plugin remains unpublished. No production configuration, credentials, customer data or listing was changed.

## Verified release

- Approval email received November 13 at 19:40:46 UTC.
- Plugin: `plugin_asdk_app_6ae719aa78ac8191927eabfb0a94a54b`.
- Approved version: `1.0.2`, release `pluginrel_fbb3be85849c81918ae915739a335f38`.
- Portal shows Ready to publish, Not published, and no package findings. The MCP tab separately shows Needs attention, endpoint/authentication/domain status unavailable, prepare_item not published and no completed scan since its connection. Approval does not establish a healthy current connection.
- Actual Reconnect opens AutoLister consent and the current signed-in ordinary account receives `This private test is not enabled for your account.` The attempt was cancelled. The browser's existing AutoLister account was preserved.
- Live MCP returns HTTP 401 with its OAuth challenge. Protected-resource metadata, privacy, terms and support return HTTP 200. The support page contains the approved `chatgpt-plugin` anchor. These are availability checks, not a complete seller journey.
- Vercel browser access works. Production project `quick-vint-api`, domain autolister.app, is Ready on main commit `35123ff1b74c29a72abd25a52328a6c9cdcfb32c`, deployment `6PXSiSDuimr8Tw7r7qgyCnxrS9L7`. Project configuration lists the existing private-user, enabled and OAuth-client variables. No public-access variable is listed. Values were not revealed.
- The old local Vercel API credential returns HTTP 403. Use the existing authenticated Vercel browser for the configuration step. Do not rotate credentials just to work around this.

## Prepared backend change

`CHATGPT_PLUGIN_ACCESS=public` admits authenticated sellers through connection, verified delegated MCP calls and ordinary-session draft handoffs. An absent, private or misspelled value retains the private tester allowlist. `CHATGPT_PLUGIN_ENABLED=true` remains necessary. There is no anonymous mode.

Issuer, audience, configured OAuth client, delegated role, resource and expiry checks remain. OAuth credentials remain excluded from ordinary APIs and database access. Draft encryption remains bound to the authenticated seller. Transfer budgets, expiry and photo-source checks are unchanged. The approved package, tool schema and visible screens are unchanged.

Regression evidence: the new tests first failed on the ordinary-seller connection, MCP discovery and prepare/open path. They pass after the change. Eighteen endpoint cases cover those paths, private defaults and rollback, invalid claims, origin restrictions, disabled service, missing identity and delegated-token denial, and another seller's inability to decrypt a draft even if a ledger response supplies its ciphertext. Existing transfer and database-role tests also pass.

`npm run verify:production` passed: lint, type-check, translations check, build, formatting, 1,756 tests passed and 23 opt-in tests skipped. Review was performed inline under the no-delegation instruction. No UI changes were made, so no new visual layout is claimed.

Minimal QA evidence is in the parent workspace `reports/chatgpt-launch-20261115/`: full production gate, redacted live preflight, approved-release screenshot and live access-denial screenshot. The November 1 eight-case rehearsal remains historical evidence, not a November 15 live-flow pass.

## Release sequence after owner approval

1. Confirm this exact approved plugin and the saved all-supported-country targeting. Keep the two old unsubmitted diagnostic candidates unchanged. Do not upload a replacement ZIP or create another plugin.
2. Add production-only `CHATGPT_PLUGIN_ACCESS=public` to the existing Vercel project. Keep the existing enabled switch, tester IDs, OAuth client, callbacks, token hook, secrets and database permissions intact. This setting expands application eligibility and requires the owner's launch approval.
3. Fetch origin/main again and integrate this branch's verified commit into the existing main checkout without carrying unrelated edits. Run `npm run push:production` from main. Require `Repo: quick-vint-api`, `Branch pushed: main`, `main -> main`, then verify Vercel Ready on the pushed commit. Do not use a manual production deploy.
4. Reconnect the existing approved MCP in the portal with the intended AutoLister account, preserving the existing scopes. Run the scan and inspect the actual tool result and current findings. Do not publish with an unresolved connection or tool failure.
5. Exercise the existing non-customer test account: one-photo prepare, automatic photo transfer, saved note applied once, edit and reopen without duplication. Check desktop and phone-width import. Retest rejection of multiple items, direct Vinted publication and wardrobe access. No listing is saved to Vinted and no paid generation or purchase is needed. Record any first-time signup or physical-device step not actually tested.
6. Publish only release 1.0.2 after those checks pass and verify the resulting published status and actual directory link. Test discovery and the public connect path from that link. Do not announce availability before this result exists.
7. Record the final URL and launch timestamp in the sprint QA record. Observe actual new sellers reaching imported drafts and returning; report paid outcomes separately. Promotion, outbound messages and spending need their own authorization and final placement checks.

Rollback: setting access back to `private` (or removing the public switch) and deploying restores tester-only access. Preserve existing tester IDs. `CHATGPT_PLUGIN_ENABLED=false` plus deployment disables all plugin endpoints if needed. Configuration changes affect a subsequent deployment, not an already-running immutable deployment. Do not revoke credentials or change database privileges for this rollback. If already published, stop promotion and record the public availability impact before further release actions.

Official lifecycle reference: https://developers.openai.com/plugins/deploy/submission. Publishing is a separate step after approval; hosted-tool scans are separate from package approval.
