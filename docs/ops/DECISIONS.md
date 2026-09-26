# AutoLister OS decisions

- T00: Keep Astro static output and mount React only at `/app`. Known top-level app routes are static Astro files for local reloads; Vercel's `/app/:path*` rewrite handles deeper app paths. This avoids converting the public site to server rendering. A wrong rewrite would make deep links fail or capture public paths, so route tests cover both.
- T00: Put new SQL in the existing `migrations/` directory. The handoff's `supabase/migrations/` path was proposed, while this repository already uses `migrations/`.
- T00: Use `PUBLIC_OPS_ENABLED=1` only in the dedicated local `ops:dev` script. Production builds remain off until release approval. A wrong flag setting could expose an unfinished UI, so the route host renders a disabled state by default.
- T00: Reuse Supabase Auth on the browser side. The app passes only URL and anon key, never the service key. Server-side workspace authorization begins in T01.
- T01: Bootstrap and workspace listing use the nil UUID in the gateway request because a workspace does not exist yet. All other operations require a real workspace ID. If this convention changes, only these two operation contracts and their callers need updating.
- T01: Database mutation, audit and idempotency for bootstrap live in one SQL function. The TypeScript command wrapper does not claim to make arbitrary multi-call services atomic; later commands must use equivalent transactional RPCs.
- T01: Integration tests use an isolated local PostgreSQL 12 cluster and simulate `auth.uid()` through a test-only JWT claim setting. This checks real RLS and constraints, but does not prove a live Supabase Auth or PostgREST round trip. That release gate remains open.
- T01: `ops:seed` accepts only a loopback PostgreSQL URL naming an `ops_test_` database and local/test mode. It inserts labelled fixture workspaces. This deliberately prevents accidental seeding of a production project.
