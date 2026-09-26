# AutoLister OS local baseline

Recorded 26 September 2026. Local implementation only.

| Repository            | Base HEAD                                  | Starting state                                                                                                                            | Existing check                                                                                                                                                                                        |
| --------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quick-vint-api`      | `46b056a24e8de572acdfbc6f35dfd9f94111dee0` | `main` was ahead of origin by four commits, with unrelated modified and untracked growth documents. The OS worktree starts clean at HEAD. | `npm run verify:production` passed lint, type check and build, then failed format check on pre-existing `docs/superpowers/specs/2026-09-23-mobile-web-app-phase-1-design.md`. Tests were not reached. |
| `quick-vint-frontend` | `72cd36c0f265cf6724474a96523a90f483b6db5c` | Clean main.                                                                                                                               | `npm run verify:production`: 51 unit tests and 174 E2E tests passed; production extension build passed.                                                                                               |

The API/site uses Astro 5 static output with Vercel functions and one existing `/admin/:view` rewrite. Its migration directory is `migrations/`, not `supabase/migrations/`. The frontend is a separate Manifest V3 extension. Both OS branches are local `feature/autolister-os-build` worktrees; no production state was changed.

The T00 browser check uses Astro dev with the OS flag enabled and no auth credentials. It confirms scoped route handling and unauthenticated configuration state, not a working database session.
