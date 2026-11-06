# Photo evidence candidate, 6 November 2026

Status: local implementation prepared. Not deployed. Real-image verification pending approval.

## Changes

- Fresh classification returns front/rear construction detail indices as well as a shared reference. Each view receives at most four distinct product references, with its own close-up immediately after the target view. Saved legacy plans retain their old reference order. Source bounds, absent backs and separate plain-back isolation are validated.
- Product checks now return shape, construction and decoration observations before the defect list. Missing or malformed evidence cannot pass. A mismatch becomes a defect even if the model separately returns an empty defect list. Unverifiable product details fail acceptance and are not eligible for targeted correction.
- First attempts, corrections and checks share framing and outfit instructions. Dress/outfit rules remove visible base layers; coats retain normal layering. Clearly wrong framing has its own defect code.
- No extra provider call, automatic retry, new image model, environment recipe change, customer-model replacement or customer-facing UI text. At most one additional product input and the longer checker response can increase per-call cost. Actual costs require the paid evaluation.

## Verified

Failing tests reproduced the missing-reference and inconsistent-verdict problems before implementation. The final focused suite passed 84 tests. The full production gate passed lint, type checking, build, formatting, 189 test files and 1,647 tests with all four optional browser suites enabled. Worker coverage includes actual checker-response parsing: a mismatching candidate remains private, a previously accepted slot remains untouched, and retry calls remain bounded.

No money was spent this turn. Previous test spend remains $2.7132796 of $3; $0.2867204 remains. No new photographs were generated, so there is no new rendered visual result to approve. Previously displayed photos must not be represented as output from this patch.

## Required before release

Six retained controls first: the false-accepted pocket image, short sleeves, missing shirt patches, a full-body shoe crop, a correct dress rear and a correct shirt rear. Assess product fidelity separately from framing so rejecting a bad pocket merely for wide framing cannot hide another missed zipper.

Only if those pass, run fresh classification and two views for the retained eight items, using the current version-2 model references. Inspect selected source photos before generation and compare outputs with all originals. Stop on regressions or the hard budget cap. Do not use old saved model fixtures for final-setup examples.

The proposed full round has a $2 cap, including the remaining budget, and needs $1.72 additional approval. The approximately $1.50 expected spend is an estimate, not a verified new per-listing price. No claim of improved output quality, unchanged speed or reduced overall costs is supported yet.

# Paid verification update

The subsequent approved evaluation failed its visual acceptance gate. Five of six retained controls passed; the shortened-sleeve dress was accepted. Two diagnostic checks with the original measured sleeve still missed the expected shape mismatch and rejected the good dress over an unresolved faint seam. Eight checker calls cost $0.126622, leaving $1.873378 of the $2 round cap. No fresh generations, deployment or application-source changes followed. See the Windows task workspace `qa/photo-evidence-evaluation/results.md` and `controls-review.json`, which explicitly blocks fresh generation. Earlier passing code checks do not establish visual quality.
