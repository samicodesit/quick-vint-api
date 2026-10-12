# Draft model Fast pilot

The owner authorized a production pilot on October 12, 2026. Use GPT-6.1 Sol
Fast for a stable 50% of authenticated accounts, both existing and new, with
high-detail images, low reasoning, a 1,000-token output cap, strict listing JSON
and cache writes disabled. The existing system/user prompt text is unchanged.
The remaining accounts use GPT-5.4. Preserve the pinned internal style-test model.
Assignment depends on account ID, never signup age or request mode. Do not
assume 50% of accounts means 50% of calls or spending.

## Rollback

Set `OPENAI_DRAFT_PILOT_PERCENT=0` in the deployment environment and redeploy,
or revert this release through the normal guarded production push. Invalid
percentage values disable the pilot. Do not change credentials. Do not silently
retry incomplete output on another model: the existing failure path refunds
the customer reservation. Deployment environment changes require a new deployment.

## Evidence and review

The controlled audit used ten real listings and 43 photos, averaging 4.3 photos
and never exceeding five per listing. Standard Sol Responses took a median
6.98 seconds versus Fast 3.90. At the selected-image rates, Fast cost USD17.80
per 1,000 drafts versus USD8.96 for standard Sol. These are model response
times and selected-image costs, not end-to-end timings or production forecasts.

A read-only October 1 through 12 production check found 472 priced GPT-5.4
calls with photo counts: mean 5.79, median four, 80 calls with six to eight
photos and 98 with more than eight. Current model cost for the six-to-eight
group averaged USD0.02522 per call. Sol Fast cost for these larger photo sets
has not been measured. The current monthly bill projection already includes
large uploads, so do not multiply that projection again by the test-photo ratio.
The owner approved shipping the controlled pilot while investigating this gap.
No additional paid test generations were authorized for release verification.

Every new generation logs `draftModelPilot`, `openaiImageCount` and model-call
duration in the existing request metadata. Pilot responses also log actual
service tier, cache writes, response status/ID and actual returned model. Cost
views price the actual service tier, not the requested tier. Missing tier
metadata yields unknown cost instead of silently using Standard prices.
Token output includes billable reasoning tokens. No database migration is needed.

Review after the first 50 successful real pilot drafts. Include failures from
the same period rather than counting successes alone. Report distinct sellers,
language and request-mode coverage, photo-count groups (one to five, six to
eight, nine or more), estimated cost, cache writes, service-tier downgrades,
model and endpoint latency, and per-user cost concentration. Compare concurrent
control traffic within similar photo-count groups. Missing groups remain
untested. A few heavy sellers are not 50 independent examples.

Inspect generated copy and retained image evidence where available. Sanitized
image URL summaries, JSON validity and HTTP success alone cannot verify item
facts or prove retention gains. Missing source images limit factual review.
Do not generate replacement images or extra drafts to fill those gaps. Never
publish a marketplace listing or create a fake customer for QA.

Use the scheduled read-only follow-up to report meaningful failures or a
material cost increase before the threshold. It must stay quiet while evidence
is unchanged or non-actionable. No automatic expansion, deployment, prompt
editing or new generation calls are authorized by the follow-up. At 50 successes,
report one recommendation to the owner and pause the follow-up after recording
the review. Expansion beyond 50% requires a new decision.

Local audit evidence lives under
`/home/mests/projects/autolister/reports/draft-model-audit-2026-10-12/`.
