# Homepage experiment early readout, November 7

Read-only production admin web-app-stats query, days=30. Aggregate export: parent workspace reports/paying-decline-2026-11-07/homepage-experiment-early.json. This is an early snapshot, not the scheduled final result.

| Outcome                                             | A: demo first | B: app first |
| --------------------------------------------------- | ------------: | -----------: |
| Exposed browsers                                    |           286 |          306 |
| Complete seven-day cohorts                          |           275 |          294 |
| Successful drafts in complete cohorts               |            25 |           36 |
| Complete-cohort activation                          |         9.09% |       12.24% |
| Wilson 95% interval                                 |   6.23-13.08% |  8.98-16.49% |
| App click browsers                                  |            49 |           60 |
| Attributed Stripe activations, all observed cohorts |             1 |            1 |

569 of 592 browsers (96.1%) have complete outcome windows; 23 remain pending. B's observed mature activation rate is 3.15 percentage points higher, about 35% relative. This is directional evidence favoring app-first placement, not an established winner. Two attributed payments do not establish a paid-conversion difference. These attributed activations are not all company payments or necessarily lifetime-first customers.

Decision recommendation: use the directional activation evidence to support the already-reviewed action-first design, archive this snapshot, and allow release before November 9 if the owner chooses. Do not label the old experiment statistically won. An early release should record its UTC boundary and mark subsequent observations as affected by the new page. The remaining outcome records can still be retained, with that qualification. The test isolated ordering, not the new free-draft label, SEO titles, or the complete recovery bundle.

Owner decision: proceed with the recovery release now. This frozen snapshot is the accepted early-close readout. The existing admin report may continue accumulating through its original November 9 schedule; it must not be presented as an uncontaminated final experiment after the recovery deployment. No experiment configuration or outcome history is deleted or rewritten.
