# Shared web and extension translations

## Design and scope

Use a reviewed, explicit set of semantic message IDs for common actions, listing
settings, seller-note placeholder and pause/support copy. The canonical common
catalog lives in this repo beside the existing canonical billing catalog.
Generate identical bundled JavaScript artifacts for the web app and extension.
Both run offline from their own release; no runtime translation download.

A runtime web fetch would couple extension availability to the server. A new
package repository would add publishing infrastructure without improving this
small cross-repo boundary. Checked-in generated bundles fit the existing billing
mirror and can be verified without network or credentials.

Keep compact format labels, generation actions, model feature badges, tutorials,
marketplace actions, onboarding examples and workflow-specific recovery copy
separate. Equal English words do not establish equal meaning. In particular,
model `New` must never resolve to the web app's `Add item` alias.

## Plan

- [x] Add regressions for one-source updates, stale bundle detection, locale and
      placeholder validation, offline execution, and preservation of context variants.
- [x] Add the canonical common catalog and deterministic generator. Export common
      and existing billing data to both runtimes, with schema and content hashes.
- [x] Wire explicit consumer mappings, remove migrated translation values, and
      include the bundled runtime before consumers in real pages and test fixtures.
- [x] Add generation/integrity commands and required build checks. Document one
      edit/sync/check workflow and the independent web/extension release requirements.
- [x] Run targeted checks, complete local verification and inline review. Capture
      the affected real UI in local deterministic fixtures at desktop/mobile sizes.

## Review focus

- All 18 locales, including `cs`, `cz`, regional aliases and English fallback.
- Identical source text with different meaning or space constraints stays local.
- User text, protocol values, storage keys, pricing and limits remain untouched.
- Common scripts load before every consuming browser entry point; no fetch needed.
- Cross-repo check catches a stale generated copy before a coordinated release.

## Release boundary

This task implements and verifies the consolidation. It does not submit an
extension update, bump its version or deploy the web app. Existing installations
receive the new bundled strings only through a later extension release.

Execution and review are inline under the owner's no-delegation policy. The
native worktree tool could not target the nested repositories, so isolated WSL
worktrees were created from each repo's current `origin/main`.
