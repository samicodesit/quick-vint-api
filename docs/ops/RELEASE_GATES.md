# AutoLister OS release gates

This records local and isolated staging evidence on `feature/autolister-os-build`. It is not approval to deploy to the existing customer production environment. The attached build specification defines 57 automated acceptance scenarios (A001 to A057) and five human or external gates (H01 to H05). `PROGRESS.md` records the task checks. Fixture browser and SQL tests do not prove a marketplace integration.

The rows below cover A001 to A054 by task range: M0 covers A001 to A014, M1 A015 to A021, M2 A022 to A035, M3 A036 to A049 and M4 T16 to T17 covers A050 to A054. The T18 table covers A055 to A057. These ranges identify implemented local checks, not a claim that every live or physical step in those scenarios passed.

| Gate           | Local evidence                                                                                                                                                                 | Remaining proof                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| M0, T00 to T04 | Flagged `/app` routes, tenant schema and RLS, durable jobs, physical items, indexed search and location scans; unit, isolated PostgreSQL, API and browser fixture checks pass. | Authenticated Supabase browser session, cross-device scan and permission checks.      |
| M1, T05 to T06 | Durable media schema, recoverable capture UI and replay-safe CSV import with local checks.                                                                                     | Live private Storage/TUS transfer and real phone capture.                             |
| M2, T07 to T10 | Bounded analysis with manual fallback, human fact/listing approval, assisted extension handoff and disabled official provider adapter; local contract checks pass.             | H02 provider access and H03 labelled model evaluation.                                |
| M3, T11 to T15 | Manual order, atomic reservation, pick, verified pack/handover, partial return and stocktake flows persist in isolated PostgreSQL. Fixture browser station checks pass.        | Live Auth/PostgREST, actual printer/scanner, carrier label and provider observations. |
| M4, T16 to T18 | Contribution and cohort calculations, team/privacy controls, integrated PostgreSQL journey, 20,000 item query fixture and database restore test.                               | Full live workflow, storage recovery, production scale p95 and seller benchmark.      |

## T18 acceptance

| Case | Result                              | Evidence or missing part                                                                                                                                                                                                                                                                                                |
| ---- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A055 | Partially verified                  | `journey.test.ts` persists CSV intake, a manifest and upload completion record, confirmed facts, approval, manual handoff, bundle sale, pick, pack, return and relist. Every SQL step uses a new connection. The binary upload, authenticated browser end-to-end path and external handoff are fixtures or unavailable. |
| A056 | Partially verified                  | `workspace.test.ts` loads 20,000 physical rows and records PostgreSQL query timings. Fixture browser tests check 390, 768 and 1440 CSS pixel layouts; the report checks keyboard focus. Warm staging p95, full API latency, physical scanner pending feedback and role views in live Auth remain unmeasured.            |
| A057 | Locally verified for database queue | `restore.test.ts` restores a data backup to a second disposable database, checks the queued job and dedupe key, then claims it. Production-mode demo guard has unit coverage. Full Storage backup/restore and production release review remain open.                                                                    |

## External gates

### Isolated staging evidence, 2026-09-27

The separate staging Supabase and Vercel projects have all OS schema, RLS, Storage and access migrations applied. A staging-only Auth user completed the real API and private Storage paths for workspace bootstrap, item creation, signed photo upload and read, phone pairing and upload grant, CSV preview and apply, listing approval, a synthetic manual order, reservation, pick, pack, private PDF label, handover, return and same-item restock. An unauthenticated API request was refused. A second staging-only Auth user saw an empty workspace list, was denied the first user's workspace API query, and could not directly read its private object. These were service-backed checks with synthetic data. They do not prove a seller, carrier, marketplace, physical device or payment integration. The exact steps and URLs are in `STAGING_TEST.md`.

The staging extension build uses a separate extension ID and staging Supabase Auth. Its source, syntax and unit checks pass. In isolated Chromium, its service worker loaded under the expected ID and the staging app's `OPS_HELLO` handshake returned the expected sign-in-required response. Owner Chrome installation and email sign-in remain device checks. H01 to H05 below remain open.

| ID  | Status     | Required evidence                                                                                                                                                                      |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H01 | Unverified | Record actual iPhone Safari/PWA, Android Chrome, keyboard scanner and label printer versions. Test capture/resume, barcode association, print, cancel and reprint on physical devices. |
| H02 | Unverified | Owner-approved eligible Vinted development account and written capability evidence for each enabled official operation. Keep the official adapter disabled without it.                 |
| H03 | Unverified | At least 100 permitted, owner-labelled real garments and approved API budget, then measured field accuracy, abstention, time and cost. Keep AI extraction disabled.                    |
| H04 | Unverified | Three consenting sellers and comparable ten-item and ten-order batches. Separate active admin time from walking, photos and provider delays. Measure correction rate.                  |
| H05 | Unverified | Owner approval of migration, rollback, scheduler, budget, retention, security, privacy and provider evidence. No production deployment is authorized by local checks.                  |

## Known limits

- The legacy API `verify:production` format stage fails on the unchanged `docs/superpowers/specs/2026-09-23-mobile-web-app-phase-1-design.md`; its other stages are run separately. This does not indicate an OS test failure.
- Supabase Storage policies, buckets, private signed upload/read and cross-user denial ran against the isolated staging service. Physical phone capture and full Storage backup/restore remain unverified.
- The official Vinted adapter has no verified account-specific capability. Manual handoff deliberately records an unverified marketplace state.
- Sale-time acquisition snapshots apply to new order lines after the migration. Older lines retain unknown historical acquisition basis.
- The performance fixture measures local PostgreSQL query execution, not HTTP p95, UI hydration or concurrent warehouse traffic.
- The Today queue uses an explicit ship-by time when a manual seller supplies one. Orders without that evidence show "Ship date not supplied". Official provider due dates and connection freshness still require H02 account verification.
- Inventory thumbnails are signed from the private derivative bucket through the server. A synthetic derivative signed read passed in staging; browser display on a physical device remains unverified.

## Release sequence after separate approval

1. Complete H01 to H04 and close their findings. Review every capability as supported, manual or disabled.
2. Back up and restore database plus private media in staging, verify counts and checksums, and exercise rollback with workers stopped.
3. Review migrations in dependency order, Auth/RLS, storage policies, credentials, budget, retention and scheduler cadence. Obtain H05 approval.
4. Roll out the feature flag to a consenting test workspace, monitor queue, exception, provider freshness and contribution coverage, then decide separately on wider release.
