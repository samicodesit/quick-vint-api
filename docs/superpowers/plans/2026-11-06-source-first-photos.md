# Source-first photo verification

Execute inline under the user's instruction to fix and test without further design questions. No delegation or deployment. Existing worktree only.

Goal: establish product facts independently of generated candidates, preserve salient details across item types, and test real output within the remaining $1.87.

Architecture: reuse the existing classifier call to record bounded source-only shape, front and rear evidence before choosing references. Persist this in PhotoPlan and share the relevant surface with generation, correction and checking. Keep legacy saved plans compatible. Retain fail-closed malformed responses and material unverifiable details, but explicitly exclude faint seams and unreadable tiny text from material uncertainty. Consolidate duplicate defect codes without dropping distinct evidence. No extra production API calls, retries, models or scene changes.

Alternatives considered: adding more repeated checking instructions leaves candidate-biased source reading intact; an extra source-analysis call adds cost and latency unnecessarily. Reuse classification and replace redundant wording instead.

- [x] Add failing tests for source evidence validation, fresh mandatory evidence, source-only request inputs, surface isolation across prompts and duplicate defect consolidation.
- [x] Implement bounded sourceEvidence in listingPhotoGeneration.ts, simplify the product comparison prompt and consolidate defects in listingPhotoQuality.ts. Preserve rear-pose behavior and legacy jobs.
- [x] Run targeted endpoint/worker tests. Freeze the candidate and run source-only classification on all eight retained items; inspect facts and reference selections against originals.
- [x] Run the same six retained controls with fresh source plans. Preserve the prior failed results. Verify both bad and good dress candidates; never silently change expected verdicts.
- [x] Generate current-reference photos across the eight item types if controls pass. Compare actual results to originals and report failures as well as successes. Reserve costs durably, maximum $1.87 additional from this authorization; no automatic retries.
- [x] Run the full local production verification gate without pushing. Deliver actual new outputs with cost/timing and honest scope limitations.

Final clarification from the user: do not nitpick. Acceptance now targets practical resale quality, with material item/cut/color/main-design errors blocked. Historical strict-crop and tiny-detail failures remain recorded, not silently counted as final-policy passes. Two final paid boundary checks confirmed usable shirt acceptance and shortened-sleeve rejection. Total spend $1.852261. Final full gate: 189 files, 1,656 tests passed. See `docs/qa/source-first-photos-2026-11-06.md` for costs, limitations and the actual output record.

Review focus: front-only items, plain rear of decorated garment, unusual pockets/patches, dress versus coat layers, crop versus anatomy, unknown source facts, legacy plans and accepted-slot retry isolation. Existing contracts cover these; add source-evidence-specific checks where missing. No unseen coat fixture may be claimed visually tested.
