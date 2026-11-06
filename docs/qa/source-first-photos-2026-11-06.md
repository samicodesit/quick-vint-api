# Source-first photo verification

Local changes only. No push or deployment. Final user clarification: judge practical resale quality, without nitpicking small hardware/logo differences or extra framing. Obvious wrong item, cut, main color/design, anatomy and material visibility failures remain blockers.

## Changes

- Reuse classification to record bounded source-only shape/front/rear observations before generation. Select original construction and measurement references; preserve legacy plans.
- Share the relevant observations with generation, correction and checking. Never feed opposite-side decoration as target instructions.
- Consolidate duplicate defect reports without dropping evidence. Keep malformed checks fail-closed and the existing bounded manual retry.
- Check practical product fidelity instead of exact framing and tiny-detail reproduction. No new automatic retries or extra production API stages.
- Explicitly request the standard service tier for Sol. [Provider reference](https://developers.openai.com/api/reference/resources/responses/methods/create) documents default as standard pricing/performance. All measured Sol calls in this round used default already; no measured tier discount is claimed.

## Real tests

Budget: $1.852261 of $1.87. 73 provider requests, including 18 image generations. Eight retained items, 56 seller originals, current version-2 realistic model references. Production users and stored models were untouched.

Source-only analysis correctly identifies long dress sleeves, front-only blouse and tote references, calf-length trousers and the detailed jeans rear. Compact summaries are not exhaustive; original images remain authoritative.

The six original controls initially passed after source-only evidence was added. The broad fresh run exposed excessive crop rejection and small-detail rejection. Earlier results remain recorded, including failures. The user then explicitly clarified the acceptance standard. Final policy was paid-tested on two boundary cases: accepts the usable football shirt despite its small logo variation; rejects the dress with shortened sleeves. Do not describe all original controls as rerun and passing under the final policy.

All 16 first-attempt photos were checked under the preceding stricter policy. The dress front was corrected in one additional attempt. The jeans rear received one additional attempt and still varies in small zipper detail, considered nonblocking after the user's clarification. Manual comparison of all eight items retained item identity, cut, color and main design. Shoe images are wider than requested, but useful as model photos alongside the originals. Exact detail reproduction is not guaranteed.

| Item           | First two-photo attempt, including classification and checking |
| -------------- | -------------------------------------------------------------- |
| Blouse         | $0.126                                                         |
| Detailed jeans | $0.143                                                         |
| Slim jeans     | $0.194                                                         |
| Dress          | $0.127                                                         |
| Cropped jeans  | $0.182                                                         |
| Football shirt | $0.114                                                         |
| Tote           | $0.097                                                         |
| Trainers       | $0.237                                                         |

Mean: $0.152 per two-photo attempt. Tested single-view generation plus check median: 22.4 seconds. Classification median: 6.3 seconds. These were serial tests; production parallel pair latency was not measured. Dress retry cost $0.07077; jeans retry cost $0.062294. Model/image settings were retained. Avoiding cosmetic retries is the intended efficiency improvement, not a newly proven model-price reduction.

## Limits and evidence

Small convenience sample; no universal quality or conversion-rate guarantee. No real coat/backpack fixture in this round. Final quality threshold has two paid boundary checks plus manual review, not another complete paid matrix. Text generation was unchanged. No independent agent review was performed in this turn.

Task-workspace evidence: `qa/material-quality-final/summary.json`, `policy-results.json`, `qa/remaining-budget-ledger.json`, original/final manifests and retained images. Final code verification is recorded in `qa/material-quality-verification.log`. Preview draft text is a local fixture, not a new text-model evaluation.
