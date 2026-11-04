# Model-photo reliability investigation, 2026-11-04

Status: local candidate, not deployed. Customer images were explicitly authorized for private testing. No listings were published, customer models replaced, customer jobs retried, or customer messages sent.

## Historical impact

Two newly active accounts had 12 listing-photo jobs: three attached pairs and nine failed jobs. Rear-pose preparation jobs are excluded from this count. This small cohort is not a population-wide failure rate.

The nine failures include overlapping problems:

- A knitted hat was classified as a handbag. A neck warmer was classified as a top. A nightdress was admitted despite the intended exclusion.
- Generated garments changed pockets, garment length or construction.
- Some source/check stages remained marked running after the overall job failed. The exact historical exceptions were swallowed. Narrow Vercel queries for both the generation and photo endpoints did not recover them.
- A real replay reproduced the fidelity check's ten-second deadline, after both image outputs had already been produced.

Manual comparison found a further reference-selection defect: a rear blouse edit received a cropped reference without the whole front view, produced short sleeves, and passed a checker which also lacked that front view.

## Candidate changes

- Classify the actual item type before choosing framing. Explicitly skip unsupported headwear/neckwear and nightwear, and reject contradictory supported item/framing combinations. Existing saved plans remain parseable.
- Shorten the listing edit prompt. Keep identity and pose, preserve the item, ignore adjacent tape measures/hangers, and keep compatible base clothing.
- Supply both available product views and an optional detail to each edit. Supply two product references to validation. Both workers and paid QA use the same reference-selection function.
- Use GPT-6.1 Sol for listing-photo validation. Preserve GPT-5.4 for the existing rear-pose check and the mini model for classification. Retain the stricter validation prompt: a permissive alternative missed an obvious invented stripe and was rejected.
- Give image validation a bounded twenty-second deadline. Do not automatically replay timed-out provider calls.
- Persist sanitized stage failure codes. Preserve unknown provider cost rather than declaring a timed-out call free. Settle source uploads before releasing the job lease, and retain their terminal outcomes.
- Recipe 2 creates less staged models with seeded hairstyles, adult ages, optional small accessories, normal skin details, everyday outfits and household details. Selected gender, hair color, skin tone, height and build remain authoritative. Existing ready models are immutable, and pending recipe-1 operations retain their old prompt.

## Actual paid comparisons

All product inputs were actual retained customer photos. Provider functions were bundled from the checkout. Authentication, customer database writes, attachment and publishing were not part of paid provider testing.

- The old classifier reproduced both the hat-to-bag and neck-warmer-to-top mistakes. The revised classifier skipped both and the nightdress.
- Compared Flare medium, Flare high and Sunburst medium using the blouse. High quality alone did not consistently solve product fidelity. Sunburst was sometimes more precise, but did not provide a consistent enough advantage across the broader sample to justify a default latency increase. Flare medium is retained.
- Compared GPT-5.4 and GPT-6.1 Sol using identical stored candidates and the same retained prompt. Sol caught the invented stripe, accepted the lighting case, and was generally faster in this sample. Both models missed a subtle neckline difference. Validation is not a guarantee.
- Generated a fresh Flare batch covering blouse, pocketed jeans, slim jeans, a dress on a new plus-size model and cropped jeans on a new male model. Four pairs completed; the QA reservation guard stopped the second view of the fifth case. The completed first view was retained, and only the missing view was subsequently generated. This budget interruption is not a product/provider failure and must not be presented as five uninterrupted successes.
- Manual review caught the short-sleeved blouse back after the initial checker accepted it. After the shared-reference fix, both new blouse views had long sleeves and passed. The same checker then rejected the stored short-sleeved negative control using the additional product view.
- New average, plus-size and male base models passed the creation requirements. New plus-size and male rear poses were generated and inspected. Product details can still drift, and the selected examples do not establish a production success rate.

Budget ledger: approximately **$2.64 of the authorized $3**, including a conservative $0.06 reservation for the unknown timed-out call. No further paid calls are planned in this pass.

Measured generation remained roughly 11 to 16 seconds per pair in concurrent view requests, with classification and validation adding several seconds. Warm full photo readiness was generally around 20 to 25 seconds in these tests; initial rear preparation adds time. The earlier 14 to 18 second expectation is not supported as a reliable ceiling. Typical tested pair API cost was approximately $0.09 to $0.13, depending on reference size and cache hits. Extra whole-view references can increase input cost.

Private raw fixture/usage evidence is in `/tmp/model-real-qa-nov4`. Public source must not contain the customer images or credentials. Finished review previews are copied to the owner's visualization workspace. Keep originals private and remove disposable fixtures after the active investigation/review.

## Deterministic and browser verification

- Red/green regressions cover unsupported category mapping, inconsistent framing, two-view reference delivery, precise cost accounting, failed-check diagnostics, accepted-view preservation and source-upload failure settlement.
- The first full suite hit two PGlite setup/test timeouts with unbounded parallelism. Both passed alone, and the full suite passed with two workers. The candidate bounds Vitest concurrency to two instead of weakening test deadlines.
- The local headless web journey used real generated assets with fixture API/auth responses. It exercised editable text during photo work, failure, explicit retry, pair insertion before originals, downloaded blob persistence across reload, reduced motion, model settings, keyboard dismissal and desktop/mobile layouts. No production telemetry or marketplace requests were sent.
- Final `npm run verify:production` passed lint, types, the build, formatting and 1,555 tests across 182 files. The standard suite skipped 22 opt-in browser tests; the separate real-asset local browser journey passed before and after at desktop/mobile widths. Production delivery and natural customer outcomes remain unverified until an authorized deployment.

## Release limits

Backend changes apply to both clients without another extension package. No user-visible copy or localization keys changed. This pass did not repeat authenticated Vinted uploads, because the extension uploader was unchanged. Customer source-image retention prevented replaying the older male hoodie inputs. Five selected items do not establish quality across every supported category, skin tone or build.

Do not describe this work as perfect, a guarantee of garment fidelity, or production recovery. Keep the two model-photo incidents open until actual delivery and attributable outcomes are verified.
