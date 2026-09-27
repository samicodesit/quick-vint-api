# Local 20,000 item performance fixture

On 27 September 2026, `npm run ops:test:perf` loaded one isolated PostgreSQL 12 workspace with 20,000 distinct physical items. The test ran `ANALYZE` and then `EXPLAIN (ANALYZE, FORMAT JSON)` for three representative indexed reads. These are single-run database execution times, not warm staging HTTP p95 or full UI latency.

| Query                                         | Rows | Planning | Execution |
| --------------------------------------------- | ---: | -------: | --------: |
| First 100 items by creation time              |  100 | 2.078 ms |  0.094 ms |
| Page after 19,000 seconds of creation history |  100 | 1.911 ms |  0.112 ms |
| Exact normalized SKU `PERF-19999`             |    1 | 2.060 ms |  0.056 ms |

The test creates and drops a disposable `ops_test_` database. It does not download the full inventory into the browser. The 500 ms p95 server/search target, ten-worker contention target and 100 ms physical scan feedback target still need measured staging or device evidence. Re-run on release hardware and keep raw timing output with the gate review.

Inventory page responses now also fetch at most the first available photo per returned item and sign those private derivatives in a batch. The timing above excludes that Storage call and must not be used as full page latency evidence.
