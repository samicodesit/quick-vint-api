# Generation cost and fidelity implementation plan

> Execute inline using superpowers:executing-plans. No delegation or deployment.

**Goal:** Test cheaper text options within $1.6110951 remaining and close verified photo fidelity gaps without degrading other items.

**Architecture:** Preserve the current text prompt during matched evaluation. Photo plans determine supported surfaces. Existing clients require two photos, so an unsupported rear is replaced by a second front-facing view using the same front pose. All selected product references reach the checker. Generation and checking explicitly compare garment proportions against the product rather than base clothes.

**Tech Stack:** TypeScript, Vitest, existing photo jobs and mobile draft client, private Node QA harness.

**Spec:** Owner-approved generation-engine review in workspace `qa/generation-engine-review.md`, latest instruction to test cheaper text models and fix photo gaps without deployment.

## Constraints and review focus

- Combined historic conservative allowance plus new calls must stay at or below $5. Reserve before each call; preserve unknown call allowances. No automatic provider retries.
- Keep current text model selection until cheaper output passes source-photo review. No new seller facts UI.
- Front-only clothing must finish with two supported front-facing views and no rear setup or edit.
- Real front/back evidence and collages retain both outputs. Backpacks retain their appropriate rear pose.
- A failed view remains a retryable failure. Existing two-photo consumers remain compatible.
- Existing saved jobs, retries, source retention and stale attachment checks must remain safe.
- Show rendered desktop/mobile draft placements if photo-count behavior changes.

## Tasks

1. [x] Build private paired text evaluation: frozen current prompt, identical ordered image hashes/detail, GPT-5.4 baseline, Sol standard and GPT-5.4 mini. Reuse retained apparel, shoes, media/manuals, book/game and numbered-mark originals. Record usage, tier, cost, duration and every result. Review against source images and predeclared facts, not judge scores alone.
2. [x] Add failing reference/view/worker regression tests. Implement `photoView(plan, slot)` in `utils/listingPhotoGeneration.ts`; use it for edit/check prompts and worker pose selection. Preserve two-photo attachment throughout existing clients. No invented rear fallback.
3. [x] Pass all selected references to checker with explicit labels. Replace vague construction guidance with concise relative sleeve/hem rules in edit/check prompts. Test known bad crops/sleeves/decoration and valid controls using retained candidate images within the same budget. Regenerate only a targeted case if it changes the conclusion.
4. [x] Run targeted tests, full `npm run verify:production`, relevant browser/DB contract checks, and rendered preview. Reconcile budget and write results. Commit locally, no deployment.

Ruling: Keep two photos and use another supported front view when rear evidence is absent. The released extension rejects single-photo responses. This avoids a cross-repository/client release dependency and preserves existing output quantity; it does not save the second edit cost. Repeated front/back indices require explicit classifier evidence of a shared collage before generating a rear.

## Acceptance evidence

- 60 matched text calls on 12 items and 50 original images, including Luna low/high as additional cheap candidates. Mini and Luna rejected for source-grounded factual regressions. Same-model Sol standard selected locally, with the account split and text prompt unchanged.
- Ten retained checker controls matched expectations. Five final fresh photo outputs passed, including cropped front/back, plain dress back, supported front-only variation and a full-length control. Failed intermediate outputs retained, not excluded.
- Full production gate passed: lint, types, build, format and 1,577 tests. Three opt-in generation browser cases passed separately; 19 unrelated optional auth/onboarding cases remain unrun. Photo browser flow and disposable native PostgreSQL rehearsal passed.
- Combined conservative budget USD 4.4898445 of USD 5. No unaccounted new calls. Local desktop/mobile before/after draft previews inspected.
- Detailed private evidence: workspace qa/cost-fidelity-results.md and qa/remaining-budget-ledger.json. No deployment. Commit locally after final diff review.

Ruling: share a small construction object from the existing classifier rather than adding another model call or broad prompt paragraphs. Standard text service removes the Fast premium but may increase latency. Do not substitute cheaper text models generally until they pass factual review.

## November 6 release follow-up

All 22 opt-in browser cases are now included in the complete production gate.
The older style-login tests were corrected to skip the existing optional model
preferences step when the model feature is enabled, then assert sign-in.
No product behavior changed. Lint, types, build, formatting and all 1,599 tests
across 187 files passed, with none skipped. This supersedes the earlier 19-case
coverage limitation. Origin/main remains 629c75a; the release is a fast-forward
and needs no database migration. No additional paid calls or deployment.
