# Photo evidence and acceptance implementation plan

> Execute inline. The user authorized preparing fixes and free regression checks. No delegation, paid calls or deployment.

**Goal:** Preserve useful per-view product references and require explicit product comparisons before accepting a generated image.

**Architecture:** Extend the existing classification result with bounded front/rear detail indices. Both generation and validation receive the selected evidence. Keep the current generator, current realistic model references and bounded manual retry. Validate structured shape, construction and decoration comparisons in the existing checker call. Share framing and clothing instructions across first attempts, corrections and validation.

**Tech stack:** Existing TypeScript worker, Responses/Image APIs and Vitest. No new dependencies or API calls.

## Evidence and scope

The retained pocket-jeans case selected a size label as its only detail even though a clear zip/pocket close-up existed. Supplying that close-up manually did not reliably fix generation and the checker falsely accepted one result. Reference selection alone is therefore insufficient. The current checker returns only defects and explicitly permits wider framing; the generation prompt requests tighter category crops. The full-body rule removes only covered base clothes, allowing trousers beneath a dress while its rear view has bare legs.

This patch prepares testable contracts. No claim that model quality is fixed is allowed without new real-image tests. All paid evidence from the prior round remains valid only for the prior configuration.

## Tasks

- [x] Add failing tests for per-view references, legacy fallback, invalid indices and plain-back isolation. Implement optional `viewDetails` in plans and require it for fresh classification. At most four distinct product images per view; never silently append every upload.
- [x] Add failing tests for missing, malformed, mismatching and unverifiable comparison evidence. Require shape/construction/decoration observations in the same checker response when product references exist. Empty defects alone must not override a mismatch. Keep rear-pose checking independent of product comparisons.
- [x] Add failing tests for shared framing/clothing rules. Keep coat layering valid, remove base trousers from dress outputs, preserve sale-item crop on correction, and reject clearly wrong framing. Do not change the environment recipe or replace saved models.
- [x] Verify worker integration for first attempt and bounded correction. Confirm accepted slots, source ownership, call counts and model cost accounting remain intact.
- [x] Run targeted tests and the complete production verification gate without pushing. Record exact proposed paid comparisons and a conservative budget. No paid tests in this turn.

## Follow-up real-image gate

First replay the known bad and good candidates against the new checker, including zipped-pocket false acceptance, short sleeves, legitimate folds, plain rear, bags and shoe crop. If the bad pocket is accepted or good controls are rejected, stop before generating more images. Then run paired fresh views of pocket jeans, dress and footwear and regression items blouse, plain jeans, cropped jeans, coat and tote. Compare every result to all original photos. Record costs, latency and failures; reject the candidate if quality or unnecessary retries worsen. This requires separate approval of a concrete bounded test budget.

## Execution record

Free verification passed: 84 targeted tests, then the complete gate with 189 files and 1,647 tests, all four browser suites enabled. No paid call or deployment. Local image appearance and actual cost/latency of the new configuration remain unverified.

Ruling: the prepared paid manifest uses the eight retained items (including the football shirt); no independent coat fixture exists in this set. Coat layering has code-contract coverage only and must not be described as real-image verified.

Ruling: product observations precede defects in the response schema. Structured output key order follows schema order according to the [provider documentation](https://developers.openai.com/api/docs/guides/structured-outputs). This makes the evidence visible before the defect verdict; it does not guarantee correct observations.

The offline manifest is `qa/photo-evidence-test-plan.json` in the Windows task workspace. It freezes source and image hashes, six retained checker controls and eight current-model cases with 56 originals. Proposed next-round cap: $2 total, using the remaining $0.2867204 first; additional authorization needed: $1.72. Estimate: about $1.50. Stop before fresh generation if the checker controls fail. Nothing in this plan authorizes those calls.
