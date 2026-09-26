# AutoLister OS decisions

- T00: Keep Astro static output and mount React only at `/app`. Known top-level app routes are static Astro files for local reloads; Vercel's `/app/:path*` rewrite handles deeper app paths. This avoids converting the public site to server rendering. A wrong rewrite would make deep links fail or capture public paths, so route tests cover both.
- T00: Put new SQL in the existing `migrations/` directory. The handoff's `supabase/migrations/` path was proposed, while this repository already uses `migrations/`.
- T00: Use `PUBLIC_OPS_ENABLED=1` only in the dedicated local `ops:dev` script. Production builds remain off until release approval. A wrong flag setting could expose an unfinished UI, so the route host renders a disabled state by default.
- T00: Reuse Supabase Auth on the browser side. The app passes only URL and anon key, never the service key. Server-side workspace authorization begins in T01.
