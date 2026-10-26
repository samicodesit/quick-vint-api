# Acquisition report repair, October 26, 2026

The 90-day admin attribution report stopped after the first 1,000 account log rows, including unrelated events and preflights. Generation evidence beyond that page was omitted. Claims requested 10,000 rows in one call even though Supabase defaults to a 1,000-row response limit, which could silently omit claims. Offset reads also lacked a stable unique order.

The repair paginates compact fields with stable primary-key ordering, filters successful generation POSTs in the database, and limits UUID filters to 100 accounts. It caps each dataset at 10,000 returned rows across batches and the whole request at 40 database queries. Reaching a cap returns `completeness.truncated=true`; query errors fail the report. The response includes query/row counters. No schema migration, background job, model call, new service, GA4 event or payment mutation is introduced.

## Read-only comparison

Executed the actual baseline and repaired handlers locally against production Supabase. The harness permitted only GET requests to that project's REST endpoint. It fetched no image, prompt or generation-output bodies. Both handlers used the same report end time, 2026-10-26T21:36:21.408Z, and 90-day window. These are client-claimed acquisition cohorts, not independently verified platform attribution.

| Result                           | Baseline main | Repaired |
| -------------------------------- | ------------: | -------: |
| Claims                           |           121 |      121 |
| New attributed signups           |           111 |      111 |
| Activated attributed signups     |            10 |       95 |
| Google-claimed new signups       |            94 |       94 |
| Google-claimed activated signups |             9 |       81 |
| Current paid profiles            |             6 |        6 |
| Truncated                        |           Yes |       No |
| Database requests                |             4 |        5 |
| Response body bytes across reads |       252,434 |  312,930 |
| Observed local handler time      |       1,147ms |  1,967ms |

The repaired handler read 121 claims, 419 recent profiles, three older claim profiles and 1,272 successful generation rows. One timing sample is not a latency guarantee. Limits bound network reads and returned rows, not the database planner's internal scan cost. Existing migrations define account/date and generation/date indexes; live installation and EXPLAIN were not rechecked for this repair.

`activePaidProfiles` remains current entitlement, not new payments or revenue. This repair does not add the proposed full source-to-renewal scorecard, identify first-ever buyers, fix historical attribution gaps, exclude every internal account, or populate GA4 revenue. Keep those distinctions when interpreting the corrected activation counts.

## Verification and review

Five endpoint regression tests failed against the old implementation and passed after repair. Further tests cover the exact 40-query stop and the zero-claims fast path. Existing authentication and schema-unavailable handling remain covered. An independent read-only reviewer checked correctness, resource bounds and scope, and independently ran the targeted suite.

The work is isolated on `codex/acquisition-report-repair`, based on main `4ad2480`. It is not deployed. Production release requires the existing verification gate and owner approval under workspace instructions.

The first full gate passed lint, type-check, build and format, then found one dated fixture in the existing event tests: its fixed October 21 event is now too old. Reused the existing main-checkout fixture correction, which captures one current timestamp for both request and expectation. No event ingestion behavior is changed. The shared attribution helper preserves the pre-existing 900-account batching for user-list enrichment, so the smaller report batches do not add requests to that screen.

Final verification: `npm run verify:production` exited 0. Lint, type-check, production build and format check passed. Tests: 1,115 passed, 13 opt-in browser tests skipped, zero failures (139 passing test files). Independent reviewer accepted the final batching and timestamp-fixture changes with no remaining blockers. No production push occurred.

Supabase references: [pagination range](https://supabase.com/docs/reference/javascript/range) and [default select row limit](https://supabase.com/docs/reference/javascript/select).
