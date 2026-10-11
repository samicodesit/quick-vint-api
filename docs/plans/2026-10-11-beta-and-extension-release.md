# Web beta and separate extension release preparation

Authorization: prepare the web beta and separate extension rollout, proceeding
only when their release gates are satisfied. Preserve current limits, local
draft storage, production users and photo sourcing. Do not add a new service.

1. Read production schema metadata without reading customer rows or invoking
   generation/reservation RPCs. Check existing deployment flags and access.
2. Exercise the actual reservation, refund and commit migrations with the retry
   migrations in isolated native PostgreSQL. Test quotas, duplicate/concurrent
   requests, account/client fences and grants. Record production catalog gaps.
3. Prepare a private beta through existing preview protection when available.
   Keep the production app disabled until backend prerequisites and phone QA
   are verified. Do not silently expose the beta to every customer.
4. Prepare the next extension version and reproducible package independently.
   Verify the existing GitHub Actions release prerequisites. Do not submit a
   package against an incompatible backend or unresolved release gate.
5. Run required checks on the final release sources, record exact artifacts,
   rollback and unresolved dependencies, then proceed where evidence permits.
