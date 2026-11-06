# Targeted photo correction

Local candidate only. No deployment approval. Photo release remains on hold.

## Evidence and change

The printed dress rear repeatedly shortened the sleeves, including after
opposite-surface reference isolation. The rejected sleeve endpoints resemble
the base outfit, but that does not establish the generator's internal cause.
The confirmed recovery gap was that a quality rejection discarded its evidence:
the existing manual retry regenerated from the base with the same prompt.

Retain a private rejected candidate and bounded checker evidence for clear
product construction, decoration or color defects. The existing single manual
retry edits that candidate using original product references and the original
model reference. Its short correction prompt is separate from the unchanged
first-attempt prompt. The final full check always uses original evidence.
Anatomy/mixed defects keep the existing fresh-generation retry. No automatic
extra calls, retry allowance change, new model, UI change or database migration.

Successful slots are untouched. Correction objects are accepted only for the
same user/job/slot's first-attempt storage key. Missing candidates fail closed.
Invalid or absent evidence falls back to existing behavior. A failed correction
remains rejected and does not retain another correction attempt. The public
status endpoint continues to expose image URLs only for a ready job.

## Verification on November 6

- New correction and worker tests were observed failing before implementation,
  then passed. Coverage includes original evidence, retained ready slots,
  rejection, failed upload, foreign/missing keys and malformed/mixed findings.
- One real Flare correction of the retained failing dress restored the sleeves
  to the wrists while preserving the plain back. Root inspected the result and
  the unchanged Sol full checker accepted it. No independent reviewer was used
  in this follow-up. This single result does not prove general reliability.
- Edit USD 0.041620 in 15.434 seconds; check USD 0.010884 in 4.293 seconds. This
  is retry overhead, not a whole-listing price or first-attempt time.
- Full `npm run verify:production`: 188 test files, 1,618 tests passed with all
  four optional browser suites enabled. Lint, types, build and formatting passed.
- Separate photo browser journey passed. Actual local desktop/mobile draft
  previews rendered without page errors. Preview copy is fixture text.
- Two initial browser runs lacked required local feature flags/server. The
  complete fixture setup was restored, with no app code changes, before the
  full successful run. The exact runner is retained in workspace QA.

## Remaining acceptance and budget

Conservative cumulative paid QA is USD 4.7592605 of USD 5, leaving USD 0.2407395.
Request up to USD 3 additional before further paid coverage. Expected additional
spend is about USD 2: up to 32 image/check pairs plus classification/check-only
controls, at observed rates. Preserve unknown-call reserves and stop at the cap.

Test eight retained item fixtures across dress, blouse, cropped/full-length and
pocket jeans, short-sleeved shirt, tote and trainers. Compare old retries with
targeted corrections for identical failed candidates, repeat the dress, include
front-only/shared-view sources, and inspect every result for new defects. Record
acceptance counts, latency and cost per accepted output, including failed calls.
Do not deploy until this visual regression coverage and release checks pass.

This recovery change does not improve first-pass success by itself. Do not call
the entire photo engine fixed, claim savings or upgrade all image calls based
on this one correction. Private evidence, budget and previews are in the main
workspace's `qa/photo-correction/` directory.
